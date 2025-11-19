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

    // Install matplotlib and dependencies for plotting support
    await pyodideInstance.loadPackage(['numpy', 'matplotlib']);

    // Set up matplotlib backend and configure figure capture
    await pyodideInstance.runPythonAsync(`
import sys
import io
import base64
import warnings
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Suppress the "non-GUI backend" warning since we're intentionally using Agg
warnings.filterwarnings('ignore', message='.*non-GUI backend.*')

# Storage for captured figures
_rdit_captured_figures = []

def _rdit_capture_current_figures():
    """Capture all current matplotlib figures as base64 PNG strings and clear them"""
    global _rdit_captured_figures
    figures = []

    for fignum in plt.get_fignums():
        fig = plt.figure(fignum)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        figures.append(img_base64)
        buf.close()

    # Clear all figures after capturing
    plt.close('all')

    return figures

# Override plt.show() to capture figures instead of trying to display
_original_show = plt.show

def _rdit_show(*args, **kwargs):
    """Custom show() that captures figures for display in the UI"""
    global _rdit_captured_figures
    _rdit_captured_figures = _rdit_capture_current_figures()

plt.show = _rdit_show

def _rdit_get_captured_figures():
    """Get and clear captured figures"""
    global _rdit_captured_figures
    figs = _rdit_captured_figures
    _rdit_captured_figures = []
    return figs
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
 * Get any figures that were captured via plt.show()
 */
export function getCapturedFigures(): string[] {
  if (!pyodideInstance) {
    return [];
  }

  try {
    const figures = pyodideInstance.runPython(`_rdit_get_captured_figures()`);
    const result = figures.toJs() as string[];
    return Array.from(result);
  } catch (error) {
    console.error('Error getting captured figures:', error);
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
