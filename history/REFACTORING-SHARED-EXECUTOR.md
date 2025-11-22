# Refactoring: Shared Executor Module

## Overview

This refactoring extracts the Python execution logic into a shared module that is used by both the Pyodide (browser) and Python server backends, eliminating code duplication and ensuring consistent behavior.

## Motivation

### Problem

Initially, both backends had duplicated Python execution logic:
- **Pyodide backend** - Python code embedded as strings in TypeScript
- **Python server backend** - Python code in `server.py`

Both implementations handled:
- AST parsing to determine statement boundaries
- Execution with `eval`/`exec`
- Output capture (stdout/stderr/errors)
- Determining expression vs statement
- Line range filtering

This duplication led to:
- **Maintenance burden** - Changes needed in two places
- **Consistency risk** - Implementations could diverge
- **Testing overhead** - Same logic tested twice
- **Code bloat** - ~150 lines duplicated

### Solution

Extract the shared Python code into `python/src/rdit/executor.py` that both backends can use:
- **Server**: Direct Python import
- **Pyodide**: Load module into browser runtime

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   executor.py                           │
│                                                          │
│  - PythonExecutor class                                 │
│  - parse_script(script) → List[Statement]               │
│  - execute_statement(code, is_expr) → List[OutputItem]  │
│  - execute_script(script, line_range) → List[Result]    │
│  - get_executor() / reset_executor()                    │
└─────────────────────────────────────────────────────────┘
                           ▲
                           │
          ┌────────────────┴────────────────┐
          │                                 │
┌─────────┴──────────┐          ┌──────────┴─────────┐
│   server.py        │          │execution-backend-  │
│                    │          │pyodide.ts          │
│ - Import executor  │          │                    │
│ - Wrap in FastAPI  │          │ - Fetch from       │
│ - Pydantic models  │          │   server OR        │
│                    │          │ - Use embedded     │
│                    │          │   version          │
└────────────────────┘          └────────────────────┘
```

## Implementation Details

### 1. Core Executor Module (`python/src/rdit/executor.py`)

**Classes:**

```python
class OutputItem:
    """Single output item (stdout/stderr/error)"""
    type: str
    text: str

class Statement:
    """Parsed Python statement"""
    code: str
    node_index: int
    line_start: int
    line_end: int
    is_expr: bool

class ExecutionResult:
    """Result of executing a statement"""
    node_index: int
    line_start: int
    line_end: int
    output: List[OutputItem]
    is_invisible: bool

class PythonExecutor:
    """Stateful Python executor"""
    namespace: Dict[str, Any]

    def parse_script(script: str) -> List[Statement]
    def execute_statement(code: str, is_expr: bool) -> List[OutputItem]
    def execute_script(script: str, line_range: Optional[Dict]) -> List[ExecutionResult]
    def execute_statements(...) -> List[ExecutionResult]
    def reset() -> None
```

**Global Functions:**
```python
def get_executor() -> PythonExecutor
def reset_executor() -> None
```

### 2. Server Backend Integration

**Before:**
```python
# server.py had ~150 lines of execution logic
def parse_script(script: str) -> List[Statement]: ...
def execute_statement(code: str, is_expr: bool) -> List[OutputItem]: ...
_execution_namespace: Dict[str, Any] = {}
```

**After:**
```python
# server.py now imports and uses executor
from .executor import get_executor, reset_executor

@app.post("/execute-script")
async def execute_script(request: ExecuteScriptRequest):
    executor = get_executor()
    results = executor.execute_script(request.script, request.lineRange)
    return ExecuteResponse(results=...)
```

**Benefits:**
- ~120 lines removed from `server.py`
- Server is now just a thin FastAPI wrapper
- Easier to test server logic separately from execution

### 3. Pyodide Backend Integration

**Loading Strategy:**

The Pyodide backend has a dual-loading strategy:

```typescript
async function loadExecutor(): Promise<void> {
  try {
    // Try to fetch from server if available
    const response = await fetch('http://127.0.0.1:8888/executor.py');
    if (response.ok) {
      executorCode = await response.json().code;
    } else {
      executorCode = getEmbeddedExecutor();
    }
  } catch {
    // Fallback to embedded version
    executorCode = getEmbeddedExecutor();
  }

  await pyodide.runPythonAsync(executorCode);
}
```

**Why dual-loading?**

1. **Fetch from server** (when available):
   - Ensures exact same code as server
   - Single source of truth
   - Easier debugging (same code path)

2. **Embedded fallback** (when server unavailable):
   - Works standalone in browser
   - No dependency on local server
   - Progressive enhancement

**Before:**
```typescript
// Pyodide had custom output capture logic
async function setupOutputCapture() { ... }
async function executeStatement(nodeIndex: number) { ... }
// ~100 lines of Python code embedded in strings
```

**After:**
```typescript
// Loads shared executor and calls it
async *executeScript(script: string, options?) {
  await loadExecutor();
  const results = await pyodide.runPythonAsync(`
    executor = get_executor()
    results = executor.execute_script(${script}, ${lineRange})
    json.dumps([r.to_dict() for r in results])
  `);
  yield* parseResults(results);
}
```

### 4. Server Endpoint for Executor

Added endpoint to serve the executor module:

```python
@app.get("/executor.py")
async def get_executor_module():
    """Serve executor module for Pyodide to load."""
    executor_path = Path(__file__).parent / "executor.py"
    return {"code": executor_path.read_text()}
