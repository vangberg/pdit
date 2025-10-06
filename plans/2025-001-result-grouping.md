# CodeMirror Result Grouping Plugin Plan

## Overview

Create a CodeMirror 6 plugin that applies visual decorations to groups of lines based on execution results. The API returns line numbers only, groups are computed in App.tsx after execution, converted to a RangeSet, and passed to the plugin. The RangeSet automatically tracks position changes through document edits.

## Architecture

1. **API** (`src/api.ts`): Returns results with line numbers only (no character positions)
2. **App.tsx**: Computes groups from API results, converts to RangeSet using current document, and passes to Editor
3. **Grouping Plugin** (`src/result-grouping-plugin.ts`): Stores groups as RangeSet in StateField, maps through document changes, creates mark decorations
4. **Removed**: `range-highlight-plugin.ts` and `result-ranges-sync.ts` (no longer needed)

## Grouping Logic

- **Basic Rule**: Results that share any line belong to the same group
- **Extension Rule**: A group includes all lines covered by any result in that group
- **Merging**: Results are grouped based on shared line numbers

## Undo

Everything should be undoable (https://codemirror.net/examples/inverted-effect/).

### Example 1: Undoing a line snap

Document at time zero:

```
1: line one
2: line two
```

- Group ranges highlight line 1 only.
- Cursor sits at the beginning of line 2.

Step 1 — press backspace. The newline is removed, CodeMirror snaps the range, and now the single line reads `line oneline two`. The group range expands to cover the merged line (which is expected).

Step 2 — press Cmd-Z. The document returns to two lines, but the group range still spans from the beginning of line 1 to the end of line 2. The undo restored the text but did not shrink the snapped range; we need the range to revert to covering only line 1 again.

## Examples

### Example 1: Basic grouping with same-line results

API returns:

```typescript
{
  results: [
    { id: 1, lineStart: 1, lineEnd: 1 }, // result A
    { id: 2, lineStart: 3, lineEnd: 3 }, // result B
    { id: 3, lineStart: 3, lineEnd: 3 }, // result C
    { id: 4, lineStart: 5, lineEnd: 5 }, // result D
  ];
}
```

Groups would be:

- Group 1: Lines 1-1 (result A only)
- Group 2: Lines 3-3 (results B and C share line 3)
- Group 3: Lines 5-5 (result D only)

### Example 2: Multi-line results

API returns:

```typescript
{
  results: [
    { id: 1, lineStart: 2, lineEnd: 3 }, // result E spans lines 2-3
    { id: 2, lineStart: 5, lineEnd: 5 }, // result F
  ];
}
```

Groups would be:

- Group 1: Lines 2-3 (result E spans lines 2-3)
- Group 2: Lines 5-5 (result F only)

### Example 3: Multiple results with shared lines

API returns:

```typescript
{
  results: [
    { id: 1, lineStart: 1, lineEnd: 1 }, // result G on line 1
    { id: 2, lineStart: 1, lineEnd: 2 }, // result H spans lines 1-2
  ];
}
```

Groups would be:

- Group 1: Lines 1-2 (results G and H both touch line 1, H extends to line 2)

### Example 4: Consecutive results remain separate

API returns:

```typescript
{
  results: [
    { id: 1, lineStart: 1, lineEnd: 1 }, // result J
    { id: 2, lineStart: 2, lineEnd: 3 }, // result K spans lines 2-3
    { id: 3, lineStart: 4, lineEnd: 4 }, // result L
  ];
}
```

Groups would be:

- Group 1: Lines 1-1 (result J only)
- Group 2: Lines 2-3 (result K spans lines 2-3)
- Group 3: Lines 4-4 (result L only)

## Algorithm

### In App.tsx (group computation and RangeSet creation)

1. Receive API results with line numbers: `ApiExecuteResult[]`
2. Build a map of `lineNumber -> Set<resultId>` to track which results touch each line
3. Use union-find or iterative merging to group results that share any lines
4. For each group, compute `lineStart` (min) and `lineEnd` (max)
5. Get current document from Editor ref
6. Convert groups to RangeSet by converting line numbers to character positions, always snapping to the beginning of the first line and the end of the last line that belongs to the group when the ranges are first created
7. Pass RangeSet to Editor

### In result-grouping-plugin.ts (RangeSet storage and decoration)

1. Store groups as `RangeSet<GroupValue>` in StateField
2. When new groups arrive via StateEffect, replace the RangeSet
3. On document changes, map RangeSet through changes and then re-snap each range to full line boundaries
4. Create a single mark decoration per group from the snapped RangeSet positions
5. Cycle through colors for visual distinction
6. On every transaction (initial effect or mapped doc change), recompute decoration ranges so they snap to the beginning of the first line and the end of the last line they cover

## Data Structures

```typescript
// API response
interface ApiExecuteResult {
  id: number;
  lineStart: number; // First line number (1-indexed)
  lineEnd: number; // Last line number (1-indexed)
}

// Intermediate group structure (computed from API results)
interface LineGroup {
  resultIds: number[]; // IDs of results in this group
  lineStart: number; // First line number
  lineEnd: number; // Last line number
}

// RangeValue stored in RangeSet for each group
class GroupValue extends RangeValue {
  constructor(
    public groupIndex: number, // Index of this group (for color cycling)
    public resultIds: number[] // IDs of results in this group
  ) {
    super();
  }

  eq(other: GroupValue) {
    return this.groupIndex === other.groupIndex;
  }
}

// What gets passed from App to Editor
type GroupRangeSet = RangeSet<GroupValue>;
```

## Technical Approach

- **Grouping**: Pure function in App.tsx, runs once per execution
- **RangeSet Creation**: Convert groups to RangeSet using current document positions
- **Plugin**: Stores RangeSet in StateField, maps through document changes, re-snaps mapped ranges to full lines
- **Decorations**: Single mark decoration per group with colored borders/backgrounds
- **Updates**: RangeSet automatically tracks position changes through edits

## Code Examples

### Grouping Algorithm (in separate file: src/compute-line-groups.ts)

```typescript
import { ApiExecuteResult } from "./api";

export interface LineGroup {
  resultIds: number[];
  lineStart: number;
  lineEnd: number;
}

/**
 * Groups API execution results that share any lines.
 *
 * Results that touch the same line belong to the same group. This uses a
 * union-find algorithm to efficiently merge results into groups.
 *
 * @param results - Array of execution results from the API
 * @returns Array of line groups with their computed line ranges
 */
export function computeLineGroups(results: ApiExecuteResult[]): LineGroup[] {
  // Step 1: Build a map of which results touch each line
  // Map: lineNumber -> Set of result IDs that include that line
  const lineToResults = new Map<number, Set<number>>();

  for (const result of results) {
    // Add this result to all lines it spans
    for (let lineNum = result.lineStart; lineNum <= result.lineEnd; lineNum++) {
      if (!lineToResults.has(lineNum)) {
        lineToResults.set(lineNum, new Set());
      }
      lineToResults.get(lineNum)!.add(result.id);
    }
  }

  // Step 2: Use union-find to group results that share lines
  const parent = new Map<number, number>();

  // Find with path compression
  function find(id: number): number {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!));
    }
    return parent.get(id)!;
  }

  // Union two result IDs into the same group
  function union(id1: number, id2: number) {
    const root1 = find(id1);
    const root2 = find(id2);
    if (root1 !== root2) {
      parent.set(root2, root1);
    }
  }

  // For each line, union all results that appear on that line
  for (const resultIds of lineToResults.values()) {
    const ids = Array.from(resultIds);
    for (let i = 1; i < ids.length; i++) {
      union(ids[0], ids[i]);
    }
  }

  // Step 3: Build groups from union-find results
  // Map: root ID -> array of all result IDs in that group
  const groupMap = new Map<number, number[]>();
  for (const result of results) {
    const root = find(result.id);
    if (!groupMap.has(root)) {
      groupMap.set(root, []);
    }
    groupMap.get(root)!.push(result.id);
  }

  // Step 4: Convert to LineGroup objects with computed line ranges
  const groups: LineGroup[] = [];
  for (const resultIds of groupMap.values()) {
    let lineStart = Infinity;
    let lineEnd = -Infinity;

    // Find the min/max lines across all results in this group
    for (const id of resultIds) {
      const result = results.find((r) => r.id === id)!;
      lineStart = Math.min(lineStart, result.lineStart);
      lineEnd = Math.max(lineEnd, result.lineEnd);
    }

    groups.push({
      resultIds,
      lineStart,
      lineEnd,
    });
  }

  return groups;
}
```

### Usage in App.tsx

```typescript
import { executeScript } from "./api";
import { computeLineGroups } from "./compute-line-groups";
import { RangeSet } from "@codemirror/state";

// GroupValue class definition
class GroupValue extends RangeValue {
  constructor(public groupIndex: number, public resultIds: number[]) {
    super();
  }

  eq(other: GroupValue) {
    return this.groupIndex === other.groupIndex;
  }
}

const handleExecute = useCallback(async (script: string) => {
  const apiResponse = await executeScript(script);

  // Compute groups from API results
  const groups = computeLineGroups(apiResponse.results);

  // Get current document from Editor
  const doc = editorViewRef.current?.state.doc;
  if (!doc) return;

  // Convert groups to RangeSet
  const ranges = groups.map((group, index) => {
    const fromLine = doc.line(group.lineStart);
    const toLine = doc.line(group.lineEnd);
    return {
      from: fromLine.from,
      to: toLine.to,
      value: new GroupValue(index, group.resultIds),
    };
  });

  const groupRangeSet = RangeSet.of(ranges);

  // Pass RangeSet to Editor
  setGroupRanges(groupRangeSet);
}, []);
```

### Plugin Structure (result-grouping-plugin.ts)

```typescript
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import {
  StateField,
  StateEffect,
  RangeSet,
  RangeValue,
  Text,
} from "@codemirror/state";

// RangeValue for group tracking
export class GroupValue extends RangeValue {
  constructor(public groupIndex: number, public resultIds: number[]) {
    super();
  }

  eq(other: GroupValue) {
    return this.groupIndex === other.groupIndex;
  }
}

// Effect to set group ranges
export const setGroupRanges = StateEffect.define<RangeSet<GroupValue>>();

// StateField to store group ranges (maps through doc changes automatically)
const groupRangesField = StateField.define<RangeSet<GroupValue>>({
  create() {
    return RangeSet.empty;
  },

  update(ranges, tr) {
    // Check for setGroupRanges effect
    for (const effect of tr.effects) {
      if (effect.is(setGroupRanges)) {
        return snapRangesToFullLines(effect.value, tr.state.doc);
      }
    }

    // Map through document changes and re-snap to full lines
    if (tr.docChanged) {
      const mapped = ranges.map(tr.changes);
      return snapRangesToFullLines(mapped, tr.state.doc);
    }

    return ranges;
  },
});

function snapRangesToFullLines(
  ranges: RangeSet<GroupValue>,
  doc: Text
): RangeSet<GroupValue> {
  const snapped: Array<{ from: number; to: number; value: GroupValue }> = [];

  ranges.between(0, doc.length, (from, to, value) => {
    const startLine = doc.lineAt(from);

    // If the range is non-empty, move back one character so we stay within the last
    // covered line (exclusive end positions point at the next line's start).
    const endPos = to > from ? to - 1 : to;
    const endLine = doc.lineAt(endPos);

    snapped.push({ from: startLine.from, to: endLine.to, value });
  });

  return RangeSet.of(snapped, true);
}

// Mark decorations with different colors
const groupDecorations = [
  Decoration.mark({ class: "cm-result-line-0" }),
  Decoration.mark({ class: "cm-result-line-1" }),
  Decoration.mark({ class: "cm-result-line-2" }),
  Decoration.mark({ class: "cm-result-line-3" }),
  Decoration.mark({ class: "cm-result-line-4" }),
  Decoration.mark({ class: "cm-result-line-5" }),
];

// StateField to create decorations from group ranges
const groupDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return Decoration.none;
  },

  update(decorations, tr) {
    // Get current group ranges
    const groupRanges = tr.state.field(groupRangesField);
    const newDecorations: any[] = [];

    // Create a single mark decoration for each group range
    groupRanges.between(0, tr.state.doc.length, (from, to, value) => {
      const colorIndex = value.groupIndex % groupDecorations.length;
      const decoration = groupDecorations[colorIndex];
      newDecorations.push(decoration.range(from, to));
    });

    return Decoration.set(newDecorations);
  },

  provide: (f) => EditorView.decorations.from(f),
});

// CSS theme
const groupTheme = EditorView.theme({
  ".cm-result-line-0": {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderLeft: "3px solid #FFD700",
  },
  ".cm-result-line-1": {
    backgroundColor: "rgba(0, 123, 255, 0.1)",
    borderLeft: "3px solid #007BFF",
  },
  ".cm-result-line-2": {
    backgroundColor: "rgba(40, 167, 69, 0.1)",
    borderLeft: "3px solid #28A745",
  },
  ".cm-result-line-3": {
    backgroundColor: "rgba(220, 53, 69, 0.1)",
    borderLeft: "3px solid #DC3545",
  },
  ".cm-result-line-4": {
    backgroundColor: "rgba(255, 101, 0, 0.1)",
    borderLeft: "3px solid #FF6500",
  },
  ".cm-result-line-5": {
    backgroundColor: "rgba(108, 117, 125, 0.1)",
    borderLeft: "3px solid #6C757D",
  },
});

export const resultGroupingExtension = [
  groupRangesField,
  groupDecorationsField,
  groupTheme,
];
```

### Editor Integration

```typescript
// In Editor.tsx, apply group ranges via effect when they change
useEffect(() => {
  if (viewRef.current && groupRanges) {
    viewRef.current.dispatch({
      effects: setGroupRanges.of(groupRanges),
    });
  }
}, [groupRanges]);
```

## Key Benefits of RangeSet Approach

1. **Automatic Position Tracking**: RangeSet automatically maps positions through document edits
2. **Efficient Updates**: Only the changed portions need recalculation
3. **Built-in CodeMirror Integration**: Leverages CodeMirror's position tracking system
4. **Simple Plugin Logic**: Plugin just maps RangeSet through changes, no complex recalculation
