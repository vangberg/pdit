import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  EditorView,
  keymap,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  lineNumbers,
  highlightActiveLineGutter,
  ViewUpdate,
} from "@codemirror/view";
import { Compartment, EditorState, Text, Transaction } from "@codemirror/state";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { python } from "@codemirror/lang-python";
import {
  resultGroupingExtension,
  setLineGroups,
  setLastExecutedIds,
  lineGroupsField,
} from "./result-grouping-plugin";
import { LineGroup } from "./compute-line-groups";
import {
  lineGroupLayoutExtension,
  setLineGroupHeights,
  lineGroupLayoutChangeFacet,
  LineGroupLayout,
} from "./line-group-layout";
import {
  debugPanelExtension,
  toggleDebugPanelCommand,
} from "./codemirror-debug-panel";
import {
  changedFromDiskExtension,
  setChangedFromDiskLines,
  changedFromDiskField,
} from "./changed-from-disk-plugin";

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export interface EditorHandles {
  applyExecutionUpdate: (update: {
    doc: string;
    lineGroups: LineGroup[];
    lastExecutedResultIds?: number[];
  }) => void;
  executeCurrent: () => void;
  insertMarkdownCell: () => void;
  focus: () => void;
}

interface EditorProps {
  initialCode: string;
  onExecuteCurrent?: (
    script: string,
    lineRange: { from: number; to: number }
  ) => void;
  onExecuteAll?: (script: string) => void;
  onDocumentChange?: (doc: Text) => void;
  onInitialDocumentLoad?: (doc: Text) => void;
  onLineGroupsChange?: (groups: LineGroup[]) => void;
  onLineGroupLayoutChange?: (layouts: Map<string, LineGroupLayout>) => void;
  lineGroupHeights?: Map<string, number>;
  changedFromDiskLines?: Set<number>;
  onChangedFromDiskLinesChange?: (lines: Set<number>) => void;
  ref?: React.Ref<EditorHandles>;
}

