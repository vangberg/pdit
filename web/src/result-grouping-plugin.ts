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
import { LineGroup } from "./compute-line-groups";
import { debugPanelState } from "./codemirror-debug-panel";

export class GroupValue extends RangeValue {
  // GroupValue carries metadata for a single group range. `resultIds`
  // tracks which execution results contributed to the group so that the
  // debugger panel can present relevant information.
  constructor(
    public id: string,
    public resultIds: number[],
    public allInvisible: boolean = false
  ) {
    super();
  }

  eq(other: GroupValue) {
    // Compare allInvisible flag for proper decoration updates
    return this.allInvisible === other.allInvisible;
  }
}

export const setGroupRanges = StateEffect.define<RangeSet<GroupValue>>({
  map(value, mapping) {
    // Map the ranges through any document changes in this transaction.
    // This is essential for undo/redo where the ranges need to be adjusted
    // to match the document state after the changes are applied.
    return value.map(mapping);
  },
});

export const setLineGroups = StateEffect.define<LineGroup[]>({
  map(value) {
    return value;
  },
});

export const setLastExecutedIds = StateEffect.define<number[]>({
  map(value) {
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
    let explicitSet: RangeSet<GroupValue> | null = null;
    let explicitGroups: LineGroup[] | null = null;

    for (const effect of tr.effects) {
      if (effect.is(setGroupRanges)) {
        // Keep the last explicit value so batched undo transactions restore the
        // oldest snapshot instead of the most recent intermediate one.
        explicitSet = effect.value;
      } else if (effect.is(setLineGroups)) {
        explicitGroups = effect.value;
      }
    }

    if (explicitGroups) {
      const fromGroups = lineGroupsToRangeSet(tr.state.doc, explicitGroups);
      return normalizeGroupRanges(fromGroups, tr.state.doc);
    }

    if (explicitSet) {
      // A new set of groups arrived from React or via undo. Snap to full lines
      // using the latest document so that the stored state stays line-aligned.
      return normalizeGroupRanges(explicitSet, tr.state.doc);
    }

    if (tr.docChanged) {
      // Regular document edits (including undo/redo) flow through here. We map
      // the old ranges through the change set to keep their endpoints aligned
      // with the content, and then snap to the full lines that are currently
      // covered.
      const mapped = ranges.map(tr.changes);
      return normalizeGroupRanges(mapped, tr.state.doc);
    }

    // No relevant effects: keep the existing RangeSet instance.
    return ranges;
  },
});

function normalizeGroupRanges(
  ranges: RangeSet<GroupValue>,
  doc: Text
): RangeSet<GroupValue> {
  if (ranges.size === 0) {
    // Fast path for the common case where the set is empty.
    return RangeSet.empty;
  }

  const snapped = snapRangesToFullLines(ranges, doc);
  const merged = mergeSnappedRanges(snapped);

  return RangeSet.of(merged, true);
}

export function lineGroupsToRangeSet(
  doc: Text,
  groups: LineGroup[]
): RangeSet<GroupValue> {
  if (groups.length === 0) {
    return RangeSet.empty;
  }

  const ranges = groups.map((group) => {
    const fromLine = doc.line(group.lineStart);
    const toLine = doc.line(group.lineEnd);

    return {
      from: fromLine.from,
      to: toLine.to,
      value: new GroupValue(group.id, group.resultIds, group.allInvisible || false),
    };
  });

  return RangeSet.of(ranges, true);
}

export function rangeSetToLineGroups(
  ranges: RangeSet<GroupValue>,
  doc: Text
): LineGroup[] {
  if (ranges.size === 0) {
    return [];
  }

  const groups: LineGroup[] = [];

  ranges.between(0, doc.length, (from, to, value) => {
    const startLine = doc.lineAt(from).number;
    const endPos = to > from ? to - 1 : to;
    const endLine = doc.lineAt(endPos).number;

    groups.push({
      id: value.id,
      lineStart: startLine,
      lineEnd: endLine,
      resultIds: [...value.resultIds].sort((a, b) => a - b),
      allInvisible: value.allInvisible,
    });
  });

  return groups;
}

