# rdit

A modern, reactive notebook for Python and R, inspired by Observable.

## Features

- **Multiple execution backends**:
  - **Python (Pyodide)** - Run Python in the browser using WebAssembly
  - **Python (Local)** - Run Python locally with full access to your filesystem and packages
  - **R (WebR)** - Run R code in the browser using WebAssembly
- **Interactive editor** - CodeMirror 6-based editor with syntax highlighting
- **Inline results** - Execution results displayed inline next to code
- **Visualizations** - Support for plots and graphics
- **Execute with Cmd+Enter** - Quick code execution
- **Reactive execution** - Observable-style automatic re-execution on edits

## Tech Stack

- React 19
- CodeMirror 6
- Python backends:
  - Pyodide (browser-based)
  - FastAPI server (local execution)
- WebR 0.5.6 (R in WebAssembly)
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

### Running with Local Python Backend

To use rdit with local Python execution (access to local files and packages):

1. Install the Python package:

```bash
cd python
pip install -e .
```

2. Run rdit with a Python script:

```bash
rdit path/to/your/script.py
```

Or using `uvx` without installation:

```bash
cd python
uvx --from . rdit path/to/your/script.py
```

This will:
- Start a local FastAPI server on port 8888
- Open your browser with the rdit interface
- Execute Python code locally with access to your filesystem and installed packages

The frontend will automatically detect the local Python server and use it instead of Pyodide.

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
  App.tsx                       # Main application component
  Editor.tsx                    # CodeMirror editor component
  execution.ts                  # Execution orchestration
  execution-python.ts           # Python execution logic
  execution-backend.ts          # Backend interface
  execution-backend-pyodide.ts  # Pyodide (browser) backend
  execution-backend-python.ts   # Python server (local) backend
  python-parser.ts              # Python AST parser for Pyodide
  pyodide-instance.ts           # Pyodide initialization
  compute-line-groups.ts        # Result grouping algorithm
  results.ts                    # Result store management
  webr-instance.ts              # WebR initialization

python/
  src/rdit/
    __init__.py         # Package initialization
    server.py           # FastAPI server for local Python execution
    cli.py              # CLI entry point
  pyproject.toml        # Python package configuration
  test_script.py        # Example test script
```

## License

Private
