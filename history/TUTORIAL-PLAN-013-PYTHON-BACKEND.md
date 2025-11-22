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

This tutorial guides you through implementing a dual-backend Python execution system for rdit, enabling both browser-based (Pyodide) and local Python execution (FastAPI server). The implementation allows seamless switching between backends based on availability.

**What you'll build:**
- FastAPI server for local Python code execution
- Python CLI package installable via pip/uvx
- TypeScript backend abstraction layer
- Automatic backend detection and fallback

**Technologies:**
- **Backend**: Python 3.10+, FastAPI, uvicorn
- **Frontend**: TypeScript, Fetch API
- **Existing**: Pyodide (WebAssembly Python)

---

## Problem Statement

### Current Limitations

rdit currently uses **Pyodide** (Python compiled to WebAssembly) which runs in the browser. While this is convenient, it has limitations:

1. **No filesystem access** - Can't read/write local files
2. **Limited package ecosystem** - Only packages compiled to WebAssembly
3. **Slower performance** - WebAssembly overhead
4. **No native extensions** - Can't use packages with C extensions

### Solution

Add a **local Python backend** that:
- Runs as a FastAPI server on localhost
- Has full filesystem and package access
- Uses native Python for better performance
- Falls back to Pyodide when server unavailable

---

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           execution-python.ts (Orchestrator)          │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │      getBackend() - Auto-detection           │    │  │
│  │  │  1. Check if Python server available         │    │  │
│  │  │  2. Use PythonServerBackend if yes           │    │  │
│  │  │  3. Fall back to PyodideBackend if no        │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  │                                                        │  │
│  │  ┌─────────────────┐      ┌──────────────────┐       │  │
│  │  │ PyodideBackend  │      │PythonServerBackend│      │  │
│  │  │  (Browser)      │      │    (HTTP)         │      │  │
│  │  └─────────────────┘      └──────────────────┘       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTP (localhost:8888)
                                   ▼
                    ┌───────────────────────────┐
                    │   FastAPI Server (Python) │
                    │                           │
                    │  /execute-script          │
                    │  /execute                 │
                    │  /reset                   │
                    │  /health                  │
                    └───────────────────────────┘
```

### Component Responsibilities

**Frontend (TypeScript):**
- `execution-backend.ts` - Interface defining backend contract
- `execution-backend-pyodide.ts` - Pyodide implementation
- `execution-backend-python.ts` - HTTP client for Python server
- `execution-python.ts` - Orchestrator with auto-detection

**Backend (Python):**
- `server.py` - FastAPI server with execution endpoints
- `cli.py` - Command-line interface to start server
- `pyproject.toml` - Package configuration

---

## Design Decisions

### 1. Backend Abstraction Pattern

**Decision**: Use Strategy Pattern with interface-based backends

**Why:**
- **Extensibility**: Easy to add more backends (e.g., R, Julia)
- **Testability**: Can mock backends in tests
- **Separation of concerns**: Each backend handles its own complexity
- **Runtime switching**: Can change backends without restarting

**Interface Design:**
```typescript
interface ExecutionBackend {
  executeStatements(statements, options?): AsyncGenerator<Expression>
  reset(): Promise<void>
}
```

This minimal interface captures the essential operations while allowing implementation flexibility.

### 2. Auto-Detection with Graceful Fallback

**Decision**: Check server health on first execution, cache result, fall back to Pyodide

**Why:**
- **User experience**: Works immediately in browser without setup
- **Progressive enhancement**: Power users get local Python when they want it
- **No configuration**: Automatically detects availability
- **Resilient**: Continues working if server stops

**Implementation:**
```typescript
async function getBackend(): Promise<ExecutionBackend> {
  // Try Python server first
  const isAvailable = await pythonServer.isAvailable();
  return isAvailable ? pythonServer : pyodideBackend;
}
```

### 3. Server-Side Parsing for Python Backend

**Decision**: Parse Python code on server, not client

**Why:**
- **Accuracy**: Python's AST module gives perfect parsing
- **Consistency**: Same parsing logic as execution
- **Simplicity**: No need to bundle Python parser in browser
- **Security**: Code validation happens server-side

**Endpoint Design:**
```python
@app.post("/execute-script")
async def execute_script(request: ExecuteScriptRequest):
    statements = parse_script(request.script)  # Server-side AST
    return execute_statements_internal(statements)