function normalizeLineGroups(groups: LineGroup[], doc: Text): LineGroup[] {
  if (groups.length === 0) {
    return [];
  }

  const normalizedSet = normalizeGroupRanges(
    lineGroupsToRangeSet(doc, groups),
    doc
  );

  return rangeSetToLineGroups(normalizedSet, doc);
}

function areLineGroupsEqual(a: LineGroup[], b: LineGroup[]): boolean {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index++) {
    const groupA = a[index];
    const groupB = b[index];

    if (
      groupA.lineStart !== groupB.lineStart ||
      groupA.lineEnd !== groupB.lineEnd ||
      groupA.resultIds.length !== groupB.resultIds.length ||
      groupA.allInvisible !== groupB.allInvisible
    ) {
      return false;
    }

    for (let idIndex = 0; idIndex < groupA.resultIds.length; idIndex++) {
      if (groupA.resultIds[idIndex] !== groupB.resultIds[idIndex]) {
        return false;
      }
    }
  }

  return true;
}

export const lineGroupsField = StateField.define<LineGroup[]>({
  create() {
    return [];
  },

  update(groups, tr) {
    const doc = tr.state.doc;
    let nextGroups: LineGroup[] | null = null;

    for (const effect of tr.effects) {
      if (effect.is(setLineGroups)) {
        nextGroups = normalizeLineGroups(effect.value, doc);
        break;
      }

      if (effect.is(setGroupRanges)) {
        const normalized = normalizeGroupRanges(effect.value, doc);
        nextGroups = rangeSetToLineGroups(normalized, doc);
        break;
      }
    }

    if (!nextGroups && tr.docChanged) {
      const ranges = tr.state.field(groupRangesField);
      nextGroups = rangeSetToLineGroups(ranges, doc);
    }

    if (!nextGroups) {
      return groups;
    }

    return areLineGroupsEqual(groups, nextGroups) ? groups : nextGroups;
  },
});

export const lastExecutedIdsField = StateField.define<Set<number>>({
  create() {
    return new Set();
  },

  update(ids, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLastExecutedIds)) {
        return new Set(effect.value);
      }
    }
    return ids;
  },
});

function snapRangesToFullLines(
  ranges: RangeSet<GroupValue>,
  doc: Text
): Array<{ from: number; to: number; value: GroupValue }> {
  const snapped: Array<{ from: number; to: number; value: GroupValue }> = [];

  ranges.between(0, doc.length, (from, to, value) => {
    // `RangeSet` stores half-open ranges. When `to` equals the start of the
    // next line we subtract one so we can ask CodeMirror for the line that
    // actually contains the range.
    const startLine = doc.lineAt(from);
    const endPos = to > from ? to - 1 : to;
    const endLine = doc.lineAt(endPos);

    // Skip empty ranges - they represent deleted or collapsed groups
    if (startLine.from >= endLine.to) {
      return;
    }

    // Store the snapped range for reconstruction via `RangeSet.of`.
    snapped.push({ from: startLine.from, to: endLine.to, value });
  });

  return snapped;
}

function mergeSnappedRanges(
  ranges: Array<{ from: number; to: number; value: GroupValue }>
): Array<{ from: number; to: number; value: GroupValue }> {
  if (ranges.length === 0) {
    return ranges;
  }

  const merged: Array<{ from: number; to: number; value: GroupValue }> = [];
  let current = { ...ranges[0] };

  for (let index = 1; index < ranges.length; index++) {
    const next = ranges[index];

    if (next.from <= current.to) {
      // Ranges overlap - merge them by combining their result IDs
      const combinedResultIds = [
        ...current.value.resultIds,
        ...next.value.resultIds
      ];
      // Deduplicate while preserving order (first occurrence wins)
      const uniqueResultIds = Array.from(new Set(combinedResultIds));

      // Merged group is invisible only if both groups are invisible
      const mergedAllInvisible = current.value.allInvisible && next.value.allInvisible;

      current = {
        ...current,
        to: Math.max(current.to, next.to),
        value: new GroupValue(current.value.id, uniqueResultIds, mergedAllInvisible)
      };
      continue;
    }

    merged.push(current);
    current = { ...next };
  }

  merged.push(current);
  return merged;
}

const groupDecoration = Decoration.mark({ class: "cm-result-line" });

