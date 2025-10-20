import "./style.css";
import { Editor, EditorHandles } from "./Editor";
import { OutputPane, OutputHeight } from "./OutputPane";
import { DebugPanel } from "./DebugPanel";
import { LineHeight } from "./line-heights";
import { executeScript, ApiExecuteResponse } from "./api";
import { Text } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { computeLineGroups, LineGroup } from "./compute-line-groups";

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
  const editorRef = useRef<EditorHandles | null>(null);
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
  const [currentDoc, setCurrentDoc] = useState<Text | null>(null);
  const [currentLineGroups, setCurrentLineGroups] = useState<LineGroup[]>([]);
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

  const handleLineGroupsChange = useCallback((groups: LineGroup[]) => {
    console.log("App received line groups change:", groups);
    setCurrentLineGroups(groups);
  }, []);

  const handleExecute = useCallback(async (script: string) => {
    const result = await executeScript(script);
    console.log("Execute result:", result);
    setExecuteResults(result);

    const groups = computeLineGroups(result.results);
    setCurrentLineGroups(groups);

    editorRef.current?.applyExecutionUpdate({
      doc: script,
      lineGroups: groups,
    });
  }, []);

  return (
    <div id="app">
      <div className="split-container">
        <div className="editor-half">
          <Editor
            ref={editorRef}
            initialCode={initialCode}
            onHeightChange={handleEditorHeightChange}
            targetHeights={targetEditorHeights}
            onExecute={handleExecute}
            onDocumentChange={handleDocumentChange}
            onLineGroupsChange={handleLineGroupsChange}
          />
        </div>
        <div className="output-half">
          {executeResults && (
            <OutputPane
              onHeightChange={handleOutputHeightChange}
              targetHeights={targetOutputHeights}
              results={executeResults.results}
              lineGroups={currentLineGroups}
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
        lineGroups={currentLineGroups}
        currentDoc={currentDoc}
      />
    </div>
  );
}

export default App;
