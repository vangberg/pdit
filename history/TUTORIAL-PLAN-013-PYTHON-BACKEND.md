# Tutorial: Implementing Python Backend Server for rdit

**Plan 013 Implementation Guide**

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

**Frontend (TypeScript):**
- `execution-backend.ts` - Interface defining backend contract
- `execution-backend-python.ts` - HTTP client for Python server
- `execution-python.ts` - Main entry point, orchestrates execution

**Backend (Python):**
- `server.py` - FastAPI server with HTTP endpoints
- `executor.py` - Core Python execution logic (shared module)
- `cli.py` - Command-line interface to start server

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

### 5. Server-Side Parsing

**Decision**: Parse Python code on server using AST module

**Why:**
- **Accuracy**: Python's AST gives perfect parsing
- **Consistency**: Same parsing logic as execution
- **Simplicity**: No need for client-side Python parser
- **Security**: Code validation happens server-side

**Implementation:**
```python
def parse_script(script: str) -> List[Statement]:
    tree = ast.parse(script)
    for node in tree.body:
        # Extract statement metadata
        is_expr = isinstance(node, ast.Expr)
        # Create Statement objects
```

### 6. CLI with Auto-Browser Opening

**Decision**: CLI opens browser automatically after starting server

**Why:**
- **Jupyter-like UX**: Familiar to data scientists
- **Single command**: `rdit script.py` does everything
- **Convenience**: No manual navigation needed

**Implementation:**
```python
def main():
    open_browser(url, delay=1.5)  # Wait for server startup
    uvicorn.run("rdit.server:app", ...)
```

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

```bash
mkdir -p python/src/rdit
touch python/src/rdit/__init__.py
touch python/src/rdit/executor.py
touch python/src/rdit/server.py
touch python/src/rdit/cli.py
```

#### Step 1.2: Create pyproject.toml

**Purpose**: Define Python package metadata and dependencies

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "rdit"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.104.0",
    "uvicorn[standard]>=0.24.0",
    "pydantic>=2.0.0",
]

[project.scripts]
rdit = "rdit.cli:main"

[tool.hatch.build.targets.wheel]
packages = ["src/rdit"]
```

**Key decisions:**
- **hatchling**: Modern, simple build backend
- **Standard uvicorn**: Includes websockets and HTTP/2 support
- **Pydantic v2**: Type validation for API requests
- **Entry point**: `rdit` command → `cli:main()`

#### Step 1.3: Implement Executor Module

**File**: `python/src/rdit/executor.py`

**Core classes:**

```python
class PythonExecutor:
    """Stateful Python executor with namespace management."""

    def __init__(self):
        self.namespace = {'__builtins__': __builtins__}

    def parse_script(self, script: str) -> List[Statement]:
        """Parse Python script into statements using AST."""
        tree = ast.parse(script)
        statements = []

        for i, node in enumerate(tree.body):
            # Get line range
            line_start = node.lineno
            line_end = node.end_lineno or node.lineno

            # Extract source code
            lines = script.split('\n')
            code = '\n'.join(lines[line_start-1:line_end])

            # Determine if expression
            is_expr = isinstance(node, ast.Expr)

            statements.append(Statement(
                code=code,
                node_index=i,
                line_start=line_start,
                line_end=line_end,
                is_expr=is_expr
            ))

        return statements

    def execute_statement(self, code: str, is_expr: bool) -> List[OutputItem]:
        """Execute single statement with output capture."""
        output = []
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()

        try:
            with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
                mode = 'eval' if is_expr else 'exec'
                compiled = compile(code, '<rdit>', mode)

                if is_expr:
                    result = eval(compiled, self.namespace)
                    if result is not None:
                        print(repr(result))
                else:
                    exec(compiled, self.namespace)

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

**Why separate eval/exec**:
- `eval`: Returns value for expressions (like `2 + 2`)
- `exec`: Runs statements without return (like `x = 5`)
- Matches Python REPL behavior

#### Step 1.4: Implement FastAPI Server

**File**: `python/src/rdit/server.py`

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

**File**: `python/src/rdit/cli.py`

```python
import argparse
import webbrowser
from threading import Timer
import uvicorn

def open_browser(url: str, delay: float = 1.5):
    """Open browser after delay to ensure server is ready."""
    Timer(delay, lambda: webbrowser.open(url)).start()

def main():
    parser = argparse.ArgumentParser(description="rdit - Python notebook")
    parser.add_argument("script", nargs="?", help="Python script to open")
    parser.add_argument("--port", type=int, default=8888)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true")

    args = parser.parse_args()

    # Validate script path
    if args.script:
        script_path = Path(args.script).resolve()
        if not script_path.exists():
            print(f"Error: Script '{args.script}' not found")
            sys.exit(1)

    # Build URL
    url = f"http://{args.host}:{args.port}"
    if args.script:
        url += f"?script={script_path}"

    print(f"Starting rdit server on {args.host}:{args.port}")

    # Open browser
    if not args.no_browser:
        open_browser(url)

    # Start server
    uvicorn.run("rdit.server:app", host=args.host, port=args.port)
```

### Phase 2: TypeScript Client

#### Step 2.1: Define Backend Interface

**File**: `src/execution-backend.ts`

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

**File**: `src/execution-backend-python.ts`

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

**File**: `src/execution-python.ts`

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

```bash
cd python
pip install -e .
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
cd python
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

**Python tests** (`python/tests/test_executor.py`):

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

**Server tests** (`python/tests/test_server.py`):

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

**Server-side parsing beats client-side**:
- More accurate (using Python's AST)
- Simpler client
- Consistent behavior

### Common Pitfalls Avoided

1. ✅ **Used server-side parsing** (not client-side regex)
2. ✅ **Maintained namespace** (Jupyter-like UX)
3. ✅ **Separated concerns** (server ≠ executor)
4. ✅ **Enabled CORS** (for local development)
5. ✅ **Used Pydantic** (type safety + validation)

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
