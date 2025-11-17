import "./style.css";
import { Editor, EditorHandles } from "./Editor";
import { OutputPane } from "./OutputPane";
import { executeScript, Expression } from "./execution";
import { Text } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { LineGroup } from "./compute-line-groups";
import { initializeWebR } from "./webr-instance";
import { TopBar } from "./TopBar";
import { useResults } from "./results";

const initialCode = `# Dataset overview and summary statistics
head(mtcars)
Sys.sleep(1)
summary(mtcars)

Sys.time()
# Visualization: fuel efficiency vs vehicle weight
plot(mtcars$wt, mtcars$mpg,
     xlab = "Weight (1000 lbs)",
     ylab = "Miles per Gallon",
     main = "Fuel Efficiency vs Vehicle Weight",
     pch = 19)

# Fitted linear regression line
trend <- lm(mpg ~ wt, data = mtcars)
abline(trend, col = "red", lwd = 2)

# Calculate correlation
cor(mtcars$mpg, mtcars$wt)

# Multiple linear regression model
model <- lm(mpg ~ wt + hp + cyl, data = mtcars)
summary(model)`;

function App() {
  const editorRef = useRef<EditorHandles | null>(null);
  const { results, lineGroups, setLineGroups, addResults } = useResults();
  const [lineGroupHeights, setLineGroupHeights] = useState<Map<string, number>>(
    new Map()
  );
  const [lineGroupTops, setLineGroupTops] = useState<Map<string, number>>(
    new Map()
  );
  const [isWebRReady, setIsWebRReady] = useState(false);
  const [doc, setDoc] = useState<Text>();

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
      if (!isWebRReady) {
        console.warn("webR is not ready yet");
        return;
      }

      try {
        const allResults: Expression[] = [];

        for await (const result of executeScript(script, options)) {
          console.log("Execute result:", result);

          allResults.push(result);

          const { lineGroups } = addResults(allResults, {
            lineRange: options?.lineRange,
          });

          editorRef.current?.applyExecutionUpdate({
            doc: script,
            lineGroups,
            lastExecutedResultIds: allResults.map((r) => r.id),
          });
        }
      } catch (error) {
        console.error("Execution error:", error);
      }
    },
    [isWebRReady, addResults]
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
  }, [handleExecuteAll, doc]);

  return (
    <div id="app">
      <TopBar isWebRReady={isWebRReady} onRunAll={handleRunAll} />
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
            expressions={Array.from(results.values())}
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
