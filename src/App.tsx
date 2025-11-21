import "./style.css";
import { Editor, EditorHandles } from "./Editor";
import { OutputPane } from "./OutputPane";
import {
  executeScript,
  Expression,
  setBackendType,
  getBackendType,
  checkPythonServer,
  type BackendType
} from "./execution-python";
import { Text } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { LineGroup } from "./compute-line-groups";
import { initializePyodide } from "./pyodide-instance";
import { TopBar } from "./TopBar";
import { useResults } from "./results";

const initialCode = `# Python/Pyodide Demo
# Simple calculations
x = 5 + 3
x

y = x * 2
y

# String operations
name = "Python"
greeting = f"Hello, {name}!"
print(greeting)

# List comprehension
squares = [i**2 for i in range(10)]
squares

# Sum calculation
total = sum(squares)
total`;

function App() {
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
  const [backendType, setBackendTypeState] = useState<BackendType>(() => getBackendType());
  const [pythonServerAvailable, setPythonServerAvailable] = useState(false);

  // Check Python server availability on mount
  useEffect(() => {
    const checkServer = async () => {
      const available = await checkPythonServer();
      console.log('[App] Python server available:', available);
      setPythonServerAvailable(available);

      // If Python server is available, default to it
      if (available) {
        handleBackendChange('python-server');
      }
    };
    checkServer();
  }, []);

  // Initialize Pyodide in background (for when user switches to it)
  useEffect(() => {
    const init = async () => {
      try {
        // Give server check time to complete first
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log("Initializing Pyodide in background...");
        await initializePyodide();
        console.log("Pyodide ready!");
        setIsPyodideReady(true);
      } catch (error) {
        console.error("Failed to initialize Pyodide:", error);
      }
    };
    init();
  }, []);

  const handleBackendChange = useCallback((backend: BackendType) => {
    console.log('[App] Changing backend to:', backend);
    setBackendType(backend);
    setBackendTypeState(backend);
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
      // Note: executeScript will check for Python server first,
      // then fall back to Pyodide if needed. We only warn if neither is ready.

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
    [addExpressions]
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

  return (
    <div id="app">
      <TopBar
        isPyodideReady={isPyodideReady}
        onRunAll={handleRunAll}
        onRunCurrent={handleRunCurrent}
        backendType={backendType}
        onBackendChange={handleBackendChange}
        pythonServerAvailable={pythonServerAvailable}
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
