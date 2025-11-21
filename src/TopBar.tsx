import React from "react";

interface TopBarProps {
  isPyodideReady: boolean;
  onRunAll: () => void;
  onRunCurrent?: () => void;
  initMessage?: string;
}

function detectMacOS(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

function getShortcuts() {
  const isMac = detectMacOS();
  return {
    current: isMac ? "Command + Enter" : "Ctrl + Enter",
    all: isMac ? "Command + Shift + Enter" : "Ctrl + Shift + Enter"
  };
}

interface TooltipProps {
  text: string;
}

function Tooltip({ text }: TooltipProps) {
  return <div className="top-bar-tooltip">{text}</div>;
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  disabled: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  tooltip?: string;
  showTooltip: boolean;
}

function ActionButton({
  label,
  onClick,
  disabled,
  onMouseEnter,
  onMouseLeave,
  tooltip,
  showTooltip
}: ActionButtonProps) {
  return (
    <div className="top-bar-button-wrapper">
      <button
        className="top-bar-button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {label}
      </button>
      {showTooltip && tooltip && <Tooltip text={tooltip} />}
    </div>
  );
}

interface StatusIndicatorProps {
  isReady: boolean;
  message?: string;
}

function StatusIndicator({ isReady, message }: StatusIndicatorProps) {
  const statusClass = isReady ? "ready" : "initializing";
  const statusText = isReady ? "Ready" : (message || "Initializing");

  return (
    <div className="top-bar-status">
      <div className={`top-bar-status-dot ${statusClass}`} />
      <span className={`top-bar-status-text ${statusClass}`}>
        {statusText}
      </span>
    </div>
  );
}

export function TopBar({ isPyodideReady, onRunAll, onRunCurrent, initMessage }: TopBarProps) {
  const [hoveredButton, setHoveredButton] = React.useState<string | null>(null);
  const shortcuts = getShortcuts();

  return (
    <div className="top-bar">
      <div className="top-bar-content">
        <ActionButton
          label="▶ RUN CURRENT"
          onClick={onRunCurrent || (() => {})}
          disabled={!isPyodideReady}
          onMouseEnter={() => setHoveredButton("current")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.current}
          showTooltip={hoveredButton === "current" && isPyodideReady}
        />

        <ActionButton
          label="▶ RUN ALL"
          onClick={onRunAll}
          disabled={!isPyodideReady}
          onMouseEnter={() => setHoveredButton("all")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.all}
          showTooltip={hoveredButton === "all" && isPyodideReady}
        />

        <StatusIndicator isReady={isPyodideReady} message={initMessage} />
      </div>
    </div>
  );
}
