import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
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
  lineGroupHeightExtension,
  setLineGroupHeights,
} from "./line-group-heights";
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
  onExecute?: (script: string) => void;
  onDocumentChange?: (doc: Text) => void;
  onLineGroupsChange?: (groups: LineGroup[]) => void;
  onLineGroupTopChange?: (tops: number[]) => void;
  lineGroupHeights?: number[];
  ref?: React.Ref<EditorHandles>;
}

export function Editor({
  initialCode,
  onExecute,
  onDocumentChange,
  onLineGroupsChange,
  onLineGroupTopChange,
  lineGroupHeights,
  ref: externalRef,
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onExecuteRef = useRef(onExecute);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onLineGroupsChangeRef = useRef(onLineGroupsChange);
  const onLineGroupTopChangeRef = useRef(onLineGroupTopChange);
  const lastLineGroupTopsRef = useRef<number[] | null>(null);

  const requestLineGroupTopMeasurement = useCallback(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.requestMeasure<number[] | null>({
      read: (innerView) => {
        if (!onLineGroupTopChangeRef.current) {
          return null;
        }

        const groups = innerView.state.field(lineGroupsField);
        if (!groups.length) {
          return [];
        }

        return groups.map((group) => {
          const line = innerView.state.doc.line(group.lineStart);
          const block = innerView.lineBlockAt(line.from);
          return Math.max(0, block.top);
        });
      },
      write: (tops) => {
        if (!tops || !onLineGroupTopChangeRef.current) {
          return;
        }

        const previous = lastLineGroupTopsRef.current;
        const changed =
          !previous ||
          previous.length !== tops.length ||
          tops.some((top, index) => {
            const prevTop = previous[index];
            return prevTop === undefined || Math.abs(prevTop - top) > 0.5;
          });

        if (!changed) {
          return;
        }

        lastLineGroupTopsRef.current = tops;
        onLineGroupTopChangeRef.current(tops);
      },
    });
  }, []);

  // Mirror the latest callbacks so long-lived view listeners stay up to date
  useEffect(() => {
    onExecuteRef.current = onExecute;
  }, [onExecute]);

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  }, [onDocumentChange]);

  useEffect(() => {
    onLineGroupsChangeRef.current = onLineGroupsChange;
  }, [onLineGroupsChange]);
  useEffect(() => {
    onLineGroupTopChangeRef.current = onLineGroupTopChange;
    lastLineGroupTopsRef.current = null;
  }, [onLineGroupTopChange]);

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
        lineGroupHeightExtension,
        resultGroupingExtension,
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

          if (
            onLineGroupTopChangeRef.current &&
            (update.docChanged ||
              update.geometryChanged ||
              update.viewportChanged ||
              groupsChanged)
          ) {
            requestLineGroupTopMeasurement();
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
      lastLineGroupTopsRef.current = null;
    };
  }, []);

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
    const view = viewRef.current;
    if (!view || !lineGroupHeights || lineGroupHeights.length === 0) {
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

  return <div id="editor" ref={editorRef} />;
}