```

### 4. Maintained Global Namespace

**Decision**: Preserve Python namespace across requests (like Jupyter)

**Why:**
- **Statefulness**: Variables persist between executions
- **User expectation**: Matches Jupyter/IPython behavior
- **Convenience**: Don't need to re-import or re-define

**Implementation:**
```python
_execution_namespace: Dict[str, Any] = {'__builtins__': __builtins__}

def execute_statement(code: str, is_expr: bool):
    exec(compiled, _execution_namespace)  # Shared namespace
```

### 5. Streaming Results with Generators

**Decision**: Use async generators to yield results as they complete

**Why:**
- **Responsiveness**: UI updates as code executes
- **Memory efficiency**: Don't hold all results in memory
- **Cancelability**: Can stop execution mid-stream
- **Consistency**: Same API for both backends

**Interface:**
```typescript
async function* executeScript(script: string): AsyncGenerator<Expression> {
  yield { id, lineStart, lineEnd, result }
  // ... more results as they complete
}
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

### 7. Health Check Endpoint

**Decision**: Add `/health` endpoint for availability checking

**Why:**
- **Reliability**: Can detect if server is running
- **Fast**: Lightweight check before sending code
- **Standard**: Common API pattern for microservices

### 8. CORS Enabled

**Decision**: Enable CORS for all origins in development

**Why:**
- **Local development**: Frontend on different port (Vite dev server)
- **Testing**: Can test from different origins
- **Note**: Should be restricted in production

---

## Implementation Guide

### Phase 1: Python Backend Server

#### Step 1.1: Create Package Structure

```bash
mkdir -p python/src/rdit
touch python/src/rdit/__init__.py
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
- **hatchling**: Modern, simple build backend (vs setuptools)
- **Standard uvicorn**: Includes websockets and HTTP/2 support
- **Pydantic v2**: Type validation for API requests
- **Entry point**: `rdit` command → `cli:main()`

#### Step 1.3: Implement FastAPI Server

**File**: `python/src/rdit/server.py`

**Core components:**

1. **Data Models** (Pydantic):
```python
class OutputItem(BaseModel):
    type: str  # 'stdout' | 'stderr' | 'error'
    text: str

class Statement(BaseModel):
    code: str
    nodeIndex: int
    lineStart: int
    lineEnd: int
    isExpr: bool
```

**Why Pydantic**: Automatic validation, JSON serialization, type safety

2. **Global Namespace**:
```python
_execution_namespace: Dict[str, Any] = {'__builtins__': __builtins__}
```

**Why global**: Persist state across requests (like Jupyter kernel)

3. **AST Parser**:
```python
def parse_script(script: str) -> List[Statement]:
    tree = ast.parse(script)
    for node in tree.body:
        line_start = node.lineno
        line_end = node.end_lineno
        is_expr = isinstance(node, ast.Expr)
        # ... create Statement objects
```

**Why AST**:
- Accurate statement boundaries
- Distinguish expressions from statements
- Handle multi-line statements correctly

4. **Execution with Output Capture**:
```python
def execute_statement(code: str, is_expr: bool) -> List[OutputItem]:
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()

    with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
        if is_expr:
            result = eval(compiled, _execution_namespace)
            if result is not None:
                print(repr(result))
        else:
            exec(compiled, _execution_namespace)
