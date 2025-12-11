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

interface ScriptProps {
  scriptPath: string | null;
  onPathChange?: (newPath: string) => void;
}

export function Script({ scriptPath, onPathChange }: ScriptProps) {
  const [hasConflict, setHasConflict] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [doc, setDoc] = useState<Text>();
  const [readerMode, setReaderMode] = useState(false);
  const [autorun, setAutorun] = useState(false);
  const autorunRef = useRef(false);
  const isProgrammaticUpdate = useRef(false);
  const pendingAutorun = useRef(false);

  // Keep autorunRef in sync with autorun state
  useEffect(() => {
    autorunRef.current = autorun;
  }, [autorun]);

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

        // Trigger autorun if enabled (file changed from disk)
        if (autorunRef.current) {
          pendingAutorun.current = true;
        }
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
        "Script received line group heights:",
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
      console.log("Script received line groups change:", groups);
      setLineGroups(groups);
    },
    [setLineGroups]
  );

  const handleLineGroupLayoutChange = useCallback((layouts: Map<string, LineGroupLayout>) => {
    console.log(
      "Script received line group layouts:",
      Array.from(layouts.entries()).slice(0, 5)
    );
    setLineGroupLayouts(layouts);
  }, []);

  const handleExecute = useCallback(
    async (
      script: string,
      options?: { lineRange?: { from: number; to: number }; reset?: boolean }
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

  const handleExecuteWithReset = useCallback(
    (script: string) => {
      handleExecute(script, { reset: true });
    },
    [handleExecute]
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

        // Trigger autorun if enabled (after save)
        if (autorunRef.current) {
          handleExecute(doc.toString());
        }
      } else {
        console.error("Failed to save file:", await response.text());
      }
    } catch (error) {
      console.error("Error saving file:", error);
    }
  }, [scriptPath, doc, handleExecute]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+S / Ctrl+S - Save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasUnsavedChanges) {
          handleSave();
        }
      }
      // Cmd+\ / Ctrl+\ - Toggle Reader mode
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setReaderMode((prev) => !prev);
      }
      // Cmd+Shift+A / Ctrl+Shift+A - Toggle Autorun
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "A") {
        e.preventDefault();
        setAutorun((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasUnsavedChanges, handleSave]);

  // Process pending autorun (triggered by file change from disk)
  useEffect(() => {
    if (pendingAutorun.current && doc) {
      pendingAutorun.current = false;
      // Pass reset flag to executeScript instead of doing it separately
      const script = doc.toString();
      handleExecuteWithReset(script);
    }
  }, [doc]);

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
        scriptPath={scriptPath}
        onPathChange={onPathChange}
        hasConflict={hasConflict}
        onReloadFromDisk={handleReloadFromDisk}
        onKeepChanges={handleKeepLocalChanges}
        readerMode={readerMode}
        onToggleReaderMode={handleToggleReaderMode}
        autorun={autorun}
        onAutorunToggle={setAutorun}
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
