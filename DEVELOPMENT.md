# Development Guide

This guide covers how to set up and develop rdit from the git repository.

## Quick Start

```bash
# Install Python dependencies with uv
uv pip install -e .

# Build the frontend
cd web
npm install
npm run build
cd ..

# Run rdit
rdit tests/test_executor.py
```

## Python Backend Setup

### Using uv (recommended)

Install the package in editable mode:

```bash
uv pip install -e .
```

This installs:
- `fastapi>=0.104.0` - API framework
- `uvicorn[standard]>=0.24.0` - ASGI server
- `click>=8.0.0` - CLI framework
- `aiofiles>=23.0.0` - Async file operations

And creates the `rdit` command that runs `rdit.cli:main`.

### Using pip

```bash
pip install -e .
```

### Install with dev dependencies

For testing and development tools:

```bash
uv pip install -e ".[dev]"
# or
pip install -e ".[dev]"
```

Dev dependencies include:
- `pytest>=7.0` - Testing framework
- `pytest-asyncio>=0.21.0` - Async test support
- `black>=23.0` - Code formatter
- `mypy>=1.0` - Type checker
- `ruff>=0.1.0` - Linter

## Frontend Setup

The frontend is a React app built with Vite.

### Install dependencies

```bash
cd web
npm install
```

### Build for production

Build the static files that the Python server will serve:

```bash
cd web
npm run build
```

This creates `web/dist/` with the production build.

**IMPORTANT**: Built assets are committed to git so users can run `uv run rdit` without Node.js. Before committing frontend changes, always rebuild:

```bash
cd web && npm run build && cd ..
git add web/ web/dist/
git commit -m "Update web UI"
```

### Development mode

For frontend development with hot reloading:

```bash
cd web
npm run dev
```

This starts the Vite dev server on port 5173. The dev server is configured to proxy `/api` requests to the Python backend (port 8888), so you need to have the backend running as well.

## Running rdit

### Basic usage

```bash
rdit script.py
```

This will:
1. Start FastAPI server on port 8888
2. Open browser to `http://127.0.0.1:8888?script=/path/to/script.py`
3. Load the script file in the editor

### CLI options

```bash
rdit [OPTIONS] [SCRIPT]

Options:
  --port INTEGER       Port to run server on (default: 8888)
  --host TEXT         Host to bind to (default: 127.0.0.1)
  --no-browser        Don't open browser automatically
  --help              Show help message
```

### Examples

```bash
# Start with custom port
rdit --port 9000 script.py

# Start without opening browser
rdit --no-browser script.py

# Just start the server (no script)
rdit
```

### Running without installing

If you don't want to install the package:

```bash
# Install dependencies only
uv pip install fastapi uvicorn click aiofiles

# Run directly
python -m rdit.cli script.py
```

## Testing

### Python tests

Run all tests with pytest:

```bash
pytest
```

Run specific test file:

```bash
python tests/test_executor.py
python tests/test_server.py
```

Run with verbose output:

```bash
pytest -v
```

Current test status: **44/44 passing**
- 32 executor tests
- 12 server tests

### Frontend tests

The frontend uses Vitest with browser mode (Chromium).

```bash
cd web

# Run tests in watch mode
npm test

# Run tests once (CI mode)
npm test -- --run
```

First-time setup may require installing Playwright browsers:

```bash
npx playwright install chromium
```

## Project Structure

```
rdit/                   # Python package
  __init__.py          # Package exports
  executor.py          # Core Python execution logic (213 lines)
  server.py            # FastAPI server with API endpoints (180 lines)
  cli.py               # Command-line interface (98 lines)

tests/                  # Python tests (44 passing)
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

## API Endpoints

The FastAPI server provides:

- `POST /api/execute-script` - Execute Python script with optional line range
- `GET /api/read-file?path=...` - Read file from filesystem
- `POST /api/reset` - Clear execution namespace
- `GET /api/health` - Health check

### Testing endpoints manually

```bash
# Health check
curl http://127.0.0.1:8888/api/health

# Execute code
curl -X POST http://127.0.0.1:8888/api/execute-script \
  -H "Content-Type: application/json" \
  -d '{"script": "print(\"hello\")"}'

# Read file
curl "http://127.0.0.1:8888/api/read-file?path=/path/to/file.py"

