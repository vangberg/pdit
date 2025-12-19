/**
 * Centralized API client for all backend communication.
 * Handles token authentication and error handling automatically.
 */

import { getAuthToken, triggerAuthError } from './auth';

/**
 * Create headers with auth token for fetch requests.
 */
function createHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { ...additionalHeaders };

  if (token) {
    headers['X-Auth-Token'] = token;
  }

  return headers;
}

/**
 * Handle response errors, particularly 401 auth errors.
 */
function handleResponseError(response: Response): void {
  if (response.status === 401) {
    triggerAuthError();
  }
}

/**
 * Execute a Python script with SSE streaming.
 */
export async function executeScript(
  script: string,
  options: {
    sessionId: string;
    lineRange?: { from: number; to: number };
    scriptName?: string;
    reset?: boolean;
  }
): Promise<Response> {
  const headers = createHeaders({
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  });

  const response = await fetch('/api/execute-script', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      script,
      sessionId: options.sessionId,
      scriptName: options.scriptName,
      lineRange: options.lineRange,
      reset: options.reset,
    }),
  });

  if (!response.ok) {
    handleResponseError(response);
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response;
}

/**
 * Reset the execution namespace.
 */
export async function reset(): Promise<void> {
  const headers = createHeaders();

  const response = await fetch('/api/reset', {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    handleResponseError(response);
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

/**
 * Initialize a session to start kernel.
 */
export async function initSession(sessionId: string): Promise<Response> {
  const headers = createHeaders({
    'Content-Type': 'application/json',
  });

  const response = await fetch('/api/init-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    handleResponseError(response);
  }

  return response;
}

/**
 * Watch a file for changes via EventSource.
 * Note: EventSource doesn't support custom headers, so token is passed as query param.
 */
export function watchFile(path: string, sessionId: string): EventSource {
  const token = getAuthToken();
  const url = new URL('/api/watch-file', window.location.origin);
  url.searchParams.set('path', path);
  url.searchParams.set('sessionId', sessionId);

  if (token) {
    url.searchParams.set('token', token);
  }

  return new EventSource(url.toString());
}

/**
 * Save file content to disk.
 */
export async function saveFile(path: string, content: string): Promise<Response> {
  const headers = createHeaders({
    'Content-Type': 'application/json',
  });

  const response = await fetch('/api/save-file', {
    method: 'POST',
    headers,
    body: JSON.stringify({ path, content }),
  });

  if (!response.ok) {
    handleResponseError(response);
  }

  return response;
}

/**
 * List all Python files in current directory.
 */
export async function listFiles(): Promise<{ files: string[] }> {
  const headers = createHeaders();

  const response = await fetch('/api/list-files', { headers });

  if (!response.ok) {
    handleResponseError(response);
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
