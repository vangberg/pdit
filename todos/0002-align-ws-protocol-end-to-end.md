## Align WS protocol end-to-end (remove adapter layer)

### Status
- Done: backend + frontend use the same event vocabulary (`execution-started`, `expression-done`, `execution-*`).

### Problem
- Backend emits `execution-started` / `expression-done` / `execution-*`.
- Frontend exposes a different protocol (`expressions` / `done` / `cancelled`) and translates in `web/src/execution-backend-python.ts`.
- This duplication makes every change “two-sided” and harder to reason about.

### Goal
- One event vocabulary and one payload shape shared by backend + frontend.

### Proposed change (pick one)
- Option A: update backend to emit the frontend’s `ExecutionEvent` shape directly.
- Option B: update frontend to expose backend events directly and delete the translation layer.

### Acceptance
- `web/src/execution-backend-python.ts` no longer re-maps event types; it just forwards typed messages.
- Tests updated to match the single protocol.
