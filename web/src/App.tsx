import "./style.css";
import { Editor, EditorHandles } from "./Editor";
import { OutputPane } from "./OutputPane";
import { executeScript, Expression } from "./execution-python";
import { Text } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { LineGroup } from "./compute-line-groups";
import { TopBar } from "./TopBar";
import { useResults } from "./results";
import { useScriptFile } from "./use-script-file";
import { LineGroupLayout } from "./line-group-layout";

const DEFAULT_CODE = ``;

function App() {
  // Load script file from URL query parameter
  const scriptPath = new URLSearchParams(window.location.search).get("script");
  const [hasConflict, setHasConflict] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [doc, setDoc] = useState<Text>();
  const isProgrammaticUpdate = useRef(false);

  const editorRef = useRef<EditorHandles | null>(null);

  const handleFileChange = useCallback(
    (newContent: string) => {
      if (hasUnsavedChanges) {
        // User has local edits → show conflict banner
        setHasConflict(true);
      } else {
        // No local edits → check if content actually changed
        if (doc && doc.toString() === newContent) {
          // Content is the same, don't reload (preserves line groups)
          return;
        }
        // Content differs → safe to auto-reload
        isProgrammaticUpdate.current = true;
        editorRef.current?.applyExecutionUpdate({
          doc: newContent,
          lineGroups: [],
        });
        isProgrammaticUpdate.current = false;
      }
    },
    [hasUnsavedChanges, doc]
  );

  const {
    code: initialCode,
    diskContent,
    isLoading: isLoadingScript,
    error: scriptError,
  } = useScriptFile(scriptPath, DEFAULT_CODE, {
    onFileChange: handleFileChange,
  });
  const { expressions, lineGroups, setLineGroups, addExpressions } =
    useResults();
  const [lineGroupHeights, setLineGroupHeights] = useState<Map<string, number>>(
    new Map()
  );
  const [lineGroupLayouts, setLineGroupLayouts] = useState<Map<string, LineGroupLayout>>(
    new Map()
  );

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

  const handleInitialDocumentLoad = useCallback((doc: Text) => {
    setDoc(doc);
  }, []);

  const handleDocumentChange = useCallback((doc: Text) => {
    setDoc(doc);
    if (!isProgrammaticUpdate.current) {
      setHasUnsavedChanges(true);
    }
  }, []);

  const handleLineGroupsChange = useCallback(
    (groups: LineGroup[]) => {
      console.log("App received line groups change:", groups);
      setLineGroups(groups);
    },
    [setLineGroups]
  );

  const handleLineGroupLayoutChange = useCallback((layouts: Map<string, LineGroupLayout>) => {
    console.log(
      "App received line group layouts:",
      Array.from(layouts.entries()).slice(0, 5)
    );
    setLineGroupLayouts(layouts);
  }, []);

  const handleExecute = useCallback(
    async (
      script: string,
      options?: { lineRange?: { from: number; to: number } }
    ) => {
      try {
        // Track expressions by line range key for matching
        const expressionsByLineRange = new Map<string, Expression>();

        // Extract script name from path (just the filename)
        const scriptName = scriptPath ? scriptPath.split("/").pop() : undefined;

        for await (const event of executeScript(script, {
          ...options,
          scriptName
        })) {
          console.log("Execute event:", event);

          if (event.type === 'expressions') {
            // Backend sent all expressions that will be executed
            // First one is executing, rest are pending
            for (let i = 0; i < event.expressions.length; i++) {
              const expr = event.expressions[i];
              const key = `${expr.lineStart}-${expr.lineEnd}`;
              const state = i === 0 ? 'executing' : 'pending';

              // Look for existing expression with same line range
              const existingExpr = Array.from(expressions.values()).find(
                e => e.lineStart === expr.lineStart && e.lineEnd === expr.lineEnd
              );

              if (existingExpr?.result) {
                // Keep old result while pending/executing
                expressionsByLineRange.set(key, { ...expr, state, result: existingExpr.result });
              } else {
                expressionsByLineRange.set(key, { ...expr, state });
              }
            }
          } else if (event.type === 'done') {
            // Update/replace expression with new result
            const key = `${event.expression.lineStart}-${event.expression.lineEnd}`;
            expressionsByLineRange.set(key, event.expression);

            // Find first pending expression and mark it as executing
            for (const [k, expr] of expressionsByLineRange) {
              if (expr.state === 'pending') {
                expressionsByLineRange.set(k, { ...expr, state: 'executing' });
                break;
              }
            }
          }

          // Get all expressions as array
          const allExpressions = Array.from(expressionsByLineRange.values());

          // Compute line groups and update editor
          const { lineGroups: newLineGroups } = addExpressions(allExpressions, {
            lineRange: options?.lineRange,
          });

          // Only include done expressions in lastExecutedResultIds
          const doneIds = allExpressions
            .filter(expr => expr.state === 'done')
            .map(expr => expr.id);

          editorRef.current?.applyExecutionUpdate({
            doc: script,
            lineGroups: newLineGroups,
            lastExecutedResultIds: doneIds,
          });
        }
      } catch (error) {
        console.error("Execution error:", error);
      }
    },
    [addExpressions, scriptPath, expressions, lineGroups]
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

  const handleInsertMarkdownCell = useCallback(() => {
    editorRef.current?.insertMarkdownCell();
    editorRef.current?.focus();
  }, []);

  const handleReloadFromDisk = useCallback(() => {
    if (diskContent) {
      isProgrammaticUpdate.current = true;
      editorRef.current?.applyExecutionUpdate({
        doc: diskContent,
        lineGroups: [],
      });
      isProgrammaticUpdate.current = false;
      setHasUnsavedChanges(false);
      setHasConflict(false);
    }
  }, [diskContent]);

  const handleKeepLocalChanges = useCallback(() => {
    setHasConflict(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!scriptPath || !doc) {
      console.warn("Cannot save: no script path or document");
      return;
    }

    try {
      const response = await fetch("/api/save-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: scriptPath,
          content: doc.toString(),
        }),
      });

      if (response.ok) {
        setHasUnsavedChanges(false);
        setHasConflict(false);
      } else {
        console.error("Failed to save file:", await response.text());
      }
    } catch (error) {
      console.error("Error saving file:", error);
    }
  }, [scriptPath, doc]);

  // Handle Cmd+S / Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasUnsavedChanges) {
          handleSave();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasUnsavedChanges, handleSave]);

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
        onRunAll={handleRunAll}
        onRunCurrent={handleRunCurrent}
        onSave={handleSave}
        onInsertMarkdownCell={handleInsertMarkdownCell}
        hasUnsavedChanges={hasUnsavedChanges}
        scriptName={scriptPath ? scriptPath.split("/").pop() : undefined}
        hasConflict={hasConflict}
        onReloadFromDisk={handleReloadFromDisk}
        onKeepChanges={handleKeepLocalChanges}
      />
      <div className="split-container">
        <div className="editor-half">
          <Editor
            ref={editorRef}
            initialCode={initialCode}
            onInitialDocumentLoad={handleInitialDocumentLoad}
            onExecuteCurrent={handleExecuteCurrent}
            onExecuteAll={handleExecuteAll}
            onDocumentChange={handleDocumentChange}
            onLineGroupsChange={handleLineGroupsChange}
            onLineGroupLayoutChange={handleLineGroupLayoutChange}
            lineGroupHeights={lineGroupHeights}
          />
        </div>
        <div className="output-half">
          <OutputPane
            onLineGroupHeightChange={handleLineGroupHeightChange}
            expressions={Array.from(expressions.values())}
            lineGroups={lineGroups}
            lineGroupLayouts={lineGroupLayouts}
            lineGroupHeights={lineGroupHeights}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
