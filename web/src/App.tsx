import "./style.css";
import { Editor, EditorHandles } from "./Editor";
import { OutputPane } from "./OutputPane";
import { executeScript } from "./execution-python";
import { Text } from "@codemirror/state";
import React, { useRef, useState, useCallback, useEffect } from "react";
import { LineGroup } from "./compute-line-groups";
import { adjustLineGroupsForDiff } from "./diff-line-groups";
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
  const [readerMode, setReaderMode] = useState(false);
  const isProgrammaticUpdate = useRef(false);

  const editorRef = useRef<EditorHandles | null>(null);
  const lineGroupsRef = useRef<LineGroup[]>([]);

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
        // Content differs → compute adjusted line groups via diff
        const adjustedGroups = adjustLineGroupsForDiff(
          doc?.toString() ?? "",
          newContent,
          lineGroupsRef.current
        );
        isProgrammaticUpdate.current = true;
        editorRef.current?.applyExecutionUpdate({
          doc: newContent,
          lineGroups: adjustedGroups,
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
    sessionId,
  } = useScriptFile(scriptPath, DEFAULT_CODE, {
    onFileChange: handleFileChange,
  });
  const {
    expressions,
    lineGroups,
    setLineGroups,
    handleExecutionEvent,
    resetExecutionState,
  } = useResults();

  // Keep lineGroupsRef in sync with lineGroups state (avoids stale closure in handleFileChange)
  useEffect(() => {
    lineGroupsRef.current = lineGroups;
  }, [lineGroups]);

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
      // Extract script name from path (just the filename)
      const scriptName = scriptPath ? scriptPath.split("/").pop() : undefined;

      try {
        for await (const event of executeScript(script, {
          sessionId,
          ...options,
          scriptName,
        })) {
          console.log("Execute event:", event);

          const { lineGroups: newLineGroups, doneIds } = handleExecutionEvent(
            event,
            options
          );

          editorRef.current?.applyExecutionUpdate({
            doc: script,
            lineGroups: newLineGroups,
            lastExecutedResultIds: doneIds,
          });
        }
      } catch (error) {
        console.error("Execution error:", error);
      } finally {
        resetExecutionState();
      }
    },
    [handleExecutionEvent, resetExecutionState, scriptPath, sessionId]
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

  const handleToggleReaderMode = useCallback(() => {
    setReaderMode((prev) => !prev);
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
        readerMode={readerMode}
        onToggleReaderMode={handleToggleReaderMode}
      />
      <div className={readerMode ? "split-container reader-mode" : "split-container"}>
        <div className={readerMode ? "editor-half editor-hidden" : "editor-half"}>
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
        <div className={readerMode ? "output-half output-full" : "output-half"}>
          <OutputPane
            onLineGroupHeightChange={handleLineGroupHeightChange}
            expressions={Array.from(expressions.values())}
            lineGroups={lineGroups}
            lineGroupLayouts={lineGroupLayouts}
            lineGroupHeights={lineGroupHeights}
            readerMode={readerMode}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
