import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { EditorState, RangeSet } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import {
  lineHeightExtension,
  setLineHeights,
  lineHeightChangeListener,
  LineHeight,
} from "./line-heights";
import { zebraStripes } from "./zebra-stripes";
import {
  rangeHighlightPlugin,
  reconfigureRanges,
} from "./range-highlight-plugin";
import {
  resultRangesSyncExtension,
  setResultRanges,
  ResultRangesChangeCallback,
  DocumentChangeCallback,
} from "./result-ranges-sync";
import React from "react";

interface EditorProps {
  initialCode: string;
  onHeightChange?: (heights: LineHeight[]) => void;
  targetHeights?: LineHeight[];
  onExecute?: (script: string) => void;
  resultRanges?: RangeSet<any>;
  onResultRangesChange?: ResultRangesChangeCallback;
  onDocumentChange?: DocumentChangeCallback;
}

export function Editor({
  initialCode,
  onHeightChange,
  targetHeights,
  onExecute,
  resultRanges,
  onResultRangesChange,
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
        basicSetup,
        javascript(),
        lineHeightExtension,
        lineHeightChangeListener((heights) => {
          console.log("Editor line heights changed:", heights.slice(0, 5));
          if (onHeightChange) {
            onHeightChange(heights);
          }
        }),
        rangeHighlightPlugin(resultRanges),
        ...(onResultRangesChange
          ? [resultRangesSyncExtension(onResultRangesChange, onDocumentChange)]
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

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initialCode, onHeightChange]);

  // Update ranges when resultRanges changes
  useEffect(() => {
    if (viewRef.current && resultRanges) {
      reconfigureRanges(viewRef.current, resultRanges);
      // Also update the sync StateField
      if (onResultRangesChange) {
        viewRef.current.dispatch({
          effects: setResultRanges.of(resultRanges),
        });
      }
    }
  }, [resultRanges, onResultRangesChange]);

  // Apply target heights when prop changes
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