```

This allows Pyodide to fetch the exact same code the server uses.

## Benefits

### Code Quality

- **DRY principle** - Single source of truth for execution logic
- **Consistency** - Identical behavior between backends
- **Maintainability** - Changes in one place
- **Testability** - Test executor module independently

### Performance

- **Pyodide** - No change (still browser-based)
- **Server** - Slightly faster (one less function call layer)

### Developer Experience

- **Easier to reason about** - One execution model
- **Easier to debug** - Same code path in both backends
- **Easier to extend** - Add features to executor, both backends get them

## Changes Summary

### New Files

- `python/src/rdit/executor.py` - Shared execution logic (270 lines)

### Modified Files

- `python/src/rdit/server.py`:
  - Removed ~120 lines of duplicated logic
  - Now imports from `executor`
  - Added `/executor.py` endpoint
  - Reduced from ~210 lines to ~130 lines

- `src/execution-backend-pyodide.ts`:
  - Removed custom execution logic
  - Added executor loading (fetch or embed)
  - Added `executeScript()` method
  - Simplified from ~170 lines to ~350 lines (includes embedded executor)

- `src/execution-python.ts`:
  - Simplified to call `executeScript()` on both backends
  - Removed `parseStatements` import
  - Both backends use same code path

## Migration Notes

### Breaking Changes

**None** - This is a pure refactoring with no API changes.

### Testing

All existing tests should pass without modification. The behavior is identical, only the implementation changed.

**Additional tests to add:**

1. **Executor module tests** (`python/tests/test_executor.py`):
```python
def test_parse_script():
    executor = PythonExecutor()
    statements = executor.parse_script("x = 1\ny = 2")
    assert len(statements) == 2

def test_execute_expression():
    executor = PythonExecutor()
    output = executor.execute_statement("2 + 2", is_expr=True)
    assert output[0].text == "4\n"

def test_namespace_persistence():
    executor = PythonExecutor()
    executor.execute_statement("x = 10", is_expr=False)
    output = executor.execute_statement("x", is_expr=True)
    assert "10" in output[0].text
```

2. **Pyodide executor loading** (`src/execution-backend-pyodide.test.ts`):
```typescript
it('loads executor from server when available', async () => {
  // Mock server response
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ code: 'executor code' })
  });

  const backend = new PyodideBackend();
  await backend.executeScript('2 + 2');

  expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:8888/executor.py'
  );
});

it('falls back to embedded executor when server unavailable', async () => {
  global.fetch = vi.fn().mockRejectedValue(new Error('Server down'));

  const backend = new PyodideBackend();
  // Should not throw, uses embedded version
  const results = [];
  for await (const result of backend.executeScript('2 + 2')) {
    results.push(result);
  }
  expect(results).toHaveLength(1);
});
```

## Future Enhancements

### 1. Build-time Embedding

Instead of embedding executor.py as a string in TypeScript, bundle it at build time:

```typescript
// vite.config.ts
import { readFileSync } from 'fs';

export default defineConfig({
  define: {
    __EXECUTOR_CODE__: JSON.stringify(
      readFileSync('./python/src/rdit/executor.py', 'utf-8')
    )
  }
});

// Then in pyodide backend:
const executorCode = __EXECUTOR_CODE__;
```

**Benefits:**
- Type safety
- Smaller bundle (no duplicate in embedded version)
- Build-time validation (fails if file missing)

### 2. Version Checking

Ensure Pyodide loads compatible executor version:

```python
# executor.py
__version__ = "1.0.0"

# server.py
@app.get("/executor.py")
async def get_executor_module():
    return {
        "code": executor_path.read_text(),
        "version": executor.__version__
    }
```

```typescript
// Pyodide backend
if (serverVersion !== EXPECTED_VERSION) {
  console.warn('Version mismatch, using embedded');
  executorCode = getEmbeddedExecutor();
}
```

### 3. Executor as Package

Publish executor as standalone package:

```bash
pip install rdit-executor
```

Then both server and Pyodide can depend on it:
- Server: `from rdit_executor import get_executor`
- Pyodide: `pyodide.loadPackage('rdit-executor')`

**Benefits:**
- Versioning
- Independent testing
- Reusable in other projects

### 4. Hot Reloading

In development, reload executor without restarting:

```typescript
// Pyodide backend
async function reloadExecutor() {
  executorLoaded = false;
  await loadExecutor();
}

// Expose for debugging
window.reloadExecutor = reloadExecutor;
```

## Conclusion

This refactoring demonstrates the **DRY principle** in a polyglot codebase (Python + TypeScript). By extracting shared Python logic into a module and using creative loading strategies (import vs fetch/embed), we:

- **Eliminated** ~120 lines of duplication
- **Ensured** consistent behavior across backends
- **Simplified** maintenance and testing
- **Preserved** standalone browser functionality

The pattern of "shared logic module + dual loading strategy" is applicable to other multi-backend systems where consistency is critical but deployment contexts vary (local vs server, browser vs native, etc.).
