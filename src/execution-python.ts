import { getPyodide } from './pyodide-instance';
import { parseStatements } from './python-parser';

export interface OutputItem {
  type: 'stdout' | 'stderr' | 'error' | 'warning' | 'message';
  text: string;
}

export interface Expression {
  id: number;
  lineStart: number;
  lineEnd: number;
  result?: ExpressionResult;
}

export interface ExpressionResult {
  output: OutputItem[];
  images?: ImageBitmap[];
  isInvisible?: boolean;
}

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

/**
 * Execute Python code using Pyodide.
 * Parses the code into statements and executes them one at a time,
 * capturing output and line numbers for each statement.
 * Yields each result as it completes for streaming execution.
 *
 * @param script - The Python code to execute
 * @param options.lineRange - Optional line range to filter which statements to execute (1-based, inclusive)
 */
export async function* executeScript(
  script: string,
  options?: {
    lineRange?: { from: number; to: number };
  }
): AsyncGenerator<Expression, void, unknown> {
  try {
    // Parse script into statements
    const statements = await parseStatements(script);

    // Set up output capture
    await setupOutputCapture();

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
  } catch (error) {
    console.error('Error in executeScript:', error);
    throw error;
  }
}
