# Groups Without Results

## Goal
- Every line in the editor belongs to exactly one line group, even if no execution results touch it.
- Contiguous stretches of result-less lines collapse into a single empty group so the output panel can mirror the editor layout.
- Existing result-based grouping behaviour stays intact for lines that do include results.

## Why This Matters
- The output pane needs a height entry for each editor group so linked scrolling and height synchronisation continue working when large parts of the file have no results.
- Having explicit empty groups keeps the decoration pipeline simple because the RangeSet already expects a full coverage of the document.

## High-Level Approach
1. **Augment group computation**: teach `computeLineGroups` how to inject empty `LineGroup`s to fill the gaps between result-backed groups.
2. **Use document line count**: supply the function with the current document so it knows how many lines require coverage, including trailing blank lines.
3. **Preserve ordering**: keep the final array sorted by `lineStart` so consumers (range builder, output pane) can assume monotonic ordering.
4. **Cover edge segments**: explicitly create empty groups before the first result group and after the last one when needed.

## Detailed Design
- Change `computeLineGroups` signature to accept `{ results, lineCount }` (or the `Text` instance) so we can calculate empty spans without re-parsing downstream.
- Keep the existing union-find pass to merge overlapping results; build a sorted array of populated groups as we do today.
- Walk through the document from line 1 to `lineCount`, emitting:
  - the next populated group when its `lineStart` matches the current cursor;
  - otherwise an empty group that runs up to the line immediately before the next populated group (or to `lineCount` if none left).
- Ensure we do not generate zero-length groups; skip if `lineStart` > `lineEnd`.
- Maintain `resultIds` as an empty array for empty groups so downstream UI can tell them apart without null checks.
- Update `buildGroupRangeSet` to continue creating `GroupValue`s for every group; retain the colour index scheme for result-backed groups but introduce a neutral decoration class for empty groups so they stand out less while still marking coverage.

## Edge Cases & Questions
- Trailing newline handling: confirm whether `Text.of(doc.split("\n"))` preserves the final blank line; adjust line count calculation accordingly.
- Files with zero execution results: expect a single empty group covering the whole document.
- Results out of bounds: decide whether to clamp or trust the API (current logic trusts). Do we need validation before computing empty groups?
- Should empty groups be hidden from the result summary panel, or do we surface them explicitly? (Clarify before wiring UI changes.)

## Example
Using the API payload below on a 7-line document:

```typescript
{
  results: [
    { id: 1, lineStart: 1, lineEnd: 1 }, // result A
    { id: 2, lineStart: 4, lineEnd: 4 }, // result B
    { id: 4, lineStart: 6, lineEnd: 7 }, // result C
  ];
}
```

We expect the following groups:
- Group 1: lines 1-1, results: [1]
- Group 2: lines 2-3, results: []
- Group 3: lines 4-4, results: [2]
- Group 4: lines 5-5, results: []
- Group 5: lines 6-7, results: [4]

## Next Steps
1. Update `compute-line-groups.ts` per the design and add unit coverage for empty segments.
2. Adjust `Editor.applyExecutionUpdate` (and any other callers) to pass the document metadata required by the new signature.
3. Verify the decoration extension still snaps correctly and that undo/redo keeps empty groups in sync.
4. Exercise the output pane with long result-less sections to confirm height syncing behaves as expected.
