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

const DEFAULT_CODE = ``;

function App() {
  // Load script file from URL query parameter
  const scriptPath = new URLSearchParams(window.location.search).get("script");
  const [hasConflict, setHasConflict] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isProgrammaticUpdate = useRef(false);

  const editorRef = useRef<EditorHandles | null>(null);

  const handleFileChange = useCallback(
    (newContent: string) => {
      if (hasUnsavedChanges) {
        // User has local edits → show conflict banner
        setHasConflict(true);
      } else {
        // No local edits → safe to auto-reload
        isProgrammaticUpdate.current = true;
        editorRef.current?.applyExecutionUpdate({
          doc: newContent,
          lineGroups: [],
        });
        isProgrammaticUpdate.current = false;
      }
    },
    [hasUnsavedChanges]
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
  const [lineGroupTops, setLineGroupTops] = useState<Map<string, number>>(
    new Map()
  );
  const [doc, setDoc] = useState<Text>();

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
