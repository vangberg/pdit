# Tutorial: Implementing Python Backend Server for rdit

**Plan 013 Implementation Guide**

> **Status Update (2025-11-24)**: Backend implementation in progress.
> ✅ **Step 1.1 completed**: Python package structure created at top level
> ✅ **Step 1.2 completed**: `pyproject.toml` configured with setuptools
> ✅ **Step 1.3 completed**: Executor module implemented with 32 tests
> ✅ **Step 1.4 completed**: FastAPI server implemented with 10 tests
> 📋 **Next**: Implement CLI module (Step 1.5)

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Architecture Overview](#architecture-overview)
4. [Design Decisions](#design-decisions)
5. [Implementation Guide](#implementation-guide)
6. [Testing](#testing)
7. [Future Enhancements](#future-enhancements)

---

## Overview

This tutorial guides you through implementing a Python backend server for rdit, enabling local Python execution with full filesystem and package access via a FastAPI server.

**What you'll build:**
- FastAPI server for local Python code execution
- Python CLI package installable via pip/uvx
- TypeScript client for communicating with the server
- Shared Python executor module used by the server

**Technologies:**
- **Backend**: Python 3.10+, FastAPI, uvicorn
- **Frontend**: TypeScript, Fetch API
- **Architecture**: Client-server with HTTP API

---

## Problem Statement

### Need for Local Execution

For a Python notebook to be truly useful for data science and development work, it needs:

1. **Filesystem access** - Read/write local files and datasets
2. **Full package ecosystem** - Access to all PyPI packages
3. **Native performance** - No WebAssembly overhead
4. **Development tools** - Debuggers, profilers, etc.

Browser-based solutions (like Pyodide) can't provide these capabilities.

### Solution

Build a **local Python backend server** that:
- Runs as a FastAPI server on localhost
- Has full filesystem and package access
- Uses native Python for better performance
- Maintains execution state (like Jupyter kernels)

---

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React App)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         execution-python.ts (Client)                  │  │
│  │                                                        │  │
│  │  - Creates PythonServerBackend instance               │  │
│  │  - Sends scripts via HTTP POST to server              │  │
│  │  - Receives and yields execution results              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (localhost:8888)
                              ▼
                ┌───────────────────────────────────────┐
                │     FastAPI Server (Python)           │
                │                                       │
                │  ┌─────────────────────────────────┐ │
                │  │  server.py (API endpoints)      │ │
                │  │  - /execute-script              │ │
                │  │  - /execute                     │ │
                │  │  - /reset                       │ │
                │  │  - /health                      │ │
                │  └─────────────────────────────────┘ │
                │              ↓                        │
                │  ┌─────────────────────────────────┐ │
                │  │  executor.py (Core logic)       │ │
                │  │  - PythonExecutor class         │ │
                │  │  - parse_script()               │ │
                │  │  - execute_statement()          │ │
                │  │  - Namespace management         │ │
                │  └─────────────────────────────────┘ │
                └───────────────────────────────────────┘
```

### Component Responsibilities

**Frontend (TypeScript - in `web/src/`):**
- `execution-backend.ts` - Interface defining backend contract (to be created)
- `execution-backend-python.ts` - HTTP client for Python server (to be created)
- `execution-python.ts` - Main entry point, currently uses Pyodide (will be updated)

**Backend (Python - in `rdit/`):**
- `__init__.py` - Package initialization ✅ (created)
- `server.py` - FastAPI server with HTTP endpoints (to be implemented)
- `executor.py` - Core Python execution logic (to be implemented)
- `cli.py` - Command-line interface to start server (to be implemented)

---

## Design Decisions

### 1. Client-Server Architecture

**Decision**: Use HTTP-based client-server model

**Why:**
- **Simplicity**: Standard HTTP/REST API
- **Separation of concerns**: UI and execution decoupled
- **Process isolation**: Python runs in separate process
- **Easy debugging**: Can test server independently
- **Standard tools**: Can use curl, Postman, etc. for testing

**Alternative considered**: WebSockets
- More complex
- Overkill for request/response pattern
- Can add later for streaming if needed

### 2. FastAPI for Server

**Decision**: Use FastAPI framework

**Why:**
- **Fast development**: Auto-generated docs, validation
- **Type safety**: Pydantic models ensure data integrity
- **Async support**: Can handle concurrent requests
- **Modern**: Best practices built-in (CORS, etc.)
- **Lightweight**: Minimal overhead

**Implementation:**
```python
@app.post("/execute-script", response_model=ExecuteResponse)
async def execute_script(request: ExecuteScriptRequest):
    executor = get_executor()
    results = executor.execute_script(request.script)
    return ExecuteResponse(results=...)
```

### 3. Shared Executor Module

**Decision**: Extract execution logic into separate `executor.py`

**Why:**
- **Single responsibility**: Server handles HTTP, executor handles Python
- **Testability**: Can test execution logic independently
- **Reusability**: Could be used by other interfaces (CLI, etc.)
- **Clarity**: Clean separation of concerns

**Structure:**
```python
class PythonExecutor:
    namespace: Dict[str, Any]

    def parse_script(script) -> List[Statement]
    def execute_statement(code, is_expr) -> List[OutputItem]
    def execute_script(script, line_range) -> List[ExecutionResult]
    def reset() -> None
```

### 4. Stateful Execution (Maintained Namespace)

**Decision**: Preserve Python namespace across requests

**Why:**
- **Jupyter-like UX**: Variables persist between cells
- **User expectation**: Matches familiar notebook behavior
- **Convenience**: Don't need to re-import or re-define

**Implementation:**
```python
_execution_namespace: Dict[str, Any] = {'__builtins__': __builtins__}

def execute_statement(code: str, is_expr: bool):
    exec(compiled, _execution_namespace)  # Shared namespace
```

**Reset endpoint** allows clearing state when needed.

### 5. Server-Side Parsing and Compilation

**Decision**: Parse and compile Python code on server using AST module

**Why:**
- **Accuracy**: Python's AST gives perfect parsing
- **Efficiency**: Compile once during parsing, execute pre-compiled code
- **No source extraction**: Compile AST nodes directly, no string manipulation
- **Consistency**: Same approach as Pyodide implementation
- **Simplicity**: No need for client-side Python parser
- **Security**: Code validation happens server-side

**Implementation:**
```python
def parse_script(script: str) -> List[Statement]:
    tree = ast.parse(script)
    for node in tree.body:
        is_expr = isinstance(node, ast.Expr)

        # Compile AST node directly (no source extraction!)
        if is_expr:
            compiled = compile(ast.Expression(body=node.value), '<rdit>', 'eval')
        else:
            compiled = compile(ast.Module(body=[node], type_ignores=[]), '<rdit>', 'exec')

        # Store compiled code object
        statements.append(Statement(compiled=compiled, ...))
```

### 6. CLI with Auto-Browser Opening

**Decision**: CLI opens browser automatically after starting server, using threading to wait for server readiness

**Why:**
- **Jupyter-like UX**: Familiar to data scientists
- **Single command**: `rdit script.py` does everything
- **Convenience**: No manual navigation needed
- **Reliable**: No race conditions from fixed delays

**Implementation (threading with server.started flag):**
```python
class Server(uvicorn.Server):
    def install_signal_handlers(self):
        pass  # Disable signal handlers for threading

    @contextlib.contextmanager
    def run_in_thread(self):
        thread = threading.Thread(target=self.run)
        thread.start()
        try:
            while not self.started:
                time.sleep(1e-3)
            yield
        finally:
            self.should_exit = True
            thread.join()

def main():
    config = uvicorn.Config("rdit.server:app", host=host, port=port)
    server = Server(config=config)

    with server.run_in_thread():
        # Server is guaranteed to be ready
        if not args.no_browser:
            webbrowser.open(url)

        # Keep server running
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
```

**Why not fixed delays?**
- Too short = race condition (browser opens before server ready)
- Too long = user waits unnecessarily
- Threading with `server.started` = 100% reliable, no waiting

### 7. URL Configuration

**Decision**: Allow server URL override via query parameter

**Why:**
- **Flexibility**: Can connect to different ports
- **Testing**: Can run multiple instances
- **Remote**: Could connect to remote server

**Implementation:**
```typescript
const serverUrl = new URLSearchParams(window.location.search)
  .get('python-server') || 'http://127.0.0.1:8888';
```

---

## Implementation Guide

### Phase 1: Python Backend Server

#### Step 1.1: Create Package Structure

**Current structure**:
```bash
rdit/                   # Top-level Python package
  __init__.py          ✅ Completed (exports)
  executor.py          ✅ Completed (210 lines, 32 tests)
  server.py            ✅ Completed (130 lines, 10 tests)
  cli.py               ⏳ To be implemented
web/                    # TypeScript frontend
tests/                  # Python tests (42 passing)
  test_executor.py     ✅ Completed
  test_server.py       ✅ Completed
pyproject.toml          ✅ Completed (with dependencies)
```

The repository has been restructured for PyPI distribution with the Python package at the top level.

#### Step 1.2: Package Configuration (pyproject.toml)

**Status**: ✅ Already created

The `pyproject.toml` has been set up with:

```toml
[build-system]
requires = ["setuptools>=61.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "rdit"
version = "0.1.0"
requires-python = ">=3.8"
dependencies = []  # To be populated with FastAPI, uvicorn, etc.

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-asyncio>=0.21.0",
    "black>=23.0",
    "mypy>=1.0",
    "ruff>=0.1.0",
]

[tool.setuptools.packages.find]
where = ["."]
include = ["rdit*"]
exclude = ["tests*", "web*"]
```

**Next step**: Add runtime dependencies:
```toml
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn[standard]>=0.24.0",
    "click>=8.0.0",
]

[project.scripts]
rdit = "rdit.cli:main"
```

**Key decisions:**
- **setuptools**: Mature, well-supported build backend
- **Standard uvicorn**: Includes websockets and HTTP/2 support
- **Click**: Modern CLI framework (declarative, better UX than argparse)
- **Entry point**: `rdit` command → `cli:main()`

#### Step 1.3: Implement Executor Module

**File**: `rdit/executor.py`

**Core classes:**

```python
class PythonExecutor:
    """Stateful Python executor with namespace management."""

    def __init__(self):
        self.namespace = {'__builtins__': __builtins__}

    def parse_script(self, script: str) -> List[Statement]:
        """Parse Python script into statements using AST.

        Compiles each AST node directly - no source extraction needed!
        This matches the working Pyodide implementation.
        """
        tree = ast.parse(script)
        statements = []

        for i, node in enumerate(tree.body):
            # Get line range for UI display
            line_start = node.lineno
            line_end = node.end_lineno or node.lineno

            # Compile AST node directly
            is_expr = isinstance(node, ast.Expr)
            if is_expr:
                # Expression: compile for eval()
                compiled = compile(
                    ast.Expression(body=node.value),
                    '<rdit>',
                    'eval'
                )
            else:
                # Statement: compile for exec()
                compiled = compile(
                    ast.Module(body=[node], type_ignores=[]),
                    '<rdit>',
                    'exec'
                )

            statements.append(Statement(
                compiled=compiled,
                node_index=i,
                line_start=line_start,
                line_end=line_end,
                is_expr=is_expr
            ))

        return statements

    def execute_statement(self, compiled: CodeType, is_expr: bool) -> List[OutputItem]:
        """Execute pre-compiled statement with output capture."""
        output = []
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()

        try:
            with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
                # Always use eval() - works for both exec and eval compiled code
                result = eval(compiled, self.namespace)

                # For expressions, print result if not None
                if is_expr and result is not None:
                    print(repr(result))

        except Exception:
            error_buffer = io.StringIO()
            traceback.print_exc(file=error_buffer)
            output.append(OutputItem(type="error", text=error_buffer.getvalue()))

        # Capture stdout/stderr
        if stdout_buffer.getvalue():
            output.append(OutputItem(type="stdout", text=stdout_buffer.getvalue()))
        if stderr_buffer.getvalue():
            output.append(OutputItem(type="stderr", text=stderr_buffer.getvalue()))

        return output
```

**Key design points**:
- **Direct AST compilation**: No source extraction needed - compile AST nodes directly
- **Pre-compiled code objects**: Statement stores `CodeType`, not source strings
- **Compile with eval/exec modes**: Expressions use `'eval'` mode, statements use `'exec'` mode
- **Always execute with eval()**: Even exec-compiled code can be eval'd (returns None)
- **is_expr flag**: Determines whether to print the result, not how to execute
- **Efficient**: Compile once during parsing, execute multiple times if needed

#### Step 1.4: Implement FastAPI Server

**File**: `rdit/server.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .executor import get_executor, reset_executor

app = FastAPI(title="rdit Python Backend")

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/execute-script")
async def execute_script(request: ExecuteScriptRequest):
    """Parse and execute a Python script."""
    executor = get_executor()
    results = executor.execute_script(request.script, request.lineRange)

    return ExecuteResponse(results=[
        ExpressionResult(
            nodeIndex=r.node_index,
            lineStart=r.line_start,
            lineEnd=r.line_end,
            output=[OutputItem(type=o.type, text=o.text) for o in r.output],
            isInvisible=r.is_invisible
        )
        for r in results
    ])

@app.post("/reset")
async def reset():
    """Reset the execution namespace."""
    reset_executor()
    return {"status": "ok"}

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
```

**API Endpoints:**
- `/execute-script`: Parse and execute complete script
- `/execute`: Execute pre-parsed statements (advanced use)
- `/reset`: Clear execution namespace
- `/health`: Server availability check

#### Step 1.5: Implement CLI

**File**: `rdit/cli.py`

```python
import contextlib
import sys
import time
import threading
import webbrowser
from pathlib import Path
import click
import uvicorn


class Server(uvicorn.Server):
    """Custom Server class that can run in a background thread."""

    def install_signal_handlers(self):
        """Disable signal handlers for threading compatibility."""
        pass

    @contextlib.contextmanager
    def run_in_thread(self):
        """Run server in background thread, wait for startup."""
        thread = threading.Thread(target=self.run)
        thread.start()
        try:
            # Wait for server to be ready
            while not self.started:
                time.sleep(1e-3)
            yield
        finally:
            # Clean shutdown
            self.should_exit = True
            thread.join()


@click.command()
@click.argument("script", required=False, type=click.Path(exists=True))
@click.option("--port", default=8888, help="Port to run server on")
@click.option("--host", default="127.0.0.1", help="Host to bind to")
@click.option("--no-browser", is_flag=True, help="Don't open browser automatically")
def main(script, port, host, no_browser):
    """rdit - Interactive Python notebook.

    Starts a local Python execution server and opens the web interface.

    SCRIPT: Optional Python script file to open
    """
    # Convert script to absolute path if provided
    script_path = None
    if script:
        script_path = Path(script).resolve()

    # Build URL
    url = f"http://{host}:{port}"
    if script_path:
        url += f"?script={script_path}"

    click.echo(f"Starting rdit server on {host}:{port}")

    # Configure and create server
    config = uvicorn.Config(
        "rdit.server:app",
        host=host,
        port=port,
        log_level="info"
    )
    server = Server(config=config)

    # Run server in thread, open browser when ready
    with server.run_in_thread():
        # Server is guaranteed to be ready here
        if not no_browser:
            webbrowser.open(url)
            click.echo(f"Opening browser to {url}")

        # Keep server running
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            click.echo("\nShutting down...")
```

**Why Click over argparse?**
- ✅ **Declarative**: Uses decorators instead of imperative parser setup
- ✅ **Better help**: Automatically formatted, colored help text
- ✅ **Type validation**: `click.Path(exists=True)` validates files automatically
- ✅ **Composable**: Easy to add subcommands later
- ✅ **User-friendly**: Better error messages and prompts
- ✅ **Industry standard**: Used by Flask, pip, black, etc.

### Phase 2: TypeScript Client

#### Step 2.1: Define Backend Interface

**File**: `web/src/execution-backend.ts`

```typescript
export interface ExecutionBackend {
  executeScript(
    script: string,
    options?: { lineRange?: { from: number; to: number } }
  ): AsyncGenerator<Expression, void, unknown>;

  reset(): Promise<void>;
}
```

**Supporting types:**
```typescript
export interface Expression {
  id: number;
  lineStart: number;
  lineEnd: number;
  result?: {
    output: OutputItem[];
    isInvisible?: boolean;
  };
}

export interface OutputItem {
  type: 'stdout' | 'stderr' | 'error';
  text: string;
}
```

#### Step 2.2: Implement Python Server Client

**File**: `web/src/execution-backend-python.ts`

```typescript
export class PythonServerBackend implements ExecutionBackend {
  private baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:8888') {
    this.baseUrl = baseUrl;
  }

  async *executeScript(script: string, options?) {
    const response = await fetch(`${this.baseUrl}/execute-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script, lineRange: options?.lineRange }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    // Yield results
    for (const result of data.results) {
      yield {
        id: globalIdCounter++,
        lineStart: result.lineStart,
        lineEnd: result.lineEnd,
        result: {
          output: result.output,
          isInvisible: result.isInvisible,
        },
      };
    }
  }

  async reset(): Promise<void> {
    await fetch(`${this.baseUrl}/reset`, { method: 'POST' });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

#### Step 2.3: Create Main Execution Interface

**File**: `web/src/execution-python.ts`

```typescript
import { PythonServerBackend } from './execution-backend-python';

let pythonServerBackend: PythonServerBackend | null = null;

function getBackend(): PythonServerBackend {
  if (!pythonServerBackend) {
    const params = new URLSearchParams(window.location.search);
    const serverUrl = params.get('python-server') || 'http://127.0.0.1:8888';
    pythonServerBackend = new PythonServerBackend(serverUrl);
  }
  return pythonServerBackend;
}

export async function* executeScript(script: string, options?) {
  const backend = getBackend();
  yield* backend.executeScript(script, options);
}
```

**Simple and clean** - no complexity!

### Phase 3: Integration

#### Step 3.1: Install Python Package

**From the repository root**:
```bash
pip install -e .
```

Or with dev dependencies:
```bash
pip install -e ".[dev]"
```

#### Step 3.2: Start Server

```bash
rdit path/to/script.py
```

This will:
1. Start FastAPI server on port 8888
2. Open browser to `http://localhost:8888?script=...`
3. Frontend connects to server and executes code

#### Step 3.3: Verify

1. Browser opens automatically
2. Script loads in editor
3. Run code with Cmd+Enter
4. Results appear inline
5. Console shows: `[Execution] Using Python server backend`

---

## Testing

### Manual Testing

1. **Basic execution**:
```bash
echo "print('Hello from rdit')" > test.py
rdit test.py
```

2. **Test persistence**:
```python
# Cell 1
x = 10

# Cell 2 (should print 10)
print(x)
```

3. **Test filesystem access**:
```python
import os
print(os.listdir('.'))
```

4. **Test packages**:
```python
import pandas as pd
df = pd.DataFrame({'a': [1, 2, 3]})
df
```

### Automated Testing

**Python tests** (`tests/test_executor.py`):

```python
from rdit.executor import PythonExecutor

def test_execute_expression():
    executor = PythonExecutor()
    output = executor.execute_statement("2 + 2", is_expr=True)
    assert output[0].text == "4\n"

def test_namespace_persistence():
    executor = PythonExecutor()
    executor.execute_statement("x = 10", is_expr=False)
    output = executor.execute_statement("x", is_expr=True)
    assert "10" in output[0].text

def test_parse_script():
    executor = PythonExecutor()
    statements = executor.parse_script("x = 1\ny = 2\nx + y")
    assert len(statements) == 3
    assert statements[2].is_expr == True
```

**Server tests** (`tests/test_server.py`):

```python
from fastapi.testclient import TestClient
from rdit.server import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200

def test_execute_script():
    response = client.post("/execute-script", json={"script": "2 + 2"})
    assert response.status_code == 200
    data = response.json()
    assert data["results"][0]["output"][0]["text"] == "4\n"
```

---

## Future Enhancements

### Short-term

1. **WebSocket Support**:
   - Stream output in real-time
   - Enable progress bars
   - Better cancellation

2. **File Operations**:
   - Upload files to server
   - Download results
   - Browse filesystem

3. **Environment Management**:
   - Virtual environments per project
   - Package installation from UI
   - Environment switching

### Long-term

1. **Remote Execution**:
   - Connect to remote Python servers
   - SSH tunneling
   - Authentication

2. **Debugging Support**:
   - Breakpoints
   - Step-through execution
   - Variable inspection

3. **Collaboration**:
   - Multi-user editing
   - Shared execution sessions
   - Comments and annotations

4. **Performance**:
   - Parallel execution
   - Background tasks
   - Caching

---

## Key Takeaways

### Architectural Principles

1. **Simplicity First**:
   - Single execution path (Python server)
   - No complex auto-detection
   - Standard HTTP/REST API

2. **Separation of Concerns**:
   - Server handles HTTP
   - Executor handles Python
   - Client handles UI

3. **Type Safety**:
   - Pydantic for Python API
   - TypeScript for frontend
   - Shared data models

4. **User Experience**:
   - Single command to start (`rdit script.py`)
   - Jupyter-like workflow
   - Familiar notebook behavior

5. **Extensibility**:
   - Clean interfaces
   - Modular design
   - Easy to add features

### Why This Architecture?

**Simple beats complex**:
- Started with dual-backend (Pyodide + server)
- Removed Pyodide complexity
- Result: 639 lines removed, clearer purpose

**HTTP beats custom protocol**:
- Standard tooling
- Easy debugging
- Well understood

**Server-side parsing and compilation beats client-side**:
- More accurate (using Python's AST)
- Compile AST directly (no source extraction)
- Simpler client
- Consistent with Pyodide implementation
- Execute pre-compiled code for efficiency

### Common Pitfalls Avoided

1. ✅ **Compiled AST directly** (not extracting source code strings)
2. ✅ **Used server-side parsing** (not client-side regex)
3. ✅ **Maintained namespace** (Jupyter-like UX)
4. ✅ **Separated concerns** (server ≠ executor)
5. ✅ **Enabled CORS** (for local development)
6. ✅ **Used Pydantic** (type safety + validation)

---

## Conclusion

This implementation demonstrates a **clean, simple architecture** for local Python execution:

- **FastAPI server** handles HTTP and state management
- **Shared executor module** handles Python execution
- **TypeScript client** communicates via REST API
- **CLI tool** provides Jupyter-like user experience

The result is a **maintainable, extensible system** focused on doing one thing well: local Python execution with full filesystem and package access.

---

## Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Python AST Module](https://docs.python.org/3/library/ast.html)
- [TypeScript Async Generators](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-3.html#async-iteration)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [uvicorn Documentation](https://www.uvicorn.org/)
