import "./style.css";
import { Editor, EditorHandles } from "./Editor";
import { OutputPane } from "./OutputPane";
import { executeScript, ExecutionResult } from "./execution";
import { Text } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { computeLineGroups, LineGroup } from "./compute-line-groups";
import { initializeWebR } from "./webr-instance";

const initialCode = `# Welcome to Rokko - R in the browser!
# Try running this code with Cmd+Enter

x <- 1:10
print(x)

# Calculate mean
mean(x)`;

function App() {
  const editorRef = useRef<EditorHandles | null>(null);
  const [lineGroupHeights, setLineGroupHeights] = useState<Map<string, number>>(
    new Map()
  );
  const [executeResults, setExecuteResults] = useState<ExecutionResult | null>(
    null
  );
  const [currentLineGroups, setCurrentLineGroups] = useState<LineGroup[]>([]);
  const [lineGroupTops, setLineGroupTops] = useState<Map<string, number>>(
    new Map()
  );
  const [isWebRReady, setIsWebRReady] = useState(false);

  // Initialize webR on mount
  useEffect(() => {
    const init = async () => {
      try {
        console.log("Initializing webR...");
        await initializeWebR();
        console.log("webR ready!");
        setIsWebRReady(true);
      } catch (error) {
        console.error("Failed to initialize webR:", error);
      }
    };
    init();
  }, []);

  const handleLineGroupHeightChange = useCallback(
    (heights: Map<string, number>) => {
      console.log(
        "App received line group heights:",
        Array.from(heights.entries()).slice(0, 5)
      );
      setLineGroupHeights(heights);
    },
    []
  );

  const handleDocumentChange = useCallback((doc: Text) => {}, []);

  const handleLineGroupsChange = useCallback((groups: LineGroup[]) => {
    console.log("App received line groups change:", groups);
    setCurrentLineGroups(groups);
  }, []);

  const handleLineGroupTopChange = useCallback((tops: Map<string, number>) => {
    console.log(
      "App received line group tops:",
      Array.from(tops.entries()).slice(0, 5)
    );
    setLineGroupTops(tops);
  }, []);

  const handleExecute = useCallback(
    async (script: string) => {
      if (!isWebRReady) {
        console.warn("webR is not ready yet");
        return;
      }

      try {
        const result = await executeScript(script);
        console.log("Execute result:", result);
        setExecuteResults(result);

        const groups = computeLineGroups(result.results);
        setCurrentLineGroups(groups);

        editorRef.current?.applyExecutionUpdate({
          doc: script,
          lineGroups: groups,
        });
      } catch (error) {
        console.error("Execution error:", error);
      }
    },
    [isWebRReady]
  );

  return (
    <div id="app">
      {!isWebRReady && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            background: "#1e1e1e",
            color: "#fff",
            padding: "10px",
            textAlign: "center",
            zIndex: 1000,
          }}
        >
          Initializing R environment...
        </div>
      )}
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
