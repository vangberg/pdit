import { WebR } from 'webr';

// Singleton webR instance
let webRInstance: WebR | null = null;
let initializationPromise: Promise<void> | null = null;

// Canvas buffer that accumulates all drawing
let canvasBuffer: OffscreenCanvas | null = null;
let canvasContext: OffscreenCanvasRenderingContext2D | null = null;

// Image collection for expressions
let capturedImage: ImageBitmap | null = null;
let isCollecting = false;

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

    // Set persistent canvas device as default
    await webRInstance.evalRVoid(`
      options(device = function(...) {
        webr::canvas(width = 400, height = 300, bg = "white")
      })
    `);

    // Start message listener for canvas images
    startCanvasListener();

    console.log('webR initialized successfully');
  })();

  return initializationPromise;
}

/**
 * Start listening for canvas messages from webR
 */
function startCanvasListener() {
  if (!webRInstance) return;

  (async () => {
    for (;;) {
      try {
        const output = await webRInstance!.read();
        if (output.type === 'canvas') {
          if (output.data.event === 'canvasImage') {
            const image = output.data.image;

            // Initialize canvas buffer if needed
            if (!canvasBuffer) {
              canvasBuffer = new OffscreenCanvas(image.width, image.height);
              canvasContext = canvasBuffer.getContext('2d');
            }

            // Draw the image onto the buffer (accumulating state)
            if (canvasContext) {
              canvasContext.drawImage(image, 0, 0);
            }

            // If collecting, capture snapshot after this update
            if (isCollecting) {
              capturedImage = await createImageBitmap(canvasBuffer!);
            }
          } else if (output.data.event === 'canvasNewPage') {
            // Clear the buffer for a new plot
            if (canvasContext && canvasBuffer) {
              canvasContext.clearRect(0, 0, canvasBuffer.width, canvasBuffer.height);
            }
          }
        }
      } catch (error) {
        console.error('Canvas listener error:', error);
        break;
      }
    }
  })();
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

/**
 * Start collecting canvas images for the current expression
 */
export function startImageCollection(): void {
  capturedImage = null;
  isCollecting = true;
}

/**
 * Stop collecting and return captured image (snapshot of cumulative state)
 */
export function stopImageCollection(): ImageBitmap[] {
  isCollecting = false;
  const result = capturedImage ? [capturedImage] : [];
  capturedImage = null;
  return result;
}
