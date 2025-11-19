import { describe, it, expect, beforeAll } from 'vitest';
import { initializePyodide, getPyodide } from './pyodide-instance';

describe('Package Management Investigation', () => {
  beforeAll(async () => {
    await initializePyodide();
  }, 30000);

  describe('micropip', () => {
    it('can load micropip', async () => {
      const pyodide = getPyodide();

      // micropip should be available in Pyodide
      await pyodide.loadPackage('micropip');

      const result = await pyodide.runPythonAsync(`
import micropip
'micropip loaded successfully'
`);

      expect(result).toBe('micropip loaded successfully');
    });

    it('can install a simple package', async () => {
      const pyodide = getPyodide();

      // Try installing a small pure-Python package
      await pyodide.loadPackage('micropip');

      const result = await pyodide.runPythonAsync(`
import micropip
await micropip.install('snowballstemmer')  # Small pure-Python package
import snowballstemmer
stemmer = snowballstemmer.stemmer('english')
stemmer.stemWords(['running', 'runs', 'ran'])
`);

      const words = result.toJs();
      expect(Array.isArray(words)).toBe(true);
      expect(words.length).toBe(3);
    });
  });

  describe('built-in packages', () => {
    it('can use built-in math module', async () => {
      const pyodide = getPyodide();

      const result = await pyodide.runPythonAsync(`
import math
math.sqrt(16)
`);

      expect(result).toBe(4);
    });

    it('can use built-in json module', async () => {
      const pyodide = getPyodide();

      const result = await pyodide.runPythonAsync(`
import json
data = {'name': 'test', 'value': 42}
json.dumps(data)
`);

      expect(result).toBe('{"name": "test", "value": 42}');
    });
  });

  describe('numpy and data science packages', () => {
    it('can load numpy', async () => {
      const pyodide = getPyodide();

      await pyodide.loadPackage('numpy');

      const result = await pyodide.runPythonAsync(`
import numpy as np
arr = np.array([1, 2, 3, 4, 5])
arr.mean()
`);

      expect(result).toBe(3);
    });

    it('can load pandas', async () => {
      const pyodide = getPyodide();

      await pyodide.loadPackage('pandas');

      const result = await pyodide.runPythonAsync(`
import pandas as pd
df = pd.DataFrame({'a': [1, 2, 3], 'b': [4, 5, 6]})
df['a'].sum()
`);

      expect(result).toBe(6);
    });
  });

  describe('matplotlib investigation', () => {
    it('can load matplotlib', async () => {
      const pyodide = getPyodide();

      // Load matplotlib
      await pyodide.loadPackage('matplotlib');

      const result = await pyodide.runPythonAsync(`
import matplotlib
matplotlib.__version__
`);

      expect(typeof result).toBe('string');
      expect(result).toMatch(/\d+\.\d+\.\d+/);
    });

    it('can import pyplot', async () => {
      const pyodide = getPyodide();

      await pyodide.loadPackage('matplotlib');

      const result = await pyodide.runPythonAsync(`
import matplotlib.pyplot as plt
'pyplot imported successfully'
`);

      expect(result).toBe('pyplot imported successfully');
    });

    it('can create a simple plot', async () => {
      const pyodide = getPyodide();

      await pyodide.loadPackage('matplotlib');

      const result = await pyodide.runPythonAsync(`
import matplotlib
import matplotlib.pyplot as plt
import io

# Create a simple plot
fig, ax = plt.subplots()
ax.plot([1, 2, 3, 4], [1, 4, 2, 3])
ax.set_title('Test Plot')

# Try to get figure info
{
    'has_figure': fig is not None,
    'figure_size': fig.get_size_inches().tolist(),
    'axes_count': len(fig.axes)
}
`);

      const info = result.toJs({ dict_converter: Object.fromEntries });
      expect(info.has_figure).toBe(true);
      expect(info.axes_count).toBe(1);
    });

    it('investigates matplotlib backend options', async () => {
      const pyodide = getPyodide();

      await pyodide.loadPackage('matplotlib');

      const result = await pyodide.runPythonAsync(`
import matplotlib
import matplotlib.pyplot as plt

# Get backend info
info = {
    'current_backend': matplotlib.get_backend(),
    'available_backends': matplotlib.rcsetup.all_backends,
}
info
`);

      const info = result.toJs({ dict_converter: Object.fromEntries });
      console.log('Matplotlib backend info:', info);

      expect(info.current_backend).toBeDefined();
      expect(Array.isArray(info.available_backends)).toBe(true);
    });

    it('investigates figure canvas to PNG conversion', async () => {
      const pyodide = getPyodide();

      await pyodide.loadPackage('matplotlib');

      const result = await pyodide.runPythonAsync(`
import matplotlib
import matplotlib.pyplot as plt
import io
import base64

# Create a simple plot
fig, ax = plt.subplots(figsize=(4, 3))
ax.plot([1, 2, 3], [1, 4, 2])

# Try to save to bytes
buf = io.BytesIO()
try:
    fig.savefig(buf, format='png')
    buf.seek(0)
    png_bytes = buf.read()
    png_base64 = base64.b64encode(png_bytes).decode('utf-8')
    {
        'success': True,
        'size': len(png_bytes),
        'has_data': len(png_base64) > 0,
        'data_preview': png_base64[:50]
    }
except Exception as e:
    {
        'success': False,
        'error': str(e)
    }
`);

      const info = result.toJs({ dict_converter: Object.fromEntries });
      console.log('PNG conversion result:', info);

      if (info.success) {
        expect(info.size).toBeGreaterThan(0);
        expect(info.has_data).toBe(true);
      } else {
        console.warn('PNG conversion failed:', info.error);
      }
    });
  });
});
