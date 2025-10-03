// CodeMirror extension that highlights groups of result lines and keeps the
// group markings in sync with document changes and undo/redo operations.
//
// The plugin receives the groups as a RangeSet (computed in React land) and
// stores them in a StateField. We always snap the stored ranges to entire lines
// so that decorations line up regardless of edits that merge or split lines.
// To make the snapping undoable we track the previous snapshot via the
// `invertedEffects` facet, which is the same mechanism showcased in the
// CodeMirror inverted-effect example.
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import {
  StateField,
  StateEffect,
  RangeSet,
  RangeValue,
  Text,
} from "@codemirror/state";
import { invertedEffects } from "@codemirror/commands";

export class GroupValue extends RangeValue {
  // GroupValue carries metadata for a single group range. `groupIndex`
  // determines the color class assigned to the decoration and `resultIds`
  // tracks which execution results contributed to the group so that the
  // debugger panel can present relevant information.
  constructor(public groupIndex: number, public resultIds: number[]) {
    super();
  }

  eq(other: GroupValue) {
    // We only care about the index for equality because the `resultIds`
    // array is just informational. Keeping equality lightweight prevents the
    // RangeSet machinery from thinking two identical groups differ simply
    // because the array instance changed.
    return this.groupIndex === other.groupIndex;
  }
}

export const setGroupRanges = StateEffect.define<RangeSet<GroupValue>>({
  map(value) {
    // The ranges are authored against the document that will be installed as
    // part of the same transaction, so we leave them unchanged here. The field
    // will perform its regular snapping pass once the transaction lands.
    return value;
  },
});

export const groupRangesField = StateField.define<RangeSet<GroupValue>>({
  create() {
    // Start with an empty set so decorations simply produce nothing until the
    // first execution result arrives.
    return RangeSet.empty;
  },

  update(ranges, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGroupRanges)) {
        // A new set of groups arrived from React. Snap to full lines using the
        // latest document so that the stored state is always line-aligned.
        return snapRangesToFullLines(effect.value, tr.state.doc);
      }
    }

    if (tr.docChanged) {
      // Regular document edits (including undo/redo) flow through here. We map
      // the old ranges through the change set to keep their endpoints aligned
      // with the content, and then snap to the full lines that are currently
      // covered.
      const mapped = ranges.map(tr.changes);
      return snapRangesToFullLines(mapped, tr.state.doc);
    }

    // No relevant effects: keep the existing RangeSet instance.
    return ranges;
  },
});

function snapRangesToFullLines(
  ranges: RangeSet<GroupValue>,
  doc: Text
): RangeSet<GroupValue> {
  if (ranges.size === 0) {
    // Fast path for the common case where the set is empty.
    return RangeSet.empty;
  }

  const snapped: Array<{ from: number; to: number; value: GroupValue }> = [];

  ranges.between(0, doc.length, (from, to, value) => {
    // `RangeSet` stores half-open ranges. When `to` equals the start of the
    // next line we subtract one so we can ask CodeMirror for the line that
    // actually contains the range.
    const startLine = doc.lineAt(from);
    const endPos = to > from ? to - 1 : to;
    const endLine = doc.lineAt(endPos);

    // Store the snapped range for reconstruction via `RangeSet.of`.
    snapped.push({ from: startLine.from, to: endLine.to, value });
  });

  return RangeSet.of(snapped, true);
}

const groupDecorations = [
  // Pre-create decorations for each color bucket so we can reuse them when we
  // iterate through the range set. This keeps decoration creation cheap.
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
      // Pick the color bucket deterministically so each group gets a stable
      // appearance across renders.
      const colorIndex = value.groupIndex % groupDecorations.length;
      const decoration = groupDecorations[colorIndex];
      decorations.push(decoration.range(from, to));
    });

    // If no groups are active we return `Decoration.none` to avoid pointless
    // DOM updates.
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

const groupRangesHistory = invertedEffects.of((tr) => {
  const previous = tr.startState.field(groupRangesField);
  const hasExplicitEffect = tr.effects.some((effect) =>
    effect.is(setGroupRanges)
  );

  if (!tr.docChanged && !hasExplicitEffect) {
    // If neither the document nor the group state changed we can skip storing
    // anything for the undo history.
    return [];
  }

  // Push the previous RangeSet into the history stack. When the transaction is
  // inverted (undo) CodeMirror will reapply this effect, which restores the
  // exact pre-snap state before the field performs its regular snapping pass.
  return [setGroupRanges.of(previous)];
});

export const resultGroupingExtension = [
  // Order does not matter much here, but we keep the field first so other
  // extensions (decorations/history) can read from it during initialization.
  groupRangesField,
  groupDecorationsField,
  groupTheme,
  groupRangesHistory,
];
