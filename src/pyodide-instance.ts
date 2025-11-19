import { loadPyodide, type PyodideInterface } from 'pyodide';

// Singleton Pyodide instance
let pyodideInstance: PyodideInterface | null = null;
let initializationPromise: Promise<void> | null = null;

// Matplotlib figure capture (for future use)
// let capturedFigures: string[] = [];
// let isCollectingFigures = false;

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

    // Install plotnine and dependencies for plotting support
    await pyodideInstance.loadPackage(['numpy', 'pandas', 'matplotlib']);

    // Install plotnine via micropip
    await pyodideInstance.runPythonAsync(`
import micropip
await micropip.install('plotnine')
`);

    // Set up matplotlib backend and configure figure capture for plotnine
    await pyodideInstance.runPythonAsync(`
import sys
import io
import base64
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Store for captured figures
_rdit_figures = []
_rdit_collecting = False

def _rdit_capture_figures():
    """Capture all current matplotlib figures as base64 PNG strings"""
    global _rdit_figures
    figures = []
    for fignum in plt.get_fignums():
        fig = plt.figure(fignum)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        figures.append(img_base64)
        buf.close()
    return figures

def _rdit_clear_figures():
    """Clear all matplotlib figures"""
    plt.close('all')
`);

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
 * Start collecting matplotlib figures for the current expression
 */
export function startFigureCollection(): void {
  // capturedFigures = [];
  // isCollectingFigures = true;
}

/**
 * Stop collecting and return captured figures as base64 PNG strings
 */
export async function stopFigureCollection(): Promise<string[]> {
  // isCollectingFigures = false;

  if (!pyodideInstance) {
    return [];
  }

  try {
    // Capture any figures created during execution
    const figures = pyodideInstance.runPython(`_rdit_capture_figures()`);
    const result = figures.toJs() as string[];

    // Clear figures after capture
    await pyodideInstance.runPythonAsync(`_rdit_clear_figures()`);

    return Array.from(result);
  } catch (error) {
    console.error('Error capturing figures:', error);
    return [];
  }
}

/**
 * Convert base64 PNG string to ImageBitmap
 */
export async function base64ToImageBitmap(base64: string): Promise<ImageBitmap> {
  const response = await fetch(`data:image/png;base64,${base64}`);
  const blob = await response.blob();
  return createImageBitmap(blob);
}
