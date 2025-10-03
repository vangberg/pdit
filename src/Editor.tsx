import { useEffect, useRef } from "react";
import { EditorView } from "codemirror";
import {
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
} from "./result-grouping-plugin";
import React from "react";

interface EditorProps {
  initialCode: string;
  onHeightChange?: (heights: LineHeight[]) => void;
  targetHeights?: LineHeight[];
  onExecute?: (script: string) => void;
  groupRanges?: RangeSet<GroupValue>;
  onDocumentChange?: (doc: Text) => void;
}

export function Editor({
  initialCode,
  onHeightChange,
  targetHeights,
  onExecute,
  groupRanges,
  onDocumentChange,
}: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: initialCode,
      extensions: [
        keymap.of([
          {
            key: "Cmd-Enter",
            run: (view: EditorView) => {
              const currentText = view.state.doc.toString();
              onExecute?.(currentText);
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
          if (onHeightChange) {
            onHeightChange(heights);
          }
        }),
        resultGroupingExtension,
        ...(onDocumentChange
          ? [
              EditorView.updateListener.of((update: ViewUpdate) => {
                if (update.docChanged) {
                  onDocumentChange(update.state.doc);
                }
              }),
            ]
          : []),
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

    if (onDocumentChange) {
      onDocumentChange(view.state.doc);
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initialCode, onHeightChange, onExecute, onDocumentChange]);

  useEffect(() => {
    if (!viewRef.current || !groupRanges) {
      return;
    }

    viewRef.current.dispatch({
      effects: setGroupRanges.of(groupRanges),
    });
  }, [groupRanges]);

  useEffect(() => {
    if (targetHeights && targetHeights.length > 0 && viewRef.current) {
      requestAnimationFrame(() => {
        if (viewRef.current) {
          setLineHeights(viewRef.current, targetHeights);
        }
      });
    }
  }, [targetHeights]);

  return <div id="editor" ref={editorRef} />;
}
