/**
 * Main execution interface for Python code.
 * Uses Python server backend for local execution with SSE streaming.
 */

import { PythonServerBackend } from './execution-backend-python';

// Re-export types from backend
export type { OutputItem, Expression, ExpressionResult } from './execution-backend-python';

let pythonServerBackend: PythonServerBackend | null = null;

/**
 * Get or create the Python server backend instance.
 */
function getBackend(): PythonServerBackend {
  if (!pythonServerBackend) {
    // Check for python-server URL parameter
    const params = new URLSearchParams(window.location.search);
    const serverUrl = params.get('python-server') || 'http://127.0.0.1:8888';

    console.log('[Execution] Using Python server backend:', serverUrl);
    pythonServerBackend = new PythonServerBackend(serverUrl);
  }
  return pythonServerBackend;
}

/**
 * Execute Python code using the server backend.
 * Streams results as each statement completes.
 *
 * @param script - The Python code to execute
 * @param options.lineRange - Optional line range to filter which statements to execute (1-based, inclusive)
 */
export async function* executeScript(
  script: string,
  options?: {
    lineRange?: { from: number; to: number };
  }
) {
  const backend = getBackend();
  yield* backend.executeScript(script, options);
}

/**
 * Reset the execution namespace.
 */
export async function reset(): Promise<void> {
  const backend = getBackend();
  await backend.reset();
}
