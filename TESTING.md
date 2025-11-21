# Testing Guide for Python Backend

This guide explains how to test the Python backend implementation.

## Prerequisites

- Python 3.10+
- Node.js and npm
- Virtual environment support

## Setup

### 1. Install Python Backend

Create a virtual environment and install the package:

```bash
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### 2. Install Frontend Dependencies

```bash
cd ..  # Back to root
npm install
```

## Running Tests

### Backend API Tests

The `test_backend.py` script tests the FastAPI server directly:

```bash
cd python
source .venv/bin/activate

# Start the server in one terminal
uvicorn rdit.server:app --host 127.0.0.1 --port 8888

# In another terminal, run the tests
source .venv/bin/activate
python test_backend.py
```

**Tests included:**
- ✓ Health check
- ✓ Simple expression execution
- ✓ Multi-statement execution
- ✓ Function definition and calls
- ✓ Error handling
- ✓ Namespace persistence across requests
- ✓ Reset endpoint

### Frontend Build Test

Verify TypeScript compiles without errors:

```bash
npm run build
```

### Manual Integration Test

Test the full stack together:

1. **Start the Python backend:**
   ```bash
   cd python
   source .venv/bin/activate
   rdit test_script.py
   ```
   This will:
   - Start the FastAPI server on port 8888
   - Open your browser to http://localhost:8888

2. **Start the frontend dev server** (in another terminal):
   ```bash
   npm run dev
   ```
   Opens on http://localhost:5173

3. **Test in browser:**
   - Navigate to http://localhost:5173
   - The console should show: "Using Python server backend"
   - Try executing Python code in the editor
   - Verify results appear inline

## Test Scripts

### test_script.py

Located in `python/test_script.py`, this demonstrates various Python features:
- Expressions (2 + 2)
- Assignments
- Functions
- Imports
- Loops
- Print statements

### test_backend.py

Located in `python/test_backend.py`, comprehensive API tests that verify:
- HTTP endpoints work correctly
- Python code execution is accurate
- Error handling is proper
- State management functions

## Architecture

```
┌─────────────────┐
│   Browser       │
│  (Frontend)     │
│  TypeScript     │
└────────┬────────┘
         │ HTTP
         │
┌────────▼────────┐
│  FastAPI Server │
│  Python Backend │
│  (rdit.server)  │
└────────┬────────┘
         │
┌────────▼────────┐
│  Python Runtime │
│  Execution      │
│  Namespace      │
└─────────────────┘
```

## Backend Detection

The frontend automatically detects which backend to use:

1. Checks for Python server at http://127.0.0.1:8888/health
2. If available → Uses Python server backend
3. If not available → Falls back to Pyodide (browser)

You can override the server URL with a query parameter:
```
http://localhost:5173?python-server=http://localhost:9999
```

## Common Issues

### Port 8888 already in use
```bash
# Find and kill the process
lsof -ti:8888 | xargs kill -9
```

### Server not detecting
- Ensure the server is running on port 8888
- Check browser console for connection errors
- Verify CORS is enabled in server.py

### Import errors
- Activate the virtual environment: `source .venv/bin/activate`
- Reinstall package: `pip install -e .`

## Success Criteria

All tests should pass:

- ✓ `npm run build` - No TypeScript errors
- ✓ `python test_backend.py` - All API tests pass
- ✓ Browser console shows "Using Python server backend"
- ✓ Can execute Python code in the browser interface
- ✓ Results display correctly inline
