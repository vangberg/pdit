import { WebR } from 'webr';

// Singleton webR instance
let webRInstance: WebR | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the webR instance.
 * This should be called once when the application starts.
 * Subsequent calls will return the same initialization promise.
 */
export async function initializeWebR(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    if (webRInstance) {
      return;
    }

    console.log('Initializing webR...');
    webRInstance = new WebR();

    await webRInstance.init();
    console.log('webR initialized successfully');
  })();

  return initializationPromise;
}

/**
 * Get the webR instance.
 * Throws an error if webR has not been initialized.
 */
export function getWebR(): WebR {
  if (!webRInstance) {
    throw new Error('webR has not been initialized. Call initializeWebR() first.');
  }
  return webRInstance;
}

/**
 * Check if webR has been initialized.
 */
export function isWebRInitialized(): boolean {
  return webRInstance !== null;
}
