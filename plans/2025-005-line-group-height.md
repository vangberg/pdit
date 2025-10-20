# Line-group height sync (minimal plan)

Use the proof-of-concept to ship the smallest version that keeps editor/output
groups vertically aligned.

## Goal
- Output owns measurement; editor reacts with spacers so both panes share a height per group.
- Avoid new abstractions beyond a tiny shared map and one extension effect.

## Plan
1. **Shared metrics**
   - Keep a `Map<groupId, {domHeight, naturalHeight, targetHeight, top}>` in the existing store.
   - Reset entries when the ordered group list changes.
2. **Output flow**
   - `useLayoutEffect` + `ResizeObserver` measure each group after render.
   - Dispatch `setDomHeight(groupId, height)` only when the delta clears a small epsilon.
3. **Editor flow**
   - Extension reads metrics each update, computes `naturalHeight` via `lineBlockAt`.
   - Set `targetHeight = max(naturalHeight, domHeight)` and inject a single spacer widget when needed.
   - After layout, emit `{ groupId, top, targetHeight }` back to the store.
4. **Reconciliation**
   - React bridge updates both panes from the shared map; output listens for `top` and sets `style.top`.
   - Run an initial handshake: output measure → editor spacer → output reposition.
5. **Cleanup & tests**
   - Remove the legacy line-height plumbing and unused callbacks.
   - Add regression tests that cover editor-only tall groups, output-only tall groups, and reordered groups.

## Notes
- Use the existing requestAnimationFrame batching from the POC if `ResizeObserver` fires rapidly.
- Surface a warning in dev mode if a group never reports a `domHeight` (hidden tab, offscreen render).
