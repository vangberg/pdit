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

/**
 * Load matplotlib package if not already loaded.
 * This is a helper function to ensure matplotlib is available before plotting.
 */
export async function ensureMatplotlib(): Promise<void> {
  const pyodide = getPyodide();

  // Check if matplotlib is already loaded
  const isLoaded = await pyodide.runPythonAsync(`
try:
    import matplotlib
    True
except ImportError:
    False
`);

  if (!isLoaded) {
    console.log('Loading matplotlib...');
    await pyodide.loadPackage('matplotlib');
    console.log('Matplotlib loaded successfully');
  }
}

/**
 * Convert matplotlib figures to PNG base64 strings.
 * This function should be called after plot creation to capture figures.
 *
 * @returns Array of base64-encoded PNG images
 */
export async function capturePlots(): Promise<string[]> {
  const pyodide = getPyodide();

  try {
    const result = await pyodide.runPythonAsync(`
import matplotlib.pyplot as plt
import io
import base64

# Get all figure managers
figures = []
for fig_num in plt.get_fignums():
    fig = plt.figure(fig_num)

    # Convert to PNG bytes
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    buf.seek(0)
    png_bytes = buf.read()
    buf.close()

    # Encode as base64
    png_base64 = base64.b64encode(png_bytes).decode('utf-8')
    figures.append(png_base64)

# Close all figures to free memory
plt.close('all')

figures
`);

    if (!result) {
      return [];
    }

    return result.toJs() as string[];
  } catch (error) {
    console.error('Error capturing plots:', error);
    return [];
  }
}

/**
 * Convert base64 PNG string to ImageBitmap.
 *
 * @param base64 - Base64-encoded PNG image
 * @returns ImageBitmap suitable for canvas rendering
 */
export async function base64ToImageBitmap(base64: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const bitmap = await createImageBitmap(img);
        resolve(bitmap);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = reject;
    img.src = `data:image/png;base64,${base64}`;
  });
}

/**
 * Helper to load a package via micropip.
 *
 * @param packageName - Name of the package to install from PyPI
 */
export async function installPackage(packageName: string): Promise<void> {
  const pyodide = getPyodide();

  console.log(`Installing package: ${packageName}...`);

  // Load micropip if needed
  await pyodide.loadPackage('micropip');

  // Install the package
  await pyodide.runPythonAsync(`
import micropip
await micropip.install('${packageName}')
`);

  console.log(`Package ${packageName} installed successfully`);
}
