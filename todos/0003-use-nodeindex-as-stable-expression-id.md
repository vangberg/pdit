## Use `nodeIndex` as the expression identifier

### Problem
- Server sends `nodeIndex`, but frontend matches expressions by `(lineStart,lineEnd)` and generates ids via `globalIdCounter`.
- This is brittle (line ranges can shift) and adds unnecessary state machinery.

### Goal
- Single stable identifier per statement for a given script parse (`nodeIndex`).

### Proposed change
- Treat `nodeIndex` as the expression `id` across the wire.
- Remove `globalIdCounter` and `(lineStart,lineEnd)` lookup heuristics where possible.
- Keep `lineStart/lineEnd` for rendering only.

### Acceptance
- No `globalIdCounter` in `web/src/execution-backend-python.ts`.
- No mapping “find by lineStart/lineEnd” to attach results; use `id/nodeIndex`.

