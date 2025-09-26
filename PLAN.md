# CodeMirror Result Grouping Plugin Plan

## Overview

Create a CodeMirror 6 plugin that groups multiple result ranges into logical groups, where a group spans from the beginning of the first line to the end of the last line of all ranges within that group.

## Grouping Logic

- **Basic Rule**: If two result ranges are on the same line, they belong to the same group
- **Extension Rule**: A group includes all lines from the start of the first range to the end of the last range in that group
- **Merging**: Groups that overlap or touch should be merged into a single larger group

## Examples

### Example 1: Basic grouping with same-line results

```
Line 1: [result A]
Line 2:
Line 3: [result B] some text [result C]
Line 4: more content
Line 5: [result D]
```

Groups would be:

- Group 1: Lines 1-1 (result A only)
- Group 2: Lines 3-3 (results B and C on same line)
- Group 3: Lines 5-5 (result D only)

### Example 2: Multi-line result ranges

```
Line 1: function foo() {
Line 2:   return [result E spans
Line 3:   across these lines] + bar;
Line 4: }
Line 5: let x = [result F];
```

Groups would be:

- Group 1: Lines 2-3 (result E spans lines 2-3)
- Group 2: Lines 5-5 (result F only)

### Example 3: Multiple results on same line with multi-line ranges

```
Line 1: [result G] and [result H starts
Line 2: and continues here]
Line 3: some code
```

Groups would be:

- Group 1: Lines 1-2 (results G and H both touch line 1, H extends to line 2)

### Example 4: Consecutive results remain separate

```
Line 1: [result J]
Line 2: [result K spans
Line 3: to here]
Line 4: [result L]
Line 5: more code
```

Groups would be:

- Group 1: Lines 1-1 (result J only)
- Group 2: Lines 2-3 (result K spans lines 2-3)
- Group 3: Lines 4-4 (result L only)

## Algorithm

1. Collect all result ranges with their line numbers
2. Sort ranges by starting position
3. Group ranges that share any line numbers
4. For each group, determine the full line span (first line start to last line end)
5. Create decorations/extensions for the grouped ranges

## Technical Approach

- Use CodeMirror 6's decoration system
- Implement as a ViewPlugin or StateField
- Track result ranges and compute groups reactively
- Apply visual styling to grouped ranges

## Questions to Resolve

1. ~~What defines a "result range"?~~ **RESOLVED**: Result ranges are managed by `src/result-ranges-sync.ts` as `RangeSet<RangeValue>` through CodeMirror's state system
2. ~~How should groups be visually distinguished?~~ **RESOLVED**: Add decorations to visually mark grouped ranges
3. ~~Should groups be collapsible/expandable?~~ **RESOLVED**: No
4. ~~How to handle dynamic updates when results change?~~ **RESOLVED**: Recalculate group ranges when result ranges change
5. ~~Should there be a minimum/maximum group size?~~ **RESOLVED**: No

## Code Examples

### Input: Result Ranges

```typescript
// Result ranges come from the existing result-ranges-sync.ts
import { RangeSet, RangeValue } from "@codemirror/state";
import { getCurrentResultRanges } from "./result-ranges-sync";

// Get current result ranges
const ranges: RangeSet<RangeValue> = getCurrentResultRanges(view);
```

### Grouping Algorithm (Simplified Implementation)

```typescript
interface GroupRange {
  from: number; // Start position of group
  to: number; // End position of group
  lineStart: number; // First line number
  lineEnd: number; // Last line number
  ranges: Array<{ from: number; to: number }>; // Individual ranges in group
}

// Simple grouping: ranges that share any line belong to the same group
function groupLinesBySharedRanges(
  rangesByLine: Map<number, Array<{ from: number; to: number }>>
): number[][] {
  const groups: number[][] = [];
  const visited = new Set<number>();

  for (const lineNum of rangesByLine.keys()) {
    if (visited.has(lineNum)) continue;

    const group = [lineNum];
    visited.add(lineNum);

    // Find all other lines that share ranges with any line in this group
    let changed = true;
    while (changed) {
      changed = false;

      for (const [otherLineNum, otherRanges] of rangesByLine) {
        if (visited.has(otherLineNum)) continue;

        // Check if any range on otherLineNum matches any range from any line in current group
        const hasSharedRange = group.some(groupLineNum => {
          const groupRanges = rangesByLine.get(groupLineNum) || [];
          return groupRanges.some(groupRange =>
            otherRanges.some(otherRange =>
              groupRange.from === otherRange.from && groupRange.to === otherRange.to
            )
          );
        });

        if (hasSharedRange) {
          group.push(otherLineNum);
          visited.add(otherLineNum);
          changed = true;
        }
      }
    }

    groups.push(group);
  }

  return groups;
}

function calculateGroups(
  ranges: RangeSet<RangeValue>,
  doc: Text
): GroupRange[] {
  const rangesByLine = new Map<number, Array<{ from: number; to: number }>>();

  // Group ranges by line numbers they touch
  ranges.between(0, doc.length, (from, to) => {
    const startLine = doc.lineAt(from).number;
    const endLine = doc.lineAt(to).number;

    for (let line = startLine; line <= endLine; line++) {
      if (!rangesByLine.has(line)) {
        rangesByLine.set(line, []);
      }
      rangesByLine.get(line)!.push({ from, to });
    }
  });

  // Group lines that share ranges
  const lineGroups = groupLinesBySharedRanges(rangesByLine);

  // Convert line groups to GroupRange objects
  const groups: GroupRange[] = lineGroups.map(lineGroup => {
    const minLine = Math.min(...lineGroup);
    const maxLine = Math.max(...lineGroup);

    // Get all unique ranges from all lines in this group
    const allRanges = lineGroup.flatMap(lineNum => rangesByLine.get(lineNum) || []);
    const uniqueRanges = Array.from(
      new Map(allRanges.map(r => [`${r.from}-${r.to}`, r])).values()
    );

    return {
      from: doc.line(minLine).from,
      to: doc.line(maxLine).to,
      lineStart: minLine,
      lineEnd: maxLine,
      ranges: uniqueRanges,
    };
  });

  return groups;
}
```

