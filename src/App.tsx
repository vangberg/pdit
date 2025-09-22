import "./style.css";
import { Editor } from "./Editor";
import { PreviewPane, PreviewHeight } from "./PreviewPane";
import { DebugPanel } from "./DebugPanel";
import { LineHeight } from "./line-heights";
import { executeScript, ApiExecuteResponse } from "./api";
import { RangeSet, RangeValue } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";

class ResultIdValue extends RangeValue {
  constructor(public id: number) {
    super();
  }

  eq(other: ResultIdValue) {
    return this.id === other.id;
  }
}

const initialCode = `// Welcome to CodeMirror, this is a very long, long line!
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));

// Try editing this code!
const greeting = "Hello, CodeMirror!";
console.log(greeting);`;

function App() {
  const [editorHeights, setEditorHeights] = useState<LineHeight[]>([]);
  const [previewHeights, setPreviewHeights] = useState<PreviewHeight[]>([]);
  const [targetPreviewHeights, setTargetPreviewHeights] = useState<
    PreviewHeight[]
  >([
    { line: 2, height: 300 }, // Example initial target heights
    { line: 4, height: 200 },
  ]);
  const [targetEditorHeights, setTargetEditorHeights] = useState<LineHeight[]>(
    []
  );
  const [executeResults, setExecuteResults] =
    useState<ApiExecuteResponse | null>(null);
  const [resultRanges, setResultRanges] = useState<RangeSet<ResultIdValue>>(
    RangeSet.empty
  );
  const isSyncing = useRef<boolean>(false);

  // Declarative height syncing - runs automatically when heights change
  useEffect(() => {
    if (editorHeights.length === 0 || previewHeights.length === 0) return;
    if (isSyncing.current) return;

    isSyncing.current = true;

    const maxLines = Math.max(editorHeights.length, previewHeights.length);
    const editorTargets: LineHeight[] = [];
    const previewTargets: PreviewHeight[] = [];

    for (let line = 1; line <= maxLines; line++) {
      const editorHeight = editorHeights[line - 1]?.height || 0;
      const previewHeight = previewHeights[line - 1]?.height || 0;
      const targetHeight = Math.max(editorHeight, previewHeight);

      if (targetHeight > 0) {
        editorTargets.push({ line, height: targetHeight });
        previewTargets.push({ line, height: targetHeight });
      }
    }

    // Set target heights via props (declarative)
    setTargetEditorHeights(editorTargets);
    setTargetPreviewHeights(previewTargets);

    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [editorHeights, previewHeights]);

  const handleEditorHeightChange = useCallback((heights: LineHeight[]) => {
    console.log("App received editor heights:", heights.slice(0, 5));
    setEditorHeights(heights);
  }, []);

  const handlePreviewHeightChange = useCallback((heights: PreviewHeight[]) => {
    console.log("App received preview heights:", heights.slice(0, 5));
    setPreviewHeights(heights);
  }, []);

  const handleResultRangesChange = useCallback((ranges: RangeSet<RangeValue>) => {
    console.log("App received updated result ranges:", ranges);
    setResultRanges(ranges as RangeSet<ResultIdValue>);
  }, []);

  const handleExecute = useCallback(async (script: string) => {
    const result = await executeScript(script);
    console.log("Execute result:", result);
    setExecuteResults(result);

    // Create RangeSet from result positions
    const ranges = result.results.map((r) => ({
      from: r.from,
      to: r.to,
      value: new ResultIdValue(r.id),
    }));
    setResultRanges(RangeSet.of(ranges));
  }, []);

  return (
    <div id="app">
      <div className="split-container">
        <div className="editor-half">
          <Editor
            initialCode={initialCode}
            onHeightChange={handleEditorHeightChange}
            targetHeights={targetEditorHeights}
            onExecute={handleExecute}
            resultRanges={resultRanges}
            onResultRangesChange={handleResultRangesChange}
          />
        </div>
        <div className="preview-half">
          {executeResults && (
            <PreviewPane
              onHeightChange={handlePreviewHeightChange}
              targetHeights={targetPreviewHeights}
              results={executeResults.results}
            />
          )}
        </div>
      </div>

      <DebugPanel
        editorHeights={editorHeights}
        previewHeights={previewHeights}
        targetEditorHeights={targetEditorHeights}
        targetPreviewHeights={targetPreviewHeights}
        isSyncing={isSyncing.current}
        executeResults={executeResults}
        resultRanges={resultRanges}
      />
    </div>
  );
}

export default App;
