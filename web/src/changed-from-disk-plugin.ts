import { StateField, StateEffect, Transaction, RangeSet, RangeValue } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";

// A simple range value to mark changed lines
class ChangedLineMarker extends RangeValue {
  eq() { return true; }
}

const marker = new ChangedLineMarker();

// Effect to set the changed lines (input as line numbers, converted to positions)
export const setChangedFromDiskLines = StateEffect.define<Set<number>>();

// State field stores positions as a RangeSet (auto-maps through changes)
export const changedFromDiskField = StateField.define<RangeSet<ChangedLineMarker>>({
  create() {
    return RangeSet.empty;
  },

  update(ranges, tr) {
    // Check for explicit set effect - convert line numbers to positions
    for (const effect of tr.effects) {
      if (effect.is(setChangedFromDiskLines)) {
        const lineNums = effect.value;
        if (lineNums.size === 0) {
          return RangeSet.empty;
        }
        const newRanges: { from: number; to: number; value: ChangedLineMarker }[] = [];
        for (const lineNum of lineNums) {
          if (lineNum > 0 && lineNum <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNum);
            newRanges.push({ from: line.from, to: line.from, value: marker });
          }
        }
        return RangeSet.of(newRanges, true);
      }
    }

    // Map ranges through document changes
    if (tr.docChanged) {
      let mapped = ranges.map(tr.changes);

      // If user made edits (not programmatic), clear changed lines that were edited
      if (tr.annotation(Transaction.addToHistory) !== false) {
        const editedLineStarts = new Set<number>();
        tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
          // Get line starts in the new document that were affected
          const startLine = tr.state.doc.lineAt(fromB).from;
          const endLine = tr.state.doc.lineAt(Math.min(toB, tr.state.doc.length)).from;
          for (let pos = startLine; pos <= endLine; ) {
            editedLineStarts.add(pos);
            const line = tr.state.doc.lineAt(pos);
            pos = line.to + 1;
            if (pos > tr.state.doc.length) break;
          }
        });

        if (editedLineStarts.size > 0) {
          // Filter out ranges that overlap with edited lines
          const filtered: { from: number; to: number; value: ChangedLineMarker }[] = [];
          mapped.between(0, tr.state.doc.length, (from, to, value) => {
            const lineStart = tr.state.doc.lineAt(from).from;
            if (!editedLineStarts.has(lineStart)) {
              filtered.push({ from, to, value });
            }
          });
          return RangeSet.of(filtered, true);
        }
      }

      return mapped;
    }

    return ranges;
  },
});

// Decoration field that creates green background for changed lines
export const changedFromDiskDecorations = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(_, tr) {
    const ranges = tr.state.field(changedFromDiskField);

    if (ranges.size === 0) {
      return Decoration.none;
    }

    const decorations: any[] = [];

    ranges.between(0, tr.state.doc.length, (from) => {
      const lineStart = tr.state.doc.lineAt(from).from;
      decorations.push(
        Decoration.line({ class: "cm-changed-from-disk" }).range(lineStart)
      );
    });

    return decorations.length === 0
      ? Decoration.none
      : Decoration.set(decorations, true);
  },

  provide: (f) => EditorView.decorations.from(f),
});

const changedFromDiskTheme = EditorView.theme({
  ".cm-changed-from-disk": {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderLeft: "3px solid #22c55e",
  },
});

export const changedFromDiskExtension = [
  changedFromDiskField,
  changedFromDiskDecorations,
  changedFromDiskTheme,
];
