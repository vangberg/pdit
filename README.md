# rdit

An interactive code editor powered by WebAssembly, running entirely in the browser.

## Supported Languages

### R (Production)
- Powered by WebR 0.5.6
- Full R execution with plotting support
- See `src/execution.ts` and `src/webr-instance.ts`

### Python (Prototype)
- Powered by Pyodide 0.26.4
- Full Python execution with standard library
- REPL-style expression evaluation
- Package management via micropip and pyodide.loadPackage()
- Matplotlib plotting support (PNG export via BytesIO)
- See `src/execution-python.ts` and `src/pyodide-instance.ts`

## Features

- **Browser-based execution** - Run code without server-side infrastructure using WebAssembly
- **Interactive editor** - CodeMirror 6-based editor with syntax highlighting
- **Inline results** - Execution results displayed inline next to code
- **Streaming execution** - Results appear as each statement completes
- **Line range execution** - Execute current line/selection with Cmd+Enter
- **Visualizations** - Support for plots and graphics (R only currently)

## Tech Stack

- React 19
- CodeMirror 6
- WebR 0.5.6 (R in WebAssembly)
- Pyodide 0.26.4 (Python in WebAssembly)
- Vite 5
- TypeScript

## Getting Started

### Prerequisites

- Node.js (v20 or higher recommended)
- npm

### Installation

```bash
npm install
```

### Development

Start the development server:

```bash
npm run dev
```

The app will open automatically in your browser with hot module replacement enabled.

### Build

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Testing

The project uses Vitest with browser mode (Chromium) for testing.

### Running Tests

Run tests in watch mode (interactive):

```bash
npm test
```

Run tests once (CI mode):

```bash
npm test -- --run
```

### Browser Requirements

Tests run in a real Chromium browser environment using Playwright. The first time you run tests, Playwright will download the necessary browser binaries automatically. If you need to manually install browsers:

```bash
npx playwright install chromium
```

### Writing Tests

Tests are located alongside source files with the `.test.ts` or `.test.tsx` extension:

```
src/
  compute-line-groups.ts
  compute-line-groups.test.ts  # Test file
```

Test files are automatically discovered by the pattern `src/**/*.test.{ts,tsx}`.

## Project Structure

```
src/
  App.tsx                    # Main application component
  Editor.tsx                 # CodeMirror editor component

  # R execution (production)
  execution.ts               # WebR execution logic
  webr-instance.ts           # WebR initialization

  # Python execution (prototype)
  execution-python.ts        # Pyodide execution logic
  pyodide-instance.ts        # Pyodide initialization

  # Shared components
  compute-line-groups.ts     # Result grouping algorithm
  results.ts                 # Result store management
  result-grouping-plugin.ts  # CodeMirror plugin for result display
```

## Python/Pyodide Prototype Status

The Python implementation is a **working prototype** with the following status:

### ✅ Implemented
- Core Python execution with Pyodide
- AST-based statement parsing for accurate line tracking
- REPL-style behavior (auto-prints expression values)
- Output capture (stdout/stderr)
- Error handling and reporting
- Line range filtering (execute current line/selection)
- Streaming execution (yields results as they complete)
- Built-in standard library modules
- Matplotlib plotting support via PNG export
- Package management helpers (ensureMatplotlib, installPackage)
- Image capture and conversion (base64ToImageBitmap)

### ⚠️ Known Limitations
- Tests not yet run in CI (browser environment required)
- Large packages (numpy, pandas) increase initial load time
- Matplotlib backend uses PNG export (not HTML5 canvas)
- No package caching UI (packages reload on page refresh)

### 📦 Package Management

Pyodide supports package installation via micropip:

```python
# Load micropip
import micropip
await micropip.install('package-name')
```

Many popular packages are pre-built for Pyodide:
- numpy, pandas, scipy
- matplotlib (available but rendering not implemented)
- scikit-learn
- See full list: https://pyodide.org/en/stable/usage/packages-in-pyodide.html

### 🎨 Matplotlib Status

✅ **Implemented** - Matplotlib plotting is now functional!

**Implementation approach**:
1. **Capture method**: PNG export via `BytesIO` buffer
2. **Conversion**: Base64 encoding → Image element → ImageBitmap
3. **Integration**: Automatic capture after each statement execution
4. **Memory management**: Figures automatically closed after capture with `plt.close('all')`

**Usage example**:
```python
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 2*np.pi, 100)
plt.plot(x, np.sin(x))
plt.title('Sine Wave')
```

The plot will appear inline in the editor, just like R plots!

**Helper functions** (in `pyodide-instance.ts`):
- `ensureMatplotlib()` - Load matplotlib if not already loaded
- `capturePlots()` - Capture all open figures as PNG base64
- `base64ToImageBitmap()` - Convert PNG data to ImageBitmap
- `installPackage()` - Install packages via micropip

**Comparison with R**:
- R: Uses WebR's graphics device (canvas-based capture)
- Python: Uses matplotlib's PNG export (buffer-based capture)
- Both produce ImageBitmap objects for consistent rendering

## License

Private
