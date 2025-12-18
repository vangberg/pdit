/**
 * Main execution interface for Python code.
 * Uses Python server backend for local execution with SSE streaming.
 */

import { PythonServerBackend } from './execution-backend-python';

// Re-export types from backend
export type { OutputItem, Expression, ExpressionResult, ExecutionEvent, ExpressionState } from './execution-backend-python';

const backend = new PythonServerBackend();

/**
 * Execute Python code using the server backend.
 * Streams results as each statement completes.
 *
 * @param script - The Python code to execute
 * @param options.sessionId - Session ID for execution environment
 * @param options.lineRange - Optional line range to filter which statements to execute (1-based, inclusive)
 * @param options.scriptName - Optional script name for output context
 * @param options.reset - Optional flag to reset the execution environment before running
 */
export async function* executeScript(
  script: string,
  options: {
    sessionId: string;
    lineRange?: { from: number; to: number };
    scriptName?: string;
    reset?: boolean;
  }
) {
  yield* backend.executeScript(script, options);
}

/**
 * Reset the execution namespace.
 */
export async function reset(): Promise<void> {
  await backend.reset();
}
