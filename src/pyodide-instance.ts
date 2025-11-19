import { loadPyodide, type PyodideInterface } from 'pyodide';

// Singleton Pyodide instance
let pyodideInstance: PyodideInterface | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the Pyodide instance.
 * This should be called once when the application starts.
 * Subsequent calls will return the same initialization promise.
 */
export async function initializePyodide(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    if (pyodideInstance) {
      return;
    }

    console.log('Initializing Pyodide...');
    pyodideInstance = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
    });

    console.log('Pyodide initialized successfully');
  })();

  return initializationPromise;
}

/**
 * Get the Pyodide instance.
 * Throws an error if Pyodide has not been initialized.
 */
export function getPyodide(): PyodideInterface {
  if (!pyodideInstance) {
    throw new Error('Pyodide has not been initialized. Call initializePyodide() first.');
  }
  return pyodideInstance;
}

/**
 * Check if Pyodide has been initialized.
 */
export function isPyodideInitialized(): boolean {
  return pyodideInstance !== null;
}
