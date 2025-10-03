import "./style.css";
import { Editor } from "./Editor";
import { OutputPane, OutputHeight } from "./OutputPane";
import { DebugPanel } from "./DebugPanel";
import { LineHeight } from "./line-heights";
import { executeScript, ApiExecuteResponse } from "./api";
import { RangeSet, Text } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { computeLineGroups } from "./compute-line-groups";
import { GroupValue } from "./result-grouping-plugin";

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
  const [groupRanges, setGroupRanges] = useState<RangeSet<GroupValue>>(
    RangeSet.empty
  );
  const [currentDoc, setCurrentDoc] = useState<Text | null>(null);
  const isSyncing = useRef<boolean>(false);

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

    const doc = Text.of(script.split("\n"));
    setCurrentDoc(doc);

    const groups = computeLineGroups(result.results);
    if (groups.length === 0) {
      setGroupRanges(RangeSet.empty);
      return;
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

    setGroupRanges(RangeSet.of(ranges, true));
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
            groupRanges={groupRanges}
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
        groupRanges={groupRanges}
        currentDoc={currentDoc}
      />
    </div>
  );
}

export default App;
