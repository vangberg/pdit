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

const initialCode = `# Python/Pyodide with plotnine
import pandas as pd
import numpy as np
from plotnine import ggplot, aes, geom_line, geom_point, labs, theme_minimal

# Create sample data
data = pd.DataFrame({
    'x': np.linspace(0, 10, 100),
})
data['y'] = np.sin(data['x'])

# Create a ggplot-style plot
plot = (
    ggplot(data, aes('x', 'y'))
    + geom_line(color='blue', size=1)
    + geom_point(alpha=0.3)
    + labs(
        title='Sine Wave',
        x='x',
        y='sin(x)'
    )
    + theme_minimal()
)
plot

# Print some results
print("Mean:", data['y'].mean())
print("Std dev:", data['y'].std())

# Calculate some values
result = data['y'].sum()
result`;

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

  return (
    <div id="app">
      <TopBar
        isWebRReady={isPyodideReady}
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
