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

export type BackendType = 'pyodide' | 'python-server';

// Singleton backends
let pyodideBackend: PyodideBackend | null = null;
let pythonServerBackend: PythonServerBackend | null = null;
let currentBackendType: BackendType = 'pyodide';

/**
 * Set the backend type to use for execution.
 */
export function setBackendType(type: BackendType): void {
  console.log('[Backend] Setting backend type to:', type);
  currentBackendType = type;
}

/**
 * Get the current backend type.
 */
export function getBackendType(): BackendType {
  return currentBackendType;
}

/**
 * Get the backend instance for the selected type.
 */
function getBackend(): ExecutionBackend {
  if (currentBackendType === 'python-server') {
    if (!pythonServerBackend) {
      const params = new URLSearchParams(window.location.search);
      const serverUrl = params.get('python-server') || 'http://127.0.0.1:8888';
      pythonServerBackend = new PythonServerBackend(serverUrl);
      console.log('[Backend] Created Python server backend at', serverUrl);
    }
    return pythonServerBackend;
  } else {
    if (!pyodideBackend) {
      pyodideBackend = new PyodideBackend();
      console.log('[Backend] Created Pyodide backend');
    }
    return pyodideBackend;
  }
}

/**
 * Check if the Python server is available.
 */
export async function checkPythonServer(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const serverUrl = params.get('python-server') || 'http://127.0.0.1:8888';

  if (!pythonServerBackend) {
    pythonServerBackend = new PythonServerBackend(serverUrl);
  }

  return await pythonServerBackend.isAvailable();
}

/**
 * Execute Python code using the selected backend.
 * Uses either Pyodide or Python server based on current backend type.
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
    const backend = getBackend();
    console.log('[Execution] Using backend:', currentBackendType);

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