export function Editor({
  initialCode,
  onExecuteCurrent,
  onExecuteAll,
  onDocumentChange,
  onInitialDocumentLoad,
  onLineGroupsChange,
  onLineGroupLayoutChange,
  lineGroupHeights,
  changedFromDiskLines,
  onChangedFromDiskLinesChange,
  ref: externalRef,
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onExecuteCurrentRef = useRef(onExecuteCurrent);
  const onExecuteAllRef = useRef(onExecuteAll);
  const onInitialDocumentLoadRef = useRef(onInitialDocumentLoad);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onLineGroupsChangeRef = useRef(onLineGroupsChange);
  const onChangedFromDiskLinesChangeRef = useRef(onChangedFromDiskLinesChange);
  const lineGroupLayoutCallbackCompartment = useMemo(() => new Compartment(), []);

  // Mirror the latest callbacks so long-lived view listeners stay up to date
  useEffect(() => {
    onExecuteCurrentRef.current = onExecuteCurrent;
  }, [onExecuteCurrent]);

  useEffect(() => {
    onExecuteAllRef.current = onExecuteAll;
  }, [onExecuteAll]);

  useEffect(() => {
    onInitialDocumentLoadRef.current = onInitialDocumentLoad;
  }, [onInitialDocumentLoad]);

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  }, [onDocumentChange]);

  useEffect(() => {
    onLineGroupsChangeRef.current = onLineGroupsChange;
  }, [onLineGroupsChange]);

  useEffect(() => {
    onChangedFromDiskLinesChangeRef.current = onChangedFromDiskLinesChange;
  }, [onChangedFromDiskLinesChange]);

  const executeCurrentSelection = useCallback((view: EditorView) => {
    const selection = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(selection.from).number;
    const toLine = view.state.doc.lineAt(selection.to).number;
    const currentText = view.state.doc.toString();
    onExecuteCurrentRef.current?.(currentText, { from: fromLine, to: toLine });
  }, []);

  const insertMarkdownCellAtCursor = useCallback((view: EditorView) => {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);

    // Insert markdown cell template at the start of the current line
    // Template: # %% [markdown]\n"""\n\n"""
    const template = '# %% [markdown]\n"""\n\n"""';
    const insertPos = line.from;

    view.dispatch({
      changes: { from: insertPos, to: insertPos, insert: template + '\n' },
      // Position cursor on the empty line between the triple quotes
      selection: { anchor: insertPos + 20 }  // 20 = len('# %% [markdown]\n"""\n')
    });
  }, []);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: initialCode,
      extensions: [
        keymap.of([
          {
            key: "Cmd-Enter",
            run: (view: EditorView) => {
              executeCurrentSelection(view);
              return true;
            },
          },
          {
            key: "Cmd-Shift-Enter",
            run: (view: EditorView) => {
              const currentText = view.state.doc.toString();
              onExecuteAllRef.current?.(currentText);
              return true;
            },
          },
          {
            key: "Cmd-Shift-d",
            run: toggleDebugPanelCommand,
          },
          {
            key: "Cmd-Shift-m",
            run: (view: EditorView) => {
              insertMarkdownCellAtCursor(view);
              return true;
            },
          },
        ]),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
        ]),
        python(),
        resultGroupingExtension,
        lineGroupLayoutExtension,
        changedFromDiskExtension,
        debugPanelExtension(),
        lineGroupLayoutCallbackCompartment.of(
          lineGroupLayoutChangeFacet.of(onLineGroupLayoutChange ?? null)
        ),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onDocumentChangeRef.current?.(update.state.doc);
          }

          const previousGroups = update.startState.field(lineGroupsField);
          const nextGroups = update.state.field(lineGroupsField);
          const groupsChanged = previousGroups !== nextGroups;

          if (groupsChanged) {
            onLineGroupsChangeRef.current?.(nextGroups);
          }

          // Notify when changed-from-disk lines are updated
          const previousChangedRanges = update.startState.field(changedFromDiskField);
          const nextChangedRanges = update.state.field(changedFromDiskField);
          if (previousChangedRanges !== nextChangedRanges) {
            // Convert RangeSet positions back to line numbers
            const lineNums = new Set<number>();
            nextChangedRanges.between(0, update.state.doc.length, (from) => {
              lineNums.add(update.state.doc.lineAt(from).number);
            });
            onChangedFromDiskLinesChangeRef.current?.(lineNums);
          }
        }),
        EditorView.theme({
          "&": {
            height: "100%",
            width: "100%",
            backgroundColor: "white",
          },
          "&.cm-focused": {
            outline: "none",
          },
          ".cm-scroller": {
            fontFamily:
              'Fira Code, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    onInitialDocumentLoadRef.current?.(view.state.doc);
    if (onLineGroupsChangeRef.current) {
      onLineGroupsChangeRef.current(view.state.field(lineGroupsField));
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useImperativeHandle(
    externalRef,
    () => ({
      applyExecutionUpdate: ({
        doc,
        lineGroups,
        lastExecutedResultIds,
      }: {
        doc: string;
        lineGroups: LineGroup[];
        lastExecutedResultIds?: number[];
      }) => {
        const view = viewRef.current;
        if (!view) {
          return;
        }

        const effects: any[] = [setLineGroups.of(lineGroups)];
        if (lastExecutedResultIds) {
          effects.push(setLastExecutedIds.of(lastExecutedResultIds));
        }

        const transaction: any = {
          effects,
          // Don't add execution state changes to undo history
          annotations: Transaction.addToHistory.of(false),
        };

        if (doc !== view.state.doc.toString()) {
          transaction.changes = {
            from: 0,
            to: view.state.doc.length,
            insert: doc,
          };
        }

        view.dispatch(transaction);
      },
      executeCurrent: () => {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        executeCurrentSelection(view);
      },
      insertMarkdownCell: () => {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        insertMarkdownCellAtCursor(view);
      },
      focus: () => {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        view.focus();
      },
    }),
    [executeCurrentSelection, insertMarkdownCellAtCursor]
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !lineGroupHeights || lineGroupHeights.size === 0) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const currentView = viewRef.current;
      if (!currentView) {
        return;
      }

      setLineGroupHeights(currentView, lineGroupHeights);
    });

    return () => cancelAnimationFrame(frameId);
  }, [lineGroupHeights]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.dispatch({
      effects: lineGroupLayoutCallbackCompartment.reconfigure(
        lineGroupLayoutChangeFacet.of(onLineGroupLayoutChange ?? null)
      ),
    });
  }, [onLineGroupLayoutChange, lineGroupLayoutCallbackCompartment]);

  // Sync changedFromDiskLines prop with editor state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const newLines = changedFromDiskLines ?? new Set<number>();

    // Convert current RangeSet to line numbers for comparison
    const currentRanges = view.state.field(changedFromDiskField);
    const currentLines = new Set<number>();
    currentRanges.between(0, view.state.doc.length, (from) => {
      currentLines.add(view.state.doc.lineAt(from).number);
    });

    // Only dispatch if the sets are different
    if (!setsEqual(currentLines, newLines)) {
      view.dispatch({
        effects: setChangedFromDiskLines.of(newLines),
        annotations: Transaction.addToHistory.of(false),
      });
    }
  }, [changedFromDiskLines]);

  return <div id="editor" ref={editorRef} />;
}
