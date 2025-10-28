import React from "react";

interface TopBarProps {
  isWebRReady: boolean;
  onRunAll: () => void;
  initMessage?: string;
}

export function TopBar({ isWebRReady, onRunAll, initMessage }: TopBarProps) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcut = isMac ? "CMD+ENTER" : "CTRL+ENTER";

  return (
    <div className="top-bar">
      <div className="top-bar-content">
        <div className="top-bar-left">
          <button
            className="run-all-button"
            onClick={onRunAll}
            disabled={!isWebRReady}
            title={`Run all code (${shortcut})`}
          >
            ▶ RUN ALL ({shortcut})
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
