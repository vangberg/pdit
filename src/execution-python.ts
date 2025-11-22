/**
 * Python execution using local Python server backend.
 */

import { PythonServerBackend } from './execution-backend-python';

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

// Singleton backend
let pythonServerBackend: PythonServerBackend | null = null;

/**
 * Get the Python server backend instance.
 */
function getBackend(): PythonServerBackend {
  if (!pythonServerBackend) {
    const params = new URLSearchParams(window.location.search);
    const serverUrl = params.get('python-server') || 'http://127.0.0.1:8888';
    pythonServerBackend = new PythonServerBackend(serverUrl);
    console.log('[Backend] Created Python server backend at', serverUrl);
  }
  return pythonServerBackend;
}

/**
 * Check if the Python server is available.
 */
export async function checkPythonServer(): Promise<boolean> {
  const backend = getBackend();
  return await backend.isAvailable();
}

/**
 * Execute Python code using the local Python server backend.
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
    console.log('[Execution] Using Python server backend');

    yield* backend.executeScript(script, options);
  } catch (error) {
    console.error('Error in executeScript:', error);
    throw error;
  }
}
