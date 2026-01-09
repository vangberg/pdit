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
import { LineGroup, LineGroupState } from "./compute-line-groups";
import { debugPanelState } from "./codemirror-debug-panel";
import {
  getLineGroupBackgroundClass,
  getLineGroupVisualFlags,
  shouldRenderLineGroupTopBorder,
} from "./line-group-appearance";

export class GroupValue extends RangeValue {
  // GroupValue carries metadata for a single group range. `resultIds`
  // tracks which execution results contributed to the group so that the
  // debugger panel can present relevant information.
  constructor(
    public id: string,
    public resultIds: number[],
    public allInvisible: boolean = false,
    public hasError: boolean = false,
    public state: LineGroupState = 'done'
  ) {
    super();
  }

  eq(other: GroupValue) {
    // Compare allInvisible flag and state for proper decoration updates
    return this.allInvisible === other.allInvisible &&
      this.hasError === other.hasError &&
      this.state === other.state;
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

export const setStaleGroupIds = StateEffect.define<string[]>({
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
      value: new GroupValue(
        group.id,
        group.resultIds,
        group.allInvisible || false,
        group.hasError || false,
        group.state
      ),
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
      hasError: value.hasError,
      state: value.state,
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
      groupA.allInvisible !== groupB.allInvisible ||
      groupA.hasError !== groupB.hasError ||
      groupA.state !== groupB.state
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

export const staleGroupIdsField = StateField.define<Set<string>>({
  create() {
    return new Set();
  },

  update(stale, tr) {
    const groups = tr.state.field(lineGroupsField);
    let explicitStale: string[] | null = null;
    for (const effect of tr.effects) {
      if (effect.is(setStaleGroupIds)) {
        explicitStale = effect.value;
      }
    }

    if (explicitStale) {
      if (groups.length === 0) {
        return new Set();
      }
      const groupIds = new Set(groups.map((group) => group.id));
      return new Set(explicitStale.filter((id) => groupIds.has(id)));
    }

    const hasSetLineGroups = tr.effects.some((effect) =>
      effect.is(setLineGroups)
    );

    if (hasSetLineGroups) {
      // New execution results clear stale state for all groups.
      return new Set();
    }

    const groupsChanged = tr.startState.field(lineGroupsField) !== groups;

    if (!tr.docChanged && !groupsChanged) {
      return stale;
    }

    if (groups.length === 0) {
      return new Set();
    }

    // Retain stale flags only for groups that still exist.
    const groupIds = new Set(groups.map((group) => group.id));
    const next = new Set<string>(
      Array.from(stale).filter((id) => groupIds.has(id))
    );

    if (!tr.docChanged) {
      return next;
    }

    // Use the mapped group ranges to detect overlap in the post-change document.
    const groupRanges = tr.state.field(groupRangesField);
    const groupStates = new Map(groups.map((group) => [group.id, group.state]));

    const changedRanges: Array<{ from: number; to: number }> = [];
    tr.changes.iterChanges((_fromA, _toA, fromB, toB) => {
      const end = Math.max(fromB, toB - 1);
      changedRanges.push({ from: fromB, to: end });
    });

    if (changedRanges.length === 0) {
      return next;
    }

    groupRanges.between(0, tr.state.doc.length, (from, to, value) => {
      if (groupStates.get(value.id) !== 'done') {
        return;
      }

      for (const change of changedRanges) {
        if (change.to < from || change.from > to) {
          continue;
        }
        next.add(value.id);
        break;
      }
    });
    return next;
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
      const mergedHasError = current.value.hasError || next.value.hasError;

      // Merged state: any executing → executing, any cancelled → cancelled, any pending → pending, otherwise done
      let mergedState: LineGroupState = 'done';
      if (current.value.state === 'executing' || next.value.state === 'executing') {
        mergedState = 'executing';
      } else if (current.value.state === 'cancelled' || next.value.state === 'cancelled') {
        mergedState = 'cancelled';
      } else if (current.value.state === 'pending' || next.value.state === 'pending') {
        mergedState = 'pending';
      }

      current = {
        ...current,
        to: Math.max(current.to, next.to),
        value: new GroupValue(
          current.value.id,
          uniqueResultIds,
          mergedAllInvisible,
          mergedHasError,
          mergedState
        )
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
    const staleGroupIds = tr.state.field(staleGroupIdsField);

    if (lineGroups.length === 0) {
      return Decoration.none;
    }

    const decorations: any[] = [];

    const lastExecutedIds = tr.state.field(lastExecutedIdsField);

    for (const group of lineGroups) {
      const flags = getLineGroupVisualFlags(group, lastExecutedIds, staleGroupIds);
      const bgClass = getLineGroupBackgroundClass(group, flags);
      if (!bgClass) {
        continue;
      }

      for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
        const line = tr.state.doc.line(lineNum);
        decorations.push(Decoration.line({ class: bgClass }).range(line.from));
        // Add border to first line of each group (skip for invisible and pending/executing groups)
        if (lineNum === group.lineStart && shouldRenderLineGroupTopBorder(group)) {
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
  // Done state (blue)
  ".cm-line-group-bg": {
    backgroundColor: "rgba(225, 239, 254, 0.3)",
    borderLeft: "3px solid #7dd3fc",
  },
  ".cm-line-group-invisible": {
    // Border only, no background for invisible groups
    borderLeft: "3px solid #7dd3fc",
  },
  ".cm-line-group-top": {
  },
  ".cm-line-group-recent": {
    borderLeft: "3px solid #0284c7",
  },
  // Error state (red)
  ".cm-line-group-error": {
    backgroundColor: "rgba(248, 113, 113, 0.15)",
    borderLeft: "3px solid #fca5a5",
  },
  ".cm-line-group-error-recent": {
    borderLeft: "3px solid #dc2626",
  },
  // Pending state (grey)
  ".cm-line-group-pending": {
    borderLeft: "3px solid #9ca3af",
    backgroundColor: "rgba(156, 163, 175, 0.1)",
  },
  // Executing state (green)
  ".cm-line-group-executing": {
    borderLeft: "3px solid #22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  ".cm-preview-spacer": {
    backgroundColor: "rgba(225, 239, 254, 0.3)",
    borderLeft: "3px solid #7dd3fc",
  },
  ".cm-preview-spacer-stale": {
    backgroundColor: "transparent",
    borderLeft: "none",
  },
  ".cm-preview-spacer-recent": {
    borderLeft: "3px solid #0284c7",
  },
  ".cm-preview-spacer-error": {
    backgroundColor: "rgba(248, 113, 113, 0.15)",
    borderLeft: "3px solid #fca5a5",
  },
  ".cm-preview-spacer-error-recent": {
    borderLeft: "3px solid #dc2626",
  },
  ".cm-preview-spacer-pending": {
    borderLeft: "3px solid #9ca3af",
    backgroundColor: "rgba(156, 163, 175, 0.1)",
  },
  ".cm-preview-spacer-executing": {
    borderLeft: "3px solid #22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
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
  staleGroupIdsField,
  groupDecorationsField,
  lineGroupBackgroundField,
  groupTheme,
  groupRangesHistory,
  lastExecutedIdsHistory,
];
