## Avoid blocking kernel ops in async WS loop

### Problem
- `Kernel.start()`/`Kernel.restart()` are synchronous and can block the FastAPI event loop when called from `/ws/execute`.

### Goal
- Keep websocket responsiveness during restart/initialization.

### Proposed change
- Run blocking kernel operations via `asyncio.to_thread(...)` (or equivalent) from the WS handler / session.
- Keep the public API simple: `await session.restart_async()` or similar.

### Acceptance
- WS handler does not call blocking kernel operations directly.
- Interrupt/ping remain responsive during kernel restart.

