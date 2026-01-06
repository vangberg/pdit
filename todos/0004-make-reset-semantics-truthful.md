## Make `reset()` semantics truthful (ack or fire-and-forget)

### Problem
- Frontend `reset()` is `async` but there is no server ack; it just sends a message.
- `execute({ reset: true })` can race with execution.

### Goal
- `await reset()` actually means “reset completed” OR the API is explicitly fire-and-forget.

### Proposed change (pick one)
- Option A: add `reset-ack` from server after kernel restart completes; await it on client.
- Option B: make `reset()` non-async and document that it’s best-effort.

### Acceptance
- `execute({ reset: true })` cannot start executing until reset is complete (if Option A).
- Public API reflects reality (no misleading `async`).

