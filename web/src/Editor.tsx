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
import { Compartment, EditorState, Text } from "@codemirror/state";
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
  lineGroupTopChangeFacet,
} from "./line-group-layout";
import {
  debugPanelExtension,
  toggleDebugPanelCommand,
} from "./codemirror-debug-panel";

export interface EditorHandles {
  applyExecutionUpdate: (update: {
    doc: string;
    lineGroups: LineGroup[];
    lastExecutedResultIds?: number[];
  }) => void;
  executeCurrent: () => void;
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
  onLineGroupTopChange?: (tops: Map<string, number>) => void;
  lineGroupHeights?: Map<string, number>;
  ref?: React.Ref<EditorHandles>;
}

export function Editor({
  initialCode,
  onExecuteCurrent,
  onExecuteAll,
  onDocumentChange,
  onInitialDocumentLoad,
  onLineGroupsChange,
  onLineGroupTopChange,
  lineGroupHeights,
  ref: externalRef,
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onExecuteCurrentRef = useRef(onExecuteCurrent);
  const onExecuteAllRef = useRef(onExecuteAll);
  const onInitialDocumentLoadRef = useRef(onInitialDocumentLoad);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onLineGroupsChangeRef = useRef(onLineGroupsChange);
  const lineGroupTopCallbackCompartment = useMemo(() => new Compartment(), []);

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

  const executeCurrentSelection = useCallback((view: EditorView) => {
    const selection = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(selection.from).number;
    const toLine = view.state.doc.lineAt(selection.to).number;
    const currentText = view.state.doc.toString();
    onExecuteCurrentRef.current?.(currentText, { from: fromLine, to: toLine });
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
        debugPanelExtension(),
        lineGroupTopCallbackCompartment.of(
          lineGroupTopChangeFacet.of(onLineGroupTopChange ?? null)
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
            overflow: "visible",
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
      focus: () => {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        view.focus();
      },
    }),
    [executeCurrentSelection]
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
      effects: lineGroupTopCallbackCompartment.reconfigure(
        lineGroupTopChangeFacet.of(onLineGroupTopChange ?? null)
      ),
    });
  }, [onLineGroupTopChange, lineGroupTopCallbackCompartment]);

  return <div id="editor" ref={editorRef} />;
}
