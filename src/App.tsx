import "./style.css";
import { Editor, EditorHandles } from "./Editor";
import { OutputPane } from "./OutputPane";
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
  const [lineGroupHeights, setLineGroupHeights] = useState<number[]>([]);
  const [executeResults, setExecuteResults] =
    useState<ApiExecuteResponse | null>(null);
  const [currentDoc, setCurrentDoc] = useState<Text | null>(null);
  const [currentLineGroups, setCurrentLineGroups] = useState<LineGroup[]>([]);
  const [lineGroupTops, setLineGroupTops] = useState<number[]>([]);

  const handleLineGroupHeightChange = useCallback((heights: number[]) => {
    console.log("App received line group heights:", heights.slice(0, 5));
    setLineGroupHeights(heights);
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

  const handleLineGroupTopChange = useCallback((tops: number[]) => {
    console.log("App received line group tops:", tops.slice(0, 5));
    setLineGroupTops(tops);
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
            onExecute={handleExecute}
            onDocumentChange={handleDocumentChange}
            onLineGroupsChange={handleLineGroupsChange}
            onLineGroupTopChange={handleLineGroupTopChange}
            lineGroupHeights={lineGroupHeights}
          />
        </div>
        <div className="output-half">
          {executeResults && (
            <OutputPane
              onLineGroupHeightChange={handleLineGroupHeightChange}
              results={executeResults.results}
              lineGroups={currentLineGroups}
              lineGroupTops={lineGroupTops}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