### Plugin Structure (Current Implementation)

```typescript
import { EditorView, Decoration, DecorationSet } from '@codemirror/view'
import { StateField, RangeSet, RangeValue, Text } from '@codemirror/state'
import { resultRangesField, setResultRanges } from './result-ranges-sync'

// Line decorations for result ranges with different colors
const resultLineDecorations = [
  Decoration.line({ class: "cm-result-line-0" }),
  Decoration.line({ class: "cm-result-line-1" }),
  Decoration.line({ class: "cm-result-line-2" }),
  Decoration.line({ class: "cm-result-line-3" }),
  Decoration.line({ class: "cm-result-line-4" }),
  Decoration.line({ class: "cm-result-line-5" })
]

// StateField to manage line decorations for result ranges
const resultLinesField = StateField.define<DecorationSet>({
  create(state) {
    const ranges = state.field(resultRangesField)
    const decorations: any[] = []

    // Use proper grouping algorithm
    const groups = calculateGroups(ranges, state.doc)

    // Create decorations for each group with different colors
    groups.forEach((group, groupIndex) => {
      const colorIndex = groupIndex % resultLineDecorations.length
      const decoration = resultLineDecorations[colorIndex]

      // Create decoration for each line in the group
      for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
        const line = state.doc.line(lineNum)
        decorations.push(decoration.range(line.from))
      }
    })

    return Decoration.set(decorations)
  },

  update(decorations, tr) {
    // Check if result ranges changed
    const hasSetResultRangesEffect = tr.effects.some(effect => effect.is(setResultRanges))

    if (hasSetResultRangesEffect || tr.docChanged) {
      const ranges = tr.state.field(resultRangesField)
      const newDecorations: any[] = []

      // Use proper grouping algorithm
      const groups = calculateGroups(ranges, tr.state.doc)

      // Create decorations for each group with different colors
      groups.forEach((group, groupIndex) => {
        const colorIndex = groupIndex % resultLineDecorations.length
        const decoration = resultLineDecorations[colorIndex]

        // Create decoration for each line in the group
        for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
          const line = tr.state.doc.line(lineNum)
          newDecorations.push(decoration.range(line.from))
        }
      })

      return Decoration.set(newDecorations)
    }

    // Map existing decorations through document changes
    return decorations.map(tr.changes)
  }
})

// CSS theme for result line decorations with multiple colors
const resultLinesTheme = EditorView.theme({
  '.cm-result-line-0': {
    backgroundColor: 'rgba(255, 215, 0, 0.1)', // Light gold
    borderLeft: '3px solid #FFD700'
  },
  '.cm-result-line-1': {
    backgroundColor: 'rgba(0, 123, 255, 0.1)', // Light blue
    borderLeft: '3px solid #007BFF'
  },
  '.cm-result-line-2': {
    backgroundColor: 'rgba(40, 167, 69, 0.1)', // Light green
    borderLeft: '3px solid #28A745'
  },
  '.cm-result-line-3': {
    backgroundColor: 'rgba(220, 53, 69, 0.1)', // Light red
    borderLeft: '3px solid #DC3545'
  },
  '.cm-result-line-4': {
    backgroundColor: 'rgba(255, 101, 0, 0.1)', // Light orange
    borderLeft: '3px solid #FF6500'
  },
  '.cm-result-line-5': {
    backgroundColor: 'rgba(108, 117, 125, 0.1)', // Light gray
    borderLeft: '3px solid #6C757D'
  }
})

// Main extension
export const resultGroupingExtension = [
  resultLinesField,
  EditorView.decorations.from(resultLinesField),
  resultLinesTheme
]
```

### CSS Styling (Current Implementation)

The CSS styling is now handled by the `resultLinesTheme` in the plugin structure above, which provides multiple colors for different result groups:

- **Group 0**: Light gold background with gold border
- **Group 1**: Light blue background with blue border
- **Group 2**: Light green background with green border
- **Group 3**: Light red background with red border
- **Group 4**: Light orange background with orange border
- **Group 5**: Light gray background with gray border

Colors cycle through these 6 options for groups beyond the 5th group.
