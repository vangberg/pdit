import React from "react";

interface TopBarProps {
  isWebRReady: boolean;
  onRunAll: () => void;
  initMessage?: string;
}

export function TopBar({ isWebRReady, onRunAll, initMessage }: TopBarProps) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const currentShortcut = isMac ? "⌘+ENTER" : "CTRL+ENTER";
  const allShortcut = isMac ? "⌘⇧+ENTER" : "CTRL+SHIFT+ENTER";

  return (
    <div className="top-bar">
      <div className="top-bar-content">
        <div className="top-bar-left">
          <button
            className="run-all-button"
            onClick={onRunAll}
            disabled={!isWebRReady}
            title={`Run all code (${allShortcut})`}
          >
            ▶ RUN ALL ({allShortcut})
          </button>
          <span className="shortcuts-info" style={{ marginLeft: "1rem", fontSize: "0.75rem", color: "#666" }}>
            {currentShortcut}: CURRENT | {allShortcut}: ALL
          </span>
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
