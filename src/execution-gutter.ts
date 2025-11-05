import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { LineGroup } from "./compute-line-groups";

// Execution history tracking
// - everExecuted: all line groups that have been executed at some point
// - lastExecuted: line groups executed in the last request
interface ExecutionHistory {
  everExecuted: LineGroup[];
  lastExecuted: LineGroup[];
}

// StateEffect to update execution history
export const updateExecutionHistory = StateEffect.define<LineGroup[]>();

// Helper to check if two line groups overlap or match
function lineGroupsMatch(a: LineGroup, b: LineGroup): boolean {
  return a.lineStart === b.lineStart && a.lineEnd === b.lineEnd;
}

// StateField to track execution history (exported so other modules can read it)
export const executionHistoryField = StateField.define<ExecutionHistory>({
  create() {
    return {
      everExecuted: [],
      lastExecuted: [],
    };
  },

  update(history, tr) {
    for (const effect of tr.effects) {
      if (effect.is(updateExecutionHistory)) {
        const newGroups = effect.value;

        // Add previous lastExecuted to everExecuted
        const updatedEverExecuted = [...history.everExecuted];
        for (const oldGroup of history.lastExecuted) {
          const exists = updatedEverExecuted.some(g => lineGroupsMatch(g, oldGroup));
          if (!exists) {
            updatedEverExecuted.push(oldGroup);
          }
        }

        // Merge new groups into everExecuted (deduplicate by line range)
        for (const newGroup of newGroups) {
          const exists = updatedEverExecuted.some(g => lineGroupsMatch(g, newGroup));
          if (!exists) {
            updatedEverExecuted.push(newGroup);
          }
        }

        // Replace lastExecuted with only the new groups
        return {
          everExecuted: updatedEverExecuted,
          lastExecuted: newGroups,
        };
      }
    }
    return history;
  },
});

// Build DecorationSet of line decorations based on execution history
const executionDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(_, tr) {
    const history = tr.state.field(executionHistoryField);
    const doc = tr.state.doc;
    const decorations: any[] = [];

    // Build sets of line numbers for quick lookup
    const lastExecutedLines = new Set<number>();
    for (const group of history.lastExecuted) {
      for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
        lastExecutedLines.add(lineNum);
      }
    }

    const everExecutedLines = new Set<number>();
    for (const group of history.everExecuted) {
      for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
        everExecutedLines.add(lineNum);
      }
    }

    // Add decorations for all lines in everExecuted
    for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
      try {
        const line = doc.line(lineNum);

        // If in lastExecuted → dark blue (takes priority)
        if (lastExecutedLines.has(lineNum)) {
          decorations.push(
            Decoration.line({ class: "cm-execution-recent" }).range(line.from)
          );
        }
        // Else if in everExecuted → light blue
        else if (everExecutedLines.has(lineNum)) {
          decorations.push(
            Decoration.line({ class: "cm-execution-previous" }).range(line.from)
          );
        }
      } catch (e) {
        continue;
      }
    }

    return decorations.length === 0
      ? Decoration.none
      : Decoration.set(decorations, true);
  },

  provide: (f) => EditorView.decorations.from(f),
});

// Theme for execution state decorations
const executionTheme = EditorView.theme({
  ".cm-execution-recent": {
    borderLeft: "4px solid #0066cc",
    paddingLeft: "2px",
  },
  ".cm-execution-previous": {
    borderLeft: "4px solid #99ccff",
    paddingLeft: "2px",
  },
});

// Export the execution state extension
export const executionGutterExtension = [
  executionHistoryField,
  executionDecorationField,
  executionTheme,
];

// Export function to update execution history from outside
export function setExecutionHistory(view: EditorView, lineGroups: LineGroup[]) {
  view.dispatch({
    effects: updateExecutionHistory.of(lineGroups),
  });
}