export const groupDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(_, tr) {
    const isDebugMode = tr.state.field(debugPanelState, false);

    // Only show decorations when debug panel is open
    if (!isDebugMode) {
      return Decoration.none;
    }

    const groupRanges = tr.state.field(groupRangesField);
    const decorations: any[] = [];

    groupRanges.between(0, tr.state.doc.length, (from, to) => {
      decorations.push(groupDecoration.range(from, to));
    });

    // If no groups are active we return `Decoration.none` to avoid pointless
    // DOM updates.
    return decorations.length === 0
      ? Decoration.none
      : Decoration.set(decorations, true);
  },

  provide: (f) => EditorView.decorations.from(f),
});

// Line background decorations (always visible, not just in debug mode)
export const lineGroupBackgroundField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(_, tr) {
    const lineGroups = tr.state.field(lineGroupsField);

    if (lineGroups.length === 0) {
      return Decoration.none;
    }

    const decorations: any[] = [];

    // Get the set of last executed result IDs
    const lastExecutedIds = tr.state.field(lastExecutedIdsField);

    for (const group of lineGroups) {
      const isRecent = group.resultIds.some(id => lastExecutedIds.has(id));

      // For invisible groups, use different classes (border only, no background)
      let bgClass: string;
      if (group.allInvisible) {
        bgClass = isRecent ? 'cm-line-group-invisible cm-line-group-recent' : 'cm-line-group-invisible';
      } else {
        bgClass = isRecent ? 'cm-line-group-bg cm-line-group-recent' : 'cm-line-group-bg';
      }

      for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
        const line = tr.state.doc.line(lineNum);
        decorations.push(Decoration.line({ class: bgClass }).range(line.from));
        // Add border to first line of each group (skip for invisible groups)
        if (lineNum === group.lineStart && !group.allInvisible) {
          decorations.push(Decoration.line({ class: 'cm-line-group-top' }).range(line.from));
        }
      }
    }

    return decorations.length === 0
      ? Decoration.none
      : Decoration.set(decorations, true);
  },

  provide: (f) => EditorView.decorations.from(f),
});

const groupTheme = EditorView.theme({
  ".cm-result-line": {
    backgroundColor: "rgba(225, 239, 254, 0.3)",
  },
  ".cm-line-group-bg": {
    backgroundColor: "rgba(225, 239, 254, 0.3)",
    borderLeft: "3px solid #7dd3fc",
  },
  ".cm-line-group-invisible": {
    // Border only, no background for invisible groups
    borderLeft: "3px solid #7dd3fc",
  },
  ".cm-line-group-top": {
    borderTop: "1px solid rgba(125, 211, 252, 0.4)",
  },
  ".cm-line-group-recent": {
    borderLeft: "3px solid #0284c7",
  },
  ".cm-preview-spacer": {
    backgroundColor: "rgba(225, 239, 254, 0.3)",
    borderLeft: "3px solid #7dd3fc",
  },
  ".cm-preview-spacer-recent": {
    borderLeft: "3px solid #0284c7",
  },
  // Make selections more visible on colored backgrounds
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(0, 0, 0, 0.3) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(0, 100, 200, 0.4) !important",
  },
});

const groupRangesHistory = invertedEffects.of((tr) => {
  const previous = tr.startState.field(groupRangesField);
  const hasExplicitEffect = tr.effects.some((effect) =>
    effect.is(setGroupRanges) || effect.is(setLineGroups)
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

const lastExecutedIdsHistory = invertedEffects.of((tr) => {
  const previous = tr.startState.field(lastExecutedIdsField);
  const hasExplicitEffect = tr.effects.some((effect) =>
    effect.is(setLastExecutedIds)
  );

  if (!hasExplicitEffect) {
    // Only store in history if lastExecutedIds was explicitly changed
    return [];
  }

  // Store the previous set of IDs so undo can restore them
  return [setLastExecutedIds.of(Array.from(previous))];
});

export const resultGroupingExtension = [
  // Order does not matter much here, but we keep the field first so other
  // extensions (decorations/history) can read from it during initialization.
  groupRangesField,
  lineGroupsField,
  lastExecutedIdsField,
  groupDecorationsField,
  lineGroupBackgroundField,
  groupTheme,
  groupRangesHistory,
  lastExecutedIdsHistory,
];
