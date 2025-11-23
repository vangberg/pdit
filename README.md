# rdit

An interactive Python code editor with inline execution results.

This is a monorepo containing:
- **Python package** (`rdit/`) - Core Python execution infrastructure
- **Web frontend** (`web/`) - Browser-based editor powered by Pyodide

## Features

- **Browser-based Python execution** - Run Python code without server-side infrastructure using WebAssembly
- **Interactive editor** - CodeMirror 6-based editor with Python syntax highlighting
- **Inline results** - Execution results displayed inline next to code
- **Execute with Cmd+Enter** - Quick code execution

## Project Structure

```
rdit/                   # Python package
  __init__.py
tests/                  # Python tests
web/                    # TypeScript/React frontend
  src/
    App.tsx
    Editor.tsx
    execution-python.ts
    python-parser.ts
    ...
  package.json
  vite.config.ts
pyproject.toml          # Python packaging config
```

## Python Package

### Installation

Install from source:

```bash
pip install -e .
```

Install with dev dependencies:

```bash
pip install -e ".[dev]"
```

### Running Python Tests

```bash
pytest
```

## Web Frontend

### Prerequisites

- Node.js (v20 or higher recommended)
- npm

### Installation

```bash
cd web
npm install
```

### Development

Start the development server:

```bash
cd web
npm run dev
```

The app will open automatically in your browser with hot module replacement enabled.

### Build

Build for production:

```bash
cd web
npm run build
```

Preview the production build:

```bash
cd web
npm run preview
```

### Testing

The web frontend uses Vitest with browser mode (Chromium) for testing.

Run tests in watch mode:

```bash
cd web
npm test
```

Run tests once (CI mode):

```bash
cd web
npm test -- --run
```

#### Browser Requirements

Tests run in a real Chromium browser environment using Playwright. The first time you run tests, Playwright will download the necessary browser binaries automatically. If you need to manually install browsers:

```bash
npx playwright install chromium
```

## Tech Stack

### Python Package
- Python 3.8+

### Web Frontend
- React 19
- CodeMirror 6
- Pyodide 0.26+ (Python in WebAssembly)
- Vite 5
- TypeScript

## License

Private
