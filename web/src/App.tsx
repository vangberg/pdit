import "./style.css";
import { Editor, EditorHandles } from "./Editor";
import { OutputPane } from "./OutputPane";
import { executeScript, Expression } from "./execution-python";
import { Text } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { LineGroup } from "./compute-line-groups";
import { initializePyodide } from "./pyodide-instance";
import { TopBar } from "./TopBar";
import { useResults } from "./results";
import { useScriptFile } from "./use-script-file";

const DEFAULT_CODE = ``;

function App() {
  // Load script file from URL query parameter
  const scriptPath = new URLSearchParams(window.location.search).get("script");
  const { code: initialCode, isLoading: isLoadingScript, error: scriptError } = useScriptFile(
    scriptPath,
    DEFAULT_CODE
  );

  const editorRef = useRef<EditorHandles | null>(null);
  const { expressions, lineGroups, setLineGroups, addExpressions } =
    useResults();
  const [lineGroupHeights, setLineGroupHeights] = useState<Map<string, number>>(
    new Map()
  );
  const [lineGroupTops, setLineGroupTops] = useState<Map<string, number>>(
    new Map()
  );
  const [isPyodideReady, setIsPyodideReady] = useState(false);
  const [doc, setDoc] = useState<Text>();

  // Initialize Pyodide on mount
  useEffect(() => {
    const init = async () => {
      try {
        console.log("Initializing Pyodide...");
        await initializePyodide();
        console.log("Pyodide ready!");
        setIsPyodideReady(true);
      } catch (error) {
        console.error("Failed to initialize Pyodide:", error);
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

  const handleDocumentChange = useCallback((doc: Text) => {
    setDoc(doc);
  }, []);

  const handleLineGroupsChange = useCallback(
    (groups: LineGroup[]) => {
      console.log("App received line groups change:", groups);
      setLineGroups(groups);
    },
    [setLineGroups]
  );

  const handleLineGroupTopChange = useCallback((tops: Map<string, number>) => {
    console.log(
      "App received line group tops:",
      Array.from(tops.entries()).slice(0, 5)
    );
    setLineGroupTops(tops);
  }, []);

  const handleExecute = useCallback(
    async (
      script: string,
      options?: { lineRange?: { from: number; to: number } }
    ) => {
      if (!isPyodideReady) {
        console.warn("Pyodide is not ready yet");
        return;
      }

      try {
        const allExpressions: Expression[] = [];

        for await (const expression of executeScript(script, options)) {
          console.log("Execute expression:", expression);

          allExpressions.push(expression);

          const { lineGroups } = addExpressions(allExpressions, {
            lineRange: options?.lineRange,
          });

          editorRef.current?.applyExecutionUpdate({
            doc: script,
            lineGroups,
            lastExecutedResultIds: allExpressions.map((expr) => expr.id),
          });
        }
      } catch (error) {
        console.error("Execution error:", error);
      }
    },
    [isPyodideReady, addExpressions]
  );

  const handleExecuteCurrent = useCallback(
    (script: string, lineRange: { from: number; to: number }) => {
      handleExecute(script, { lineRange });
    },
    [handleExecute]
  );

  const handleExecuteAll = useCallback(
    (script: string) => {
      handleExecute(script);
    },
    [handleExecute]
  );

  const handleRunAll = useCallback(() => {
    handleExecuteAll(doc?.toString() || "");
    editorRef.current?.focus();
  }, [handleExecuteAll, doc]);

  const handleRunCurrent = useCallback(() => {
    editorRef.current?.executeCurrent();
    editorRef.current?.focus();
  }, []);

  // Show error if script failed to load
  if (scriptError) {
    return (
      <div id="app">
        <div style={{ padding: "20px", fontFamily: "monospace" }}>
          Error: {scriptError.message}
        </div>
      </div>
    );
  }

  // Show loading state while script is being loaded
  if (isLoadingScript || initialCode === null) {
    return (
      <div id="app">
        <div style={{ padding: "20px", fontFamily: "monospace" }}>
          Loading script...
        </div>
      </div>
    );
  }

  return (
    <div id="app">
      <TopBar
        isPyodideReady={isPyodideReady}
        onRunAll={handleRunAll}
        onRunCurrent={handleRunCurrent}
      />
      <div className="split-container">
        <div className="editor-half">
          <Editor
            ref={editorRef}
            initialCode={initialCode}
            onExecuteCurrent={handleExecuteCurrent}
            onExecuteAll={handleExecuteAll}
            onDocumentChange={handleDocumentChange}
            onLineGroupsChange={handleLineGroupsChange}
            onLineGroupTopChange={handleLineGroupTopChange}
            lineGroupHeights={lineGroupHeights}
          />
        </div>
        <div className="output-half">
          <OutputPane
            onLineGroupHeightChange={handleLineGroupHeightChange}
            expressions={Array.from(expressions.values())}
            lineGroups={lineGroups}
            lineGroupTops={lineGroupTops}
            lineGroupHeights={lineGroupHeights}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
