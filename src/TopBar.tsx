import React from "react";

interface TopBarProps {
  isWebRReady: boolean;
  onRunAll: () => void;
  onRunCurrent: () => void;
  initMessage?: string;
}

export function TopBar({ isWebRReady, onRunAll, onRunCurrent, initMessage }: TopBarProps) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const currentShortcut = isMac ? "CMD+ENTER" : "CTRL+ENTER";
  const allShortcut = isMac ? "CMD+SHIFT+ENTER" : "CTRL+SHIFT+ENTER";

  return (
    <div className="top-bar">
      <div className="top-bar-content">
        <div className="top-bar-left">
          <button
            className="run-all-button"
            onClick={onRunCurrent}
            disabled={!isWebRReady}
            title={`Run current expression (${currentShortcut})`}
          >
            ▶ RUN CURRENT ({currentShortcut})
          </button>
          <button
            className="run-all-button"
            onClick={onRunAll}
            disabled={!isWebRReady}
            title={`Run all code (${allShortcut})`}
          >
            ▶ RUN ALL ({allShortcut})
          </button>
        </div>
        <div className="top-bar-right">
          {!isWebRReady && (
            <span className="init-message">
              STATUS: {initMessage || "INITIALIZING R ENVIRONMENT..."}
            </span>
          )}
          {isWebRReady && (
            <span className="ready-message">
              STATUS: READY
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