```

**Why separate eval/exec**:
- `eval`: Returns value for expressions
- `exec`: Runs statements without return value
- Matches Python REPL behavior

5. **API Endpoints**:
```python
@app.post("/execute-script")  # Parse + execute
@app.post("/execute")          # Execute pre-parsed
@app.post("/reset")            # Clear namespace
@app.get("/health")            # Availability check
```

**Why multiple endpoints**:
- `/execute-script`: Convenience for server-side parsing
- `/execute`: Flexibility for client-side parsing
- `/reset`: Essential for clearing state
- `/health`: Backend detection

#### Step 1.4: Implement CLI

**File**: `python/src/rdit/cli.py`

**Key features:**

1. **Argument Parsing**:
```python
parser.add_argument("script", nargs="?")
parser.add_argument("--port", default=8888)
parser.add_argument("--no-browser", action="store_true")
```

2. **Browser Auto-Open**:
```python
def open_browser(url: str, delay: float = 1.5):
    Timer(delay, lambda: webbrowser.open(url)).start()
```

**Why delay**: Give server time to start before opening browser

3. **Server Startup**:
```python
uvicorn.run(
    "rdit.server:app",
    host=args.host,
    port=args.port,
    log_level="info",
)
```

**Why module string**: Enables uvicorn's auto-reload in development

### Phase 2: TypeScript Backend Abstraction

#### Step 2.1: Define Backend Interface

**File**: `src/execution-backend.ts`

```typescript
export interface ExecutionBackend {
  executeStatements(
    statements: Statement[],
    options?: { lineRange?: { from: number; to: number } }
  ): AsyncGenerator<Expression, void, unknown>;

  reset(): Promise<void>;
}
```

**Design principles:**
- **Async generators**: Stream results as available
- **Minimal interface**: Only essential methods
- **Options parameter**: Extensible without breaking changes
- **Type safety**: Full TypeScript typing

**Supporting types:**
```typescript
export interface Statement {
  nodeIndex: number;
  lineStart: number;
  lineEnd: number;
  code: string;
  isExpr: boolean;
}

export interface Expression {
  id: number;
  lineStart: number;
  lineEnd: number;
  result?: ExpressionResult;
}
```

#### Step 2.2: Implement Pyodide Backend

**File**: `src/execution-backend-pyodide.ts`

**Extract existing logic** from `execution-python.ts`:

```typescript
export class PyodideBackend implements ExecutionBackend {
  private isInitialized = false;

  async *executeStatements(statements, options?) {
    if (!this.isInitialized) {
      await setupOutputCapture();
      this.isInitialized = true;
    }

    for (const stmt of statements) {
      await resetOutputBuffers();
      const output = await executeStatement(stmt.nodeIndex);
      yield { id, lineStart, lineEnd, result: { output } };
    }
  }

