import React, { useEffect, useRef, useCallback, useState } from "react";
import { OutputPane } from "./OutputPane";
import { executeScript } from "./execution-python";
import { useResults } from "./results";
import { useScriptFile } from "./use-script-file";
import "./style.css";

/**
 * Output-only view for rendering script results without the editor.
 * Used for generating screenshots and PDFs via Playwright.
 */
export function OutputOnly() {
  const scriptPath = new URLSearchParams(window.location.search).get("script");
  const hasExecuted = useRef(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const {
    code,
    isLoading: isLoadingScript,
    error: scriptError,
    sessionId,
  } = useScriptFile(scriptPath, "");

  const {
    expressions,
    lineGroups,
    handleExecutionEvent,
    resetExecutionState,
  } = useResults();

  const handleExecute = useCallback(
    async (script: string) => {
      const scriptName = scriptPath ? scriptPath.split("/").pop() : undefined;

      try {
        setIsExecuting(true);
        for await (const event of executeScript(script, {
          sessionId,
          scriptName,
          reset: true,
        })) {
          handleExecutionEvent(event);
        }
      } catch (error) {
        console.error("Execution error:", error);
      } finally {
        resetExecutionState();
        setIsExecuting(false);
        setIsComplete(true);
      }
    },
    [handleExecutionEvent, resetExecutionState, scriptPath, sessionId]
  );

  // Execute script once when loaded
  useEffect(() => {
    if (code && !hasExecuted.current) {
      hasExecuted.current = true;
      handleExecute(code);
    }
  }, [code, handleExecute]);

  if (scriptError) {
    return (
      <div className="output-only-container">
        <div className="output-only-error">
          Error: {scriptError.message}
        </div>
      </div>
    );
  }

  if (isLoadingScript) {
    return (
      <div className="output-only-container">
        <div className="output-only-loading">Loading script...</div>
      </div>
    );
  }

  if (isExecuting) {
    return (
      <div className="output-only-container">
        <div className="output-only-loading">Executing...</div>
      </div>
    );
  }

  return (
    <div className="output-only-container" data-complete={isComplete}>
      <OutputPane
        expressions={Array.from(expressions.values())}
        lineGroups={lineGroups}
        readerMode={true}
      />
    </div>
  );
}
