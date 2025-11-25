# rdit

An interactive Python code editor with inline execution results.

This is a monorepo containing:
- **Python package** (`rdit/`) - FastAPI backend server for local Python execution
- **Web frontend** (`web/`) - React-based interactive editor

## Features

- **Local Python execution** - Full filesystem and package access via local FastAPI server
- **Interactive editor** - CodeMirror 6-based editor with Python syntax highlighting
- **Inline results** - Execution results displayed inline next to code
- **Execute with Cmd+Enter** - Quick code execution
- **Jupyter-like workflow** - Persistent namespace across code executions
- **CLI tool** - Single command to start server and open browser

## Quick Start

Install the Python package:

```bash
pip install -e .
```

Build the frontend:

```bash
cd web && npm install && npm run build
```

Start rdit with a Python file:

```bash
rdit path/to/script.py
```

This will:
1. Start the FastAPI server on port 8888
2. Open your browser automatically
3. Load the script file in the editor
4. Execute code with Cmd+Enter

## Project Structure

```
rdit/                   # Python package
  __init__.py          # Package exports
  executor.py          # Core Python execution logic (213 lines)
  server.py            # FastAPI server with API endpoints (180 lines)
  cli.py               # Command-line interface (98 lines)
tests/                  # Python tests (44 tests passing)
  test_executor.py     # Executor tests (32 tests)
  test_server.py       # Server API tests (12 tests)
web/                    # TypeScript/React frontend
  src/
    App.tsx            # Main application component
    Editor.tsx         # CodeMirror editor
    execution-python.ts # Python execution client
    ...
  package.json
  vite.config.ts
pyproject.toml          # Python packaging config
```

## Python Backend Server

The Python backend provides a FastAPI server for local code execution with full filesystem and package access.

### API Endpoints

- `POST /api/execute-script` - Execute a Python script with optional line range filtering
- `GET /api/read-file` - Read a file from the filesystem
- `POST /api/reset` - Clear the execution namespace
- `GET /api/health` - Health check endpoint

### CLI Usage

Start server with a script file:

```bash
rdit script.py
```

Options:

```bash
rdit [OPTIONS] [SCRIPT]

Options:
  --port INTEGER       Port to run server on (default: 8888)
  --host TEXT         Host to bind to (default: 127.0.0.1)
  --no-browser        Don't open browser automatically
  --help              Show help message
```

Examples:

```bash
# Start with script
rdit analysis.py

# Custom port
rdit --port 9000 script.py

# Start without opening browser
rdit --no-browser script.py
```

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

Run all tests:

```bash
pytest
```

Run specific test file:

```bash
python tests/test_executor.py
python tests/test_server.py
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

### Python Backend
- Python 3.8+
- FastAPI 0.104+ (API framework)
- uvicorn 0.24+ (ASGI server)
- Click 8.0+ (CLI framework)

### Web Frontend
- React 19
- CodeMirror 6
- Vite 5
- TypeScript

## Architecture

rdit uses a client-server architecture:

1. **CLI** (`rdit/cli.py`) - Starts the FastAPI server and opens browser
2. **Server** (`rdit/server.py`) - Provides REST API for code execution and file reading
3. **Executor** (`rdit/executor.py`) - Handles Python code parsing and execution with persistent namespace
4. **Frontend** (`web/`) - React app that sends code to server and displays results

The server maintains a persistent Python namespace across requests, similar to Jupyter notebooks.

## Security Note

The `/api/read-file` endpoint currently allows reading any file the server has access to. Path validation should be added for production use. See issue `rdit-mit` for details.

## License

Private
