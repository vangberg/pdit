import {
  getPyodide,
  startFigureCollection,
  stopFigureCollection,
  base64ToImageBitmap,
} from './pyodide-instance';

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
 * Parse Python code into logical statements with line numbers.
 * Uses Python's AST to get accurate statement boundaries.
 */
async function parseStatements(script: string): Promise<Array<{ code: string; lineStart: number; lineEnd: number }>> {
  const pyodide = getPyodide();

  try {
    // Use Python's AST to parse and get statement boundaries
    const result = pyodide.runPython(`
import ast

script = ${JSON.stringify(script)}

def parse_statements():
    try:
        tree = ast.parse(script)
        statements = []

        for node in tree.body:
            # Get the line range for this statement
            line_start = node.lineno
            line_end = node.end_lineno if hasattr(node, 'end_lineno') and node.end_lineno else node.lineno

            # Extract the code for this statement
            lines = script.split('\\n')
            code_lines = lines[line_start - 1:line_end]
            code = '\\n'.join(code_lines)

            statements.append({
                'code': code,
                'lineStart': line_start,
                'lineEnd': line_end
            })

        return statements
    except SyntaxError as e:
        # If there's a syntax error, treat entire script as one statement
        return [{
            'code': script,
            'lineStart': 1,
            'lineEnd': len(script.split('\\n'))
        }]

parse_statements()
`);

    return result.toJs({ dict_converter: Object.fromEntries });
  } catch (error) {
    // Fallback: treat entire script as one statement
    const lines = script.split('\n');
    return [{
      code: script,
      lineStart: 1,
      lineEnd: lines.length,
    }];
  }
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
  const pyodide = getPyodide();

  try {
    // Parse script into statements
    const statements = await parseStatements(script);

    // Set up output capture
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

    // Execute each statement
    for (const stmt of statements) {
      const { code, lineStart, lineEnd } = stmt;

      // Filter statements by line range if specified
      if (options?.lineRange) {
        const { from, to } = options.lineRange;
        // Skip statements that don't overlap with the requested range
        if (lineEnd < from || lineStart > to) {
          continue;
        }
      }

      // Start collecting figures
      startFigureCollection();

      // Reset output buffers
      await pyodide.runPythonAsync(`
_rdit_stdout = io.StringIO()
_rdit_stderr = io.StringIO()
sys.stdout = _rdit_stdout
sys.stderr = _rdit_stderr
`);

      const output: OutputItem[] = [];

      try {
        // Execute the statement
        // Try to eval as expression first (for REPL-like behavior), fall back to exec
        await pyodide.runPythonAsync(`
try:
    # Try to compile as eval (single expression)
    import ast
    code = ${JSON.stringify(code)}
    compiled = compile(code, '<string>', 'eval')
    result = eval(compiled)
    # Print result if it's not None (REPL behavior)
    if result is not None:
        print(repr(result))
except SyntaxError:
    # If eval fails, use exec (statement)
    code = ${JSON.stringify(code)}
    exec(code)
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

      // Stop collecting and get figures
      const figureBase64s = await stopFigureCollection();
      const images: ImageBitmap[] = [];

      // Convert base64 figures to ImageBitmaps
      for (const base64 of figureBase64s) {
        try {
          const bitmap = await base64ToImageBitmap(base64);
          images.push(bitmap);
        } catch (error) {
          console.error('Error converting figure to ImageBitmap:', error);
        }
      }

      // Determine if output is invisible
      // In Python, we consider output invisible if there's no stdout, stderr, or images
      const hasVisibleOutput = output.length > 0 || images.length > 0;

      yield {
        id: globalIdCounter++,
        lineStart,
        lineEnd,
        result: {
          output,
          images: images.length > 0 ? images : undefined,
          isInvisible: !hasVisibleOutput,
        },
      };
    }
  } catch (error) {
    console.error('Error in executeScript:', error);
    throw error;
  }
}