  async reset() {
    // Clear Pyodide namespace
  }
}
```

**Why class-based**:
- State management (isInitialized)
- Encapsulation of Pyodide-specific logic
- Easy to test and mock

#### Step 2.3: Implement Python Server Backend

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

    const data = await response.json();

    for (const result of data.results) {
      yield { id: globalIdCounter++, ...result };
    }
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

**Key methods:**

1. **executeScript()**: Send whole script to server
   - **Why**: Server parsing more accurate than client-side
   - **Benefit**: Simpler client code

2. **executeStatements()**: Send pre-parsed statements
   - **Why**: Flexibility for advanced use cases
   - **Use case**: When client needs control over parsing

3. **isAvailable()**: Check server health
   - **Why**: Auto-detection and graceful fallback
   - **Timeout**: Fetch automatically times out

#### Step 2.4: Orchestrate Backend Selection

**File**: `src/execution-python.ts`

**Singleton pattern for backends:**
```typescript
let pyodideBackend: PyodideBackend | null = null;
let pythonServerBackend: PythonServerBackend | null = null;
let backendCheckPromise: Promise<ExecutionBackend> | null = null;
```

**Why singletons**:
- Avoid multiple server health checks
- Reuse initialized backends
- Cache detection result

**Auto-detection logic:**
```typescript
async function getBackend(): Promise<ExecutionBackend> {
  if (backendCheckPromise) {
    return backendCheckPromise;  // Reuse in-flight check
  }

  backendCheckPromise = (async () => {
    const serverUrl = new URLSearchParams(window.location.search)
      .get('python-server') || 'http://127.0.0.1:8888';

    pythonServerBackend = new PythonServerBackend(serverUrl);

    if (await pythonServerBackend.isAvailable()) {
      console.log('Using Python server backend');
      return pythonServerBackend;
    }

    console.log('Falling back to Pyodide');
    pyodideBackend = new PyodideBackend();
    return pyodideBackend;
  })();

  return backendCheckPromise;
}
```

**Why this design**:
- **URL parameter support**: Override default server URL
- **Promise caching**: Multiple calls wait for same check
- **Lazy initialization**: Only create backend when needed
- **Console logging**: Helps debugging

**Main execution function:**
```typescript
export async function* executeScript(script: string, options?) {
  const backend = await getBackend();

  if (backend instanceof PythonServerBackend) {
    yield* backend.executeScript(script, options);
  } else {
    const statements = await parseStatements(script);
    yield* backend.executeStatements(statements, options);
  }
}
```

**Why branch on type**:
- Python server can parse server-side (more efficient)
- Pyodide needs client-side parsing (already compiled)

### Phase 3: Integration and Testing

#### Step 3.1: Create Test Script

**File**: `python/test_script.py`

```python
# Simple expression
2 + 2

# Variables
x = 10
y = 20
x + y

# Print
print("Hello!")

# Function
def greet(name):
    return f"Hello, {name}!"

greet("rdit")

# Standard library
import math
math.pi
```

**Why comprehensive**: Tests all code paths (expressions, statements, imports, etc.)

#### Step 3.2: Testing Strategy

**Backend Testing:**

1. **Python Server** (pytest):
```python
async def test_execute_script():
    response = await client.post("/execute-script", json={
        "script": "2 + 2"
    })
    assert response.status_code == 200
    assert response.json()["results"][0]["output"][0]["text"] == "4\n"
```

2. **TypeScript** (Vitest):
```typescript
it('detects Python server', async () => {
  const backend = await getBackend();
  expect(backend).toBeInstanceOf(PythonServerBackend);
});
```

**Integration Testing:**

1. **Start server**: `cd python && python -m rdit.cli test_script.py`
2. **Open browser**: Navigate to localhost:8888
3. **Verify execution**: Check results appear inline
4. **Test fallback**: Stop server, reload page → should use Pyodide

#### Step 3.3: Error Handling

**Common issues and solutions:**

1. **Server not starting**:
   - Check port 8888 not in use
   - Verify dependencies installed: `pip list`

2. **CORS errors**:
   - Ensure CORS middleware configured
   - Check browser console for specific error

3. **Import errors**:
   - Verify package installed in Python environment
   - Check namespace includes `__builtins__`

4. **Parse errors**:
   - Server should catch and return as error output
   - Check AST parsing handles edge cases

---

## Testing

### Manual Testing Workflow

1. **Install Python package**:
```bash
cd python
pip install -e .
```

2. **Start server with test script**:
```bash
rdit test_script.py
```

3. **Verify**:
   - Browser opens automatically
   - Script loads in editor
   - Results appear inline
   - Console shows "Using Python server backend"

4. **Test fallback**:
   - Stop server (Ctrl+C)
   - Refresh browser
   - Console should show "Falling back to Pyodide"
   - Code should still execute

### Automated Testing

**Python tests** (`python/tests/test_server.py`):
```python
from fastapi.testclient import TestClient
from rdit.server import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200

def test_execute_expression():
    response = client.post("/execute-script", json={
        "script": "2 + 2"
    })
    data = response.json()
    assert data["results"][0]["output"][0]["text"] == "4\n"

def test_namespace_persistence():
    client.post("/execute-script", json={"script": "x = 10"})
    response = client.post("/execute-script", json={"script": "x"})
    assert "10" in response.json()["results"][0]["output"][0]["text"]

