/**
 * Authentication token management.
 * Handles extracting token from URL, storing in localStorage, and providing it for API calls.
 */

const TOKEN_STORAGE_KEY = 'pdit_auth_token';

// Global auth error callback - will be set by the app
let authErrorCallback: ((hasError: boolean) => void) | null = null;

/**
 * Set the global auth error callback.
 * This is called by the app to register the error handler.
 */
export function setAuthErrorCallback(callback: (hasError: boolean) => void): void {
  authErrorCallback = callback;
}

/**
 * Trigger auth error state.
 * Called when a 401 response is received.
 * Clears the stale token so user can refresh with new URL.
 */
export function triggerAuthError(): void {
  clearAuthToken(); // Clear stale token from localStorage
  if (authErrorCallback) {
    authErrorCallback(true);
  }
}

/**
 * Get the auth token from localStorage.
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

/**
 * Store the auth token in localStorage.
 */
export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

/**
 * Remove the auth token from localStorage.
 */
export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Extract token from URL parameters and store it.
 * Returns true if token was found and stored.
 */
export function extractAndStoreToken(): boolean {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (token) {
    setAuthToken(token);
    return true;
  }

  return false;
}

/**
 * Remove token from URL without navigation.
 */
export function removeTokenFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url);
}
