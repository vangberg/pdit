import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import {
  StateField,
  StateEffect,
  RangeSet,
  RangeValue,
  Text,
} from "@codemirror/state";

export class GroupValue extends RangeValue {
  constructor(public groupIndex: number, public resultIds: number[]) {
    super();
  }

  eq(other: GroupValue) {
    return this.groupIndex === other.groupIndex;
  }
}

export const setGroupRanges = StateEffect.define<RangeSet<GroupValue>>();

const groupRangesField = StateField.define<RangeSet<GroupValue>>({
  create() {
    return RangeSet.empty;
  },

  update(ranges, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGroupRanges)) {
        return snapRangesToFullLines(effect.value, tr.state.doc);
      }
    }

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
  if (ranges.size === 0) {
    return RangeSet.empty;
  }

  const snapped: Array<{ from: number; to: number; value: GroupValue }> = [];

  ranges.between(0, doc.length, (from, to, value) => {
    const startLine = doc.lineAt(from);
    const endPos = to > from ? to - 1 : to;
    const endLine = doc.lineAt(endPos);

    snapped.push({ from: startLine.from, to: endLine.to, value });
  });

  return RangeSet.of(snapped, true);
}

const groupDecorations = [
  Decoration.mark({ class: "cm-result-line-0" }),
  Decoration.mark({ class: "cm-result-line-1" }),
  Decoration.mark({ class: "cm-result-line-2" }),
  Decoration.mark({ class: "cm-result-line-3" }),
  Decoration.mark({ class: "cm-result-line-4" }),
  Decoration.mark({ class: "cm-result-line-5" }),
];

const groupDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(_, tr) {
    const groupRanges = tr.state.field(groupRangesField);
    const decorations: any[] = [];

    groupRanges.between(0, tr.state.doc.length, (from, to, value) => {
      const colorIndex = value.groupIndex % groupDecorations.length;
      const decoration = groupDecorations[colorIndex];
      decorations.push(decoration.range(from, to));
    });

    return decorations.length === 0 ? Decoration.none : Decoration.set(decorations);
  },

  provide: (f) => EditorView.decorations.from(f),
});

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
