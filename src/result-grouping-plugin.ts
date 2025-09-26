import { EditorView, Decoration, DecorationSet } from '@codemirror/view'
import { StateField, RangeSet, RangeValue, Text } from '@codemirror/state'
import { resultRangesField, setResultRanges } from './result-ranges-sync'

// Interface from PLAN.md
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

        // Check if any range on otherLineNum overlaps with any range from any line in current group
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

// Simplified grouping algorithm based on PLAN.md
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

    // Use proper grouping algorithm from PLAN.md
    const groups = calculateGroups(ranges, state.doc)

    // Create decorations for each group
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

      // Use proper grouping algorithm from PLAN.md
      const groups = calculateGroups(ranges, tr.state.doc)

      // Create decorations for each group
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