def test_reset():
    client.post("/execute-script", json={"script": "x = 10"})
    client.post("/reset")
    response = client.post("/execute-script", json={"script": "x"})
    assert response.json()["results"][0]["output"][0]["type"] == "error"
```

**TypeScript tests** (extend existing):
```typescript
import { describe, it, expect } from 'vitest';
import { PythonServerBackend } from './execution-backend-python';

describe('PythonServerBackend', () => {
  it('checks server availability', async () => {
    const backend = new PythonServerBackend();
    const available = await backend.isAvailable();
    expect(typeof available).toBe('boolean');
  });
});
```

---

## Future Enhancements

### Short-term

1. **WebSocket Support**:
   - Stream output in real-time
   - Enable progress bars, long-running tasks
   - Better cancellation support

2. **File Upload**:
   - Allow uploading data files to server
   - Serve files from script directory
   - Security: Restrict to safe directories

3. **Package Management UI**:
   - Show installed packages
   - Install packages from UI
   - Virtual environment per project

4. **Multi-file Support**:
   - Import local modules
   - Project-based execution
   - File tree sidebar

### Long-term

1. **Remote Server Support**:
   - Connect to remote Python kernels
   - SSH tunneling
   - Authentication/authorization

2. **Kernel Management**:
   - Multiple independent namespaces
   - Restart kernel without page reload
   - Show kernel status in UI

3. **Collaboration**:
   - Share execution sessions
   - Real-time collaboration (like Jupyter)
   - Comments and annotations

4. **Debugging**:
   - Breakpoints
   - Step-through execution
   - Variable inspector

5. **Other Languages**:
   - R backend (similar architecture)
   - Julia backend
   - SQL execution

---

## Key Takeaways

### Architectural Principles

1. **Progressive Enhancement**:
   - Works in browser (Pyodide) without any setup
   - Enhanced with local server when available
   - Graceful degradation on errors

2. **Separation of Concerns**:
   - Backend interface isolates implementation details
   - Each backend handles its complexity
   - Orchestrator makes decisions, delegates work

3. **User Experience First**:
   - Auto-detection reduces configuration
   - Jupyter-like workflow (familiar to users)
   - Single command to get started

4. **Type Safety**:
   - Pydantic for Python API
   - TypeScript for frontend
   - Shared data models (OutputItem, Statement, etc.)

5. **Extensibility**:
   - Easy to add new backends
   - Standard interface for all backends
   - Plugin-like architecture

### Common Pitfalls to Avoid

1. **Don't hardcode assumptions**:
   - ❌ Assume server always on port 8888
   - ✅ Allow configuration via URL params

2. **Don't ignore errors**:
   - ❌ Silently fail when server unavailable
   - ✅ Log, fall back, inform user

3. **Don't break the contract**:
   - ❌ Return different types from backends
   - ✅ Strict adherence to ExecutionBackend interface

4. **Don't leak state**:
   - ❌ Global variables in TypeScript
   - ✅ Encapsulate in classes/modules

5. **Don't forget CORS**:
   - ❌ Forget to enable CORS in development
   - ✅ Configure properly, restrict in production

---

## Conclusion

This implementation demonstrates:

- **Plugin architecture** with backend abstraction
- **Graceful degradation** with auto-detection
- **Type-safe APIs** using Pydantic and TypeScript
- **Modern Python packaging** with pyproject.toml
- **FastAPI best practices** for web APIs
- **Async patterns** with generators and streaming

The result is a robust, extensible system that works seamlessly in both browser-only and local execution modes, providing the best of both worlds to users.

---

## Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pyodide Documentation](https://pyodide.org/)
- [Python AST Module](https://docs.python.org/3/library/ast.html)
- [TypeScript Async Generators](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-3.html#async-iteration)
- [Pydantic Documentation](https://docs.pydantic.dev/)
