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
import { useScriptSettings } from "./use-script-settings";
import * as apiClient from "./api-client";

const DEFAULT_CODE = ``;

interface ScriptProps {
  scriptPath: string | null;
  onPathChange?: (newPath: string) => void;
  hasAuthError?: boolean;
}

export function Script({ scriptPath, onPathChange, hasAuthError }: ScriptProps) {
  const [hasConflict, setHasConflict] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [doc, setDoc] = useState<Text>();

  const { autorun, setAutorun, readerMode, setReaderMode } =
    useScriptSettings(scriptPath);

  const [isFuzzyFinderOpen, setIsFuzzyFinderOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const autorunRef = useRef(false);
  const isProgrammaticUpdate = useRef(false);
  const pendingAutorun = useRef(false);
  const prevAutorunRef = useRef(false);

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
          lineGroupsRef.current,
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
    [hasUnsavedChanges, doc],
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
    new Map(),
  );
  const [lineGroupLayouts, setLineGroupLayouts] = useState<
    Map<string, LineGroupLayout>
  >(new Map());

  const handleLineGroupHeightChange = useCallback(
    (heights: Map<string, number>) => {
      console.log(
        "Script received line group heights:",
        Array.from(heights.entries()).slice(0, 5),
      );
      setLineGroupHeights(heights);
    },
    [],
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
    [setLineGroups],
  );

  const handleLineGroupLayoutChange = useCallback(
    (layouts: Map<string, LineGroupLayout>) => {
      console.log(
        "Script received line group layouts:",
        Array.from(layouts.entries()).slice(0, 5),
      );
      setLineGroupLayouts(layouts);
    },
    [],
  );

  const handleExecute = useCallback(
    async (
      script: string,
      options?: { lineRange?: { from: number; to: number }; reset?: boolean },
    ): Promise<{ lastExecutedLineEnd?: number }> => {
      // Extract script name from path (just the filename)
      const scriptName = scriptPath ? scriptPath.split("/").pop() : undefined;
      let lastExecutedLineEnd: number | undefined;

      setIsExecuting(true);
      try {
        for await (const event of executeScript(script, {
          sessionId,
          ...options,
          scriptName,
        })) {
          console.log("Execute event:", event);

          // Track the last executed line end
          if (event.type === "done") {
            const lineEnd = event.expression.lineEnd;
            if (
              lastExecutedLineEnd === undefined ||
              lineEnd > lastExecutedLineEnd
            ) {
              lastExecutedLineEnd = lineEnd;
            }
          }

          const { lineGroups: newLineGroups, doneIds } = handleExecutionEvent(
            event,
            options,
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
        setIsExecuting(false);
      }

      return { lastExecutedLineEnd };
    },
    [handleExecutionEvent, resetExecutionState, scriptPath, sessionId],
  );

  const handleExecuteWithReset = useCallback(
    (script: string) => {
      handleExecute(script, { reset: true });
    },
    [handleExecute],
  );

  const handleExecuteCurrent = useCallback(
    async (script: string, lineRange: { from: number; to: number }) => {
      const { lastExecutedLineEnd } = await handleExecute(script, {
        lineRange,
      });
      // Advance cursor to the next non-empty line after the last executed statement
      // If nothing executed (e.g. comment/empty line), use the end of the selection
      const lineToAdvanceFrom = lastExecutedLineEnd ?? lineRange.to;
      editorRef.current?.advanceCursorToNextStatement(lineToAdvanceFrom);
    },
    [handleExecute],
  );

  const handleExecuteAll = useCallback(
    (script: string) => {
      handleExecute(script);
    },
    [handleExecute],
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
    setReaderMode(!readerMode);
  }, [readerMode, setReaderMode]);

  const handleSave = useCallback(async () => {
    if (!scriptPath || !doc) {
      console.warn("Cannot save: no script path or document");
      return;
    }

    try {
      const response = await apiClient.saveFile(scriptPath, doc.toString());

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

  // Handle keyboard shortcuts (Cmd+S save, Cmd+P fuzzy finder)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable all keyboard shortcuts when auth error is present
      if (hasAuthError) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasUnsavedChanges) {
          handleSave();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        if (onPathChange) {
          setIsFuzzyFinderOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasUnsavedChanges, handleSave, onPathChange, hasAuthError]);

  // Process pending autorun (triggered by file change from disk)
  useEffect(() => {
    if (pendingAutorun.current && doc) {
      pendingAutorun.current = false;
      // Pass reset flag to executeScript instead of doing it separately
      const script = doc.toString();
      handleExecuteWithReset(script);
    }
  }, [doc]);

  // Trigger run when autorun is enabled (either from URL param on load, or toggled on)
  useEffect(() => {
    if (!doc) return;

    const wasEnabled = prevAutorunRef.current;
    prevAutorunRef.current = autorun;

    if (autorun && !wasEnabled) {
      handleExecute(doc.toString());
    }
  }, [autorun, doc, handleExecute]);

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
        isFuzzyFinderOpen={isFuzzyFinderOpen}
        onFuzzyFinderOpenChange={setIsFuzzyFinderOpen}
        isExecuting={isExecuting}
        hasAuthError={hasAuthError}
      />
      <div
        className={
          readerMode ? "split-container reader-mode" : "split-container"
        }
      >
        <div
          className={readerMode ? "editor-half editor-hidden" : "editor-half"}
        >
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
            readOnly={isExecuting || hasAuthError}
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
