# Merge groups

When an editor change/transaction causes two groups to overlap, they should be merged into a single group.

## Example

```
Line 1
Line 2
Line 3
```

Line 1 is group 0, line 2 is group 1. User has cursor at beginning of line 2 and presses backspace, bringing
line 2 and 1 together. The groups should be merged.

## Plan

- Confirm how group ranges are stored and when they are recomputed inside the editor transaction pipeline (see `src/result-grouping-plugin.ts` `groupRangesField.update`).
- Detect overlap right after we snap ranges inside `groupRangesField.update`, using a helper that walks the ordered `RangeSet` and merges intersecting spans.
- Merge by tracking the current accumulator `(from, to, GroupValue)`; extend the span while overlapping, otherwise push the completed range; reuse the earliest group's metadata/resultIds without renumbering.
- Return the merged set via `RangeSet.of` so downstream consumers like `groupDecorationsField` continue to see line-aligned, non-overlapping groups; this keeps decoration reuse untouched.
- Add regression coverage that drives the plugin through `setGroupRanges` + text edits: backspace, delete, paste should keep the merged group stable across undo/redo.
