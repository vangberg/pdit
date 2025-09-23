import "./style.css";
import { Editor } from "./Editor";
import { OutputPane, OutputHeight } from "./OutputPane";
import { DebugPanel } from "./DebugPanel";
import { LineHeight } from "./line-heights";
import { executeScript, ApiExecuteResponse } from "./api";
import { RangeSet, RangeValue, Text } from "@codemirror/state";
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
  const [outputHeights, setOutputHeights] = useState<OutputHeight[]>([]);
  const [targetOutputHeights, setTargetOutputHeights] = useState<
    OutputHeight[]
  >([]);
  const [targetEditorHeights, setTargetEditorHeights] = useState<LineHeight[]>(
    []
  );
  const [executeResults, setExecuteResults] =
    useState<ApiExecuteResponse | null>(null);
  const [resultRanges, setResultRanges] = useState<RangeSet<ResultIdValue>>(
    RangeSet.empty
  );
  const [currentDoc, setCurrentDoc] = useState<Text | null>(null);
  const isSyncing = useRef<boolean>(false);

  // Declarative height syncing - runs automatically when heights change
  useEffect(() => {
    if (editorHeights.length === 0 || outputHeights.length === 0) return;
    if (isSyncing.current) return;

    isSyncing.current = true;

    const maxLines = Math.max(editorHeights.length, outputHeights.length);
    const editorTargets: LineHeight[] = [];
    const outputTargets: OutputHeight[] = [];

    for (let line = 1; line <= maxLines; line++) {
      const editorHeight = editorHeights[line - 1]?.height || 0;
      const outputHeight = outputHeights[line - 1]?.height || 0;
      const targetHeight = Math.max(editorHeight, outputHeight);

      if (targetHeight > 0) {
        editorTargets.push({ line, height: targetHeight });
        outputTargets.push({ line, height: targetHeight });
      }
    }

    // Set target heights via props (declarative)
    setTargetEditorHeights(editorTargets);
    setTargetOutputHeights(outputTargets);

    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [editorHeights, outputHeights]);

  const handleEditorHeightChange = useCallback((heights: LineHeight[]) => {
    console.log("App received editor heights:", heights.slice(0, 5));
    setEditorHeights(heights);
  }, []);

  const handleOutputHeightChange = useCallback((heights: OutputHeight[]) => {
    console.log("App received output heights:", heights.slice(0, 5));
    setOutputHeights(heights);
  }, []);

  const handleResultRangesChange = useCallback(
    (ranges: RangeSet<RangeValue>) => {
      console.log("App received updated result ranges:", ranges);
      setResultRanges(ranges as RangeSet<ResultIdValue>);
    },
    []
  );

  const handleDocumentChange = useCallback((doc: Text) => {
    console.log(
      "App received document change:",
      doc.toString().slice(0, 50) + "..."
    );
    setCurrentDoc(doc);
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
            onDocumentChange={handleDocumentChange}
          />
        </div>
        <div className="output-half">
          {executeResults && (
            <OutputPane
              onHeightChange={handleOutputHeightChange}
              targetHeights={targetOutputHeights}
              results={executeResults.results}
            />
          )}
        </div>
      </div>

      <DebugPanel
        editorHeights={editorHeights}
        outputHeights={outputHeights}
        targetEditorHeights={targetEditorHeights}
        targetOutputHeights={targetOutputHeights}
        isSyncing={isSyncing.current}
        executeResults={executeResults}
        resultRanges={resultRanges}
        currentDoc={currentDoc}
      />
    </div>
  );
}

export default App;
