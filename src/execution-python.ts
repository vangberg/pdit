import { parseStatements } from './python-parser';
import { PyodideBackend } from './execution-backend-pyodide';
import { PythonServerBackend } from './execution-backend-python';
import type { ExecutionBackend, Statement } from './execution-backend';

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

// Singleton backends
let pyodideBackend: PyodideBackend | null = null;
let pythonServerBackend: PythonServerBackend | null = null;
let backendCheckPromise: Promise<ExecutionBackend> | null = null;

/**
 * Get the appropriate execution backend.
 * Checks if Python server is available, otherwise falls back to Pyodide.
 */
async function getBackend(): Promise<ExecutionBackend> {
  // Return cached promise if already checking
  if (backendCheckPromise) {
    return backendCheckPromise;
  }

  backendCheckPromise = (async () => {
    // Check for Python server via URL parameter or default
    const params = new URLSearchParams(window.location.search);
    const serverUrl = params.get('python-server') || 'http://127.0.0.1:8888';

    // Try Python server first
    if (!pythonServerBackend) {
      pythonServerBackend = new PythonServerBackend(serverUrl);
    }

    const isServerAvailable = await pythonServerBackend.isAvailable();

    if (isServerAvailable) {
      console.log('Using Python server backend');
      return pythonServerBackend;
    }

    // Fall back to Pyodide
    console.log('Python server not available, using Pyodide backend');
    if (!pyodideBackend) {
      pyodideBackend = new PyodideBackend();
    }
    return pyodideBackend;
  })();

  return backendCheckPromise;
}

/**
 * Execute Python code using the appropriate backend.
 * Automatically detects if Python server is available, otherwise uses Pyodide.
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
    const backend = await getBackend();

    // For Python server, we can send the script directly
    if (backend instanceof PythonServerBackend) {
      yield* backend.executeScript(script, options);
      return;
    }

    // For Pyodide, we need to parse statements first
    const statements = await parseStatements(script);

    // Convert to Statement objects with code
    const statementsWithCode: Statement[] = statements.map(stmt => ({
      ...stmt,
      code: '', // Code is already compiled in Pyodide
      isExpr: false, // Will be determined during execution
    }));

    yield* backend.executeStatements(statementsWithCode, options);
  } catch (error) {
    console.error('Error in executeScript:', error);
    throw error;
  }
}
