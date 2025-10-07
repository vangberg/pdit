import React, { useEffect, useImperativeHandle, useRef } from "react";
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
import { EditorState, Text } from "@codemirror/state";
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
import { javascript } from "@codemirror/lang-javascript";
import {
  lineHeightExtension,
  setLineHeights,
  lineHeightChangeListener,
  LineHeight,
} from "./line-heights";
import {
  resultGroupingExtension,
  setLineGroups,
  lineGroupsField,
} from "./result-grouping-plugin";
import { LineGroup } from "./compute-line-groups";

export interface EditorHandles {
  applyExecutionUpdate: (update: {
    doc: string;
    lineGroups: LineGroup[];
  }) => void;
}

interface EditorProps {
  initialCode: string;
  onHeightChange?: (heights: LineHeight[]) => void;
  targetHeights?: LineHeight[];
  onExecute?: (script: string) => void;
  onDocumentChange?: (doc: Text) => void;
  onLineGroupsChange?: (groups: LineGroup[]) => void;
  lineGroups?: LineGroup[];
  ref?: React.Ref<EditorHandles>;
}

export function Editor({
  initialCode,
  onHeightChange,
  targetHeights,
  onExecute,
  onDocumentChange,
  onLineGroupsChange,
  lineGroups,
  ref: externalRef,
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onExecuteRef = useRef(onExecute);
  const onHeightChangeRef = useRef(onHeightChange);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onLineGroupsChangeRef = useRef(onLineGroupsChange);

  // Mirror the latest callbacks so long-lived view listeners stay up to date
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  useEffect(() => {
    onHeightChangeRef.current = onHeightChange;
  }, [onHeightChange]);

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  }, [onDocumentChange]);

  useEffect(() => {
    onLineGroupsChangeRef.current = onLineGroupsChange;
  }, [onLineGroupsChange]);

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
              const currentText = view.state.doc.toString();
              onExecuteRef.current?.(currentText);
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
        javascript(),
        lineHeightExtension,
        lineHeightChangeListener((heights) => {
          console.log("Editor line heights changed:", heights.slice(0, 5));
          onHeightChangeRef.current?.(heights);
        }),
        resultGroupingExtension,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onDocumentChangeRef.current?.(update.state.doc);
          }

          if (onLineGroupsChangeRef.current) {
            const previousGroups = update.startState.field(lineGroupsField);
            const nextGroups = update.state.field(lineGroupsField);

            if (previousGroups !== nextGroups) {
              onLineGroupsChangeRef.current(nextGroups);
            }
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

    onDocumentChangeRef.current?.(view.state.doc);
    if (onLineGroupsChangeRef.current) {
      onLineGroupsChangeRef.current(view.state.field(lineGroupsField));
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || lineGroups === undefined) {
      return;
    }

    if (view.state.field(lineGroupsField) === lineGroups) {
      return;
    }

    view.dispatch({ effects: setLineGroups.of(lineGroups) });
  }, [lineGroups]);

  useImperativeHandle(
    externalRef,
    () => ({
      applyExecutionUpdate: ({
        doc,
        lineGroups,
      }: {
        doc: string;
        lineGroups: LineGroup[];
      }) => {
        const view = viewRef.current;
        if (!view) {
          return;
        }

        const transaction: any = {
          selection: { anchor: doc.length },
          effects: [setLineGroups.of(lineGroups)],
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
    }),
    []
  );

  useEffect(() => {
    if (!targetHeights || targetHeights.length === 0) {
      return;
    }

    const view = viewRef.current;
    if (!view) {
      return;
    }

    requestAnimationFrame(() => {
      if (viewRef.current) {
        setLineHeights(viewRef.current, targetHeights);
      }
    });
  }, [targetHeights]);

  return <div id="editor" ref={editorRef} />;
}
