/**
 * Pyodide backend for browser-based Python execution.
 */

import { getPyodide } from './pyodide-instance';
import type {
  ExecutionBackend,
  Expression,
  ExpressionResult,
  OutputItem,
  Statement
} from './execution-backend';

let globalIdCounter = 1;

/**
 * Initialize output capture infrastructure in Python.
 * Sets up StringIO buffers for stdout/stderr redirection.
 */
async function setupOutputCapture(): Promise<void> {
  const pyodide = getPyodide();
  await pyodide.runPythonAsync(`
import sys
import io

# Create output buffers
_rdit_stdout = io.StringIO()
_rdit_stderr = io.StringIO()

# Save original stdout/stderr
_rdit_original_stdout = sys.stdout
_rdit_original_stderr = sys.stderr
`);
}

/**
 * Reset output buffers and redirect stdout/stderr.
 */
async function resetOutputBuffers(): Promise<void> {
  const pyodide = getPyodide();
  await pyodide.runPythonAsync(`
_rdit_stdout = io.StringIO()
_rdit_stderr = io.StringIO()
sys.stdout = _rdit_stdout
sys.stderr = _rdit_stderr
`);
}

/**
 * Execute a single compiled statement and capture its output.
 */
async function executeStatement(nodeIndex: number): Promise<OutputItem[]> {
  const pyodide = getPyodide();
  const output: OutputItem[] = [];

  try {
    // Execute the pre-compiled statement
    await pyodide.runPythonAsync(`
node_info = _rdit_compiled_nodes[${nodeIndex}]
compiled = node_info['compiled']
is_expr = node_info['is_expr']

# Always use eval() since code is compiled
result = eval(compiled)

# For expressions, print result if not None
if is_expr and result is not None:
    print(repr(result))
`);
  } catch (error: any) {
    // Capture error message
    const errorMessage = error.message || String(error);
    output.push({
      type: 'error',
      text: errorMessage,
    });
  }

  // Restore stdout/stderr and get captured output
  const stdoutContent = await pyodide.runPythonAsync(`
sys.stdout = _rdit_original_stdout
sys.stderr = _rdit_original_stderr
_rdit_stdout.getvalue()
`);

  const stderrContent = await pyodide.runPythonAsync(`
_rdit_stderr.getvalue()
`);

  // Add stdout output
  if (stdoutContent && stdoutContent.length > 0) {
    output.push({
      type: 'stdout',
      text: stdoutContent as string,
    });
  }

  // Add stderr output
  if (stderrContent && stderrContent.length > 0) {
    output.push({
      type: 'stderr',
      text: stderrContent as string,
    });
  }

  return output;
}

export class PyodideBackend implements ExecutionBackend {
  private isInitialized = false;

  async *executeStatements(
    statements: Statement[],
    options?: {
      lineRange?: { from: number; to: number };
    }
  ): AsyncGenerator<Expression, void, unknown> {
    if (!this.isInitialized) {
      await setupOutputCapture();
      this.isInitialized = true;
    }

    // Execute each statement
    for (const stmt of statements) {
      const { nodeIndex, lineStart, lineEnd } = stmt;

      // Filter statements by line range if specified
      if (options?.lineRange) {
        const { from, to } = options.lineRange;
        // Skip statements that don't overlap with the requested range
        if (lineEnd < from || lineStart > to) {
          continue;
        }
      }

      // Reset output buffers
      await resetOutputBuffers();

      // Execute statement and capture output
      const output = await executeStatement(nodeIndex);

      // Determine if output is invisible
      // In Python, we consider output invisible if there's no stdout or stderr
      const hasVisibleOutput = output.length > 0;

      yield {
        id: globalIdCounter++,
        lineStart,
        lineEnd,
        result: {
          output,
          isInvisible: !hasVisibleOutput,
        },
      };
    }
  }

  async reset(): Promise<void> {
    this.isInitialized = false;
    const pyodide = getPyodide();

    // Clear the execution namespace
    await pyodide.runPythonAsync(`
import sys
# Clear user-defined variables, keep built-ins
user_vars = [k for k in dir() if not k.startswith('_') and k not in dir(__builtins__)]
for var in user_vars:
    del globals()[var]
`);
  }
}
