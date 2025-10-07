# Line group interface

## Objectives
- Have React-side code own the `LineGroup[]` data computed from `ApiExecuteResult[]`.
- Narrow the editor surface so it accepts prepared groups instead of raw API payloads.
- Emit `LineGroup[]` back to React so other panels (debug, output syncing) can reason about the same structure.

## Current flow (pain points)
- `App` calls `editorRef.applyExecutionUpdate` with `{ doc, results }`, forcing the editor to import `computeLineGroups` and know how API responses are shaped.
- The editor converts those results into a `RangeSet<GroupValue>` and only exposes that low-level structure through `onGroupRangesChange`.
- The debug panel and any other React consumers must understand `RangeSet` internals, which makes reuse outside of CodeMirror awkward.

## Target flow
- `App` (or callers) runs `computeLineGroups` on the API response, keeps the array in state, and passes it into `<Editor lineGroups={...}>`.
- `Editor` converts the provided `LineGroup[]` into a `RangeSet<GroupValue>` when dispatching transactions, keeping CodeMirror integration details internal.
- `Editor` notifies React via `onLineGroupsChange(LineGroup[])` whenever the underlying `RangeSet` changes (e.g. because of document edits or undo/redo).
- Debug tooling and future features consume the shared `LineGroup[]` shape instead of `RangeSet`.

## Plan
- Re-export the `LineGroup` interface from a shared module (`compute-line-groups.ts` already defines it) so both `App` and `Editor` can import the same type without circular deps.
- Update `EditorHandles.applyExecutionUpdate` to accept `{ doc: string; lineGroups: LineGroup[] }` and forward those groups through a dedicated `setLineGroups` effect so CodeMirror performs the conversion.
- Expose a derived `lineGroupsField` inside the plugin so React consumers can read canonical `LineGroup[]` snapshots without rebuilding them from `RangeSet` instances.
- Add a helper (inverse of `buildGroupRangeSet`) that maps the live `RangeSet<GroupValue>` back into `LineGroup[]` using the current `Text`. Use it inside the update listener and on initial mount so `onLineGroupsChange` fires with React-friendly data.
- Rename the prop `onGroupRangesChange` → `onLineGroupsChange` and adjust `App`, `Editor`, and `DebugPanel` to consume `LineGroup[]` instead of `RangeSet<GroupValue>`.
- Adjust `App.handleExecute` to compute line groups from the API results, stash them in state for the debug panel, pass them to `applyExecutionUpdate`, and provide them as a prop to `<Editor>`.
- Revise `DebugPanel` to render the `LineGroup[]` details (line spans, result IDs) without touching CodeMirror internals; keep the heights tab unchanged.
- Smoke-test by running the demo manually: execute, edit, undo/redo, and confirm group highlights stay in sync while debug panel displays the same data structure.

## Risks / follow-ups
- Ensure the round-trip conversions preserve ordering; add unit coverage around the helper that converts `RangeSet` back to `LineGroup[]`.
- Watch for performance pitfalls if `lineGroups` is large; memoize conversions if needed once real data sizes are known.
