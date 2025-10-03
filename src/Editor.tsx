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
import { EditorState, RangeSet, Text } from "@codemirror/state";
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
import { zebraStripes } from "./zebra-stripes";
import {
  resultGroupingExtension,
  setGroupRanges,
  GroupValue,
  groupRangesField,
} from "./result-grouping-plugin";
import { computeLineGroups } from "./compute-line-groups";
import { ApiExecuteResult } from "./api";

export interface EditorHandles {
  applyExecutionUpdate: (update: {
    doc: string;
    results: ApiExecuteResult[];
  }) => void;
}

interface EditorProps {
  initialCode: string;
  onHeightChange?: (heights: LineHeight[]) => void;
  targetHeights?: LineHeight[];
  onExecute?: (script: string) => void;
  onDocumentChange?: (doc: Text) => void;
  onGroupRangesChange?: (ranges: RangeSet<GroupValue>) => void;
  ref?: React.Ref<EditorHandles>;
}

export const buildGroupRangeSet = (
  doc: Text,
  groups: ReturnType<typeof computeLineGroups>
): RangeSet<GroupValue> => {
  if (groups.length === 0) {
    return RangeSet.empty;
  }

  const ranges = groups.map((group, index) => {
    const fromLine = doc.line(group.lineStart);
    const toLine = doc.line(group.lineEnd);

    return {
      from: fromLine.from,
      to: toLine.to,
      value: new GroupValue(index, group.resultIds),
    };
  });

  return RangeSet.of(ranges, true);
};

export function Editor({
  initialCode,
  onHeightChange,
  targetHeights,
  onExecute,
  onDocumentChange,
  onGroupRangesChange,
  ref: externalRef,
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onExecuteRef = useRef(onExecute);
  const onHeightChangeRef = useRef(onHeightChange);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onGroupRangesChangeRef = useRef(onGroupRangesChange);

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
    onGroupRangesChangeRef.current = onGroupRangesChange;
  }, [onGroupRangesChange]);

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
        zebraStripes(),
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

          if (onGroupRangesChangeRef.current) {
            const previous = update.startState.field(groupRangesField);
            const next = update.state.field(groupRangesField);

            if (previous !== next) {
              onGroupRangesChangeRef.current(next as RangeSet<GroupValue>);
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
    onGroupRangesChangeRef.current?.(
      view.state.field(groupRangesField) as RangeSet<GroupValue>
    );

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
        results,
      }: {
        doc: string;
        results: ApiExecuteResult[];
      }) => {
        const view = viewRef.current;
        if (!view) {
          return;
        }

        const text = Text.of(doc.split("\n"));
        const groups = computeLineGroups(results);
        const rangeSet = buildGroupRangeSet(text, groups);

        const transaction: any = {
          selection: { anchor: doc.length },
          effects: setGroupRanges.of(rangeSet),
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