# Reset namespace
curl -X POST http://127.0.0.1:8888/api/reset
```

## Development Workflow

### Backend development

1. Make changes to Python code in `rdit/`
2. Tests run automatically (if using pytest-watch)
3. Restart the server to see changes:
   ```bash
   # Stop with Ctrl+C, then restart
   rdit script.py
   ```

For faster iteration, use uvicorn's reload mode:

```bash
uvicorn rdit.server:app --reload --port 8888
```

### Frontend development

For frontend development with hot reloading:

1. Start the Python backend server:
   ```bash
   rdit --no-browser
   ```
   Or with reload:
   ```bash
   uvicorn rdit.server:app --reload --port 8888
   ```

2. In another terminal, start the frontend dev server:
   ```bash
   cd web
   npm run dev
   ```

3. Open browser to `http://localhost:5173`
4. Make changes - Vite will hot reload automatically

The Vite config includes a proxy that forwards `/api/*` requests to the Python backend on port 8888.

### Full stack development

For the best development experience with hot reloading on both frontend and backend:

1. Terminal 1: Backend with reload
   ```bash
   uvicorn rdit.server:app --reload --port 8888
   ```

2. Terminal 2: Frontend dev server
   ```bash
   cd web
   npm run dev
   ```

3. Terminal 3: Run tests
   ```bash
   pytest --watch
   ```

The Vite dev server (port 5173) will proxy `/api/*` requests to the backend (port 8888). Open `http://localhost:5173` in your browser.

## Code Formatting and Linting

### Python

```bash
# Format with black
black rdit/ tests/

# Lint with ruff
ruff check rdit/ tests/

# Type check with mypy
mypy rdit/
```

### TypeScript

```bash
cd web

# Format and lint (if configured)
npm run lint
npm run format
```

## Debugging

### Python backend

Add breakpoints in your code:

```python
import pdb; pdb.set_trace()
```

Or use your IDE's debugger (VS Code, PyCharm, etc.).

### Server logs

The server logs to stdout. Increase log level:

```bash
uvicorn rdit.server:app --log-level debug
```

### Frontend

Use browser DevTools:
- Console: See execution logs
- Network: Inspect API requests
- Sources: Set breakpoints in TypeScript

## Troubleshooting

### "Frontend build not found" warning

The server needs the built frontend in `web/dist/`:

```bash
cd web
npm run build
```

### "ModuleNotFoundError: No module named 'fastapi'"

Install dependencies:

```bash
uv pip install -e .
```

### Port already in use

Change the port:

```bash
rdit --port 9000 script.py
```

Or find and kill the process using port 8888:

```bash
lsof -ti:8888 | xargs kill
```

### Tests fail with "FastAPI not installed"

Install test dependencies:

```bash
uv pip install -e ".[dev]"
```

### Browser doesn't open automatically

Try these options:
1. Use `--no-browser` and open manually
2. Check if `webbrowser` module works: `python -m webbrowser http://google.com`
3. Open browser manually to `http://127.0.0.1:8888`

## Security Considerations

### File reading endpoint

The `/api/read-file` endpoint currently allows reading any file the server has access to.

**Issue**: `rdit-mit` tracks adding path validation for production use.

For development, this is acceptable, but for production:
- Restrict to allowed directories
- Validate paths to prevent directory traversal
- Consider using an allowlist

### CORS

The server currently allows all origins (`allow_origins=["*"]`). For production, restrict this to specific origins.

## Documentation

- **README.md** - User-facing documentation
- **DEVELOPMENT.md** - This file
- **history/TUTORIAL-PLAN-013-PYTHON-BACKEND.md** - Implementation tutorial
- **AGENTS.md** - Issue tracking with bd (beads)
- **CLAUDE.md** - Project-specific AI instructions

## Issue Tracking

This project uses [bd (beads)](https://github.com/steveyegge/beads) for issue tracking.

```bash
# List all issues
bd list

# Show ready work
bd ready

# Create new issue
bd create "Issue title" -t bug|feature|task -p 0-4

# Update issue
bd update <id> --status in_progress

# Close issue
bd close <id> --reason "Completed"
```

See AGENTS.md for complete workflow details.

## Getting Help

- Check the [README](README.md) for user documentation
- Read the [tutorial](history/TUTORIAL-PLAN-013-PYTHON-BACKEND.md) for architecture details
- Run tests to verify your setup: `pytest -v`
- Open an issue with `bd create` for bugs or feature requests
