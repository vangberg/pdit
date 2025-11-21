import React from "react";

export type BackendType = 'pyodide' | 'python-server';

interface TopBarProps {
  isPyodideReady: boolean;
  onRunAll: () => void;
  onRunCurrent?: () => void;
  initMessage?: string;
  backendType: BackendType;
  onBackendChange: (backend: BackendType) => void;
  pythonServerAvailable: boolean;
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

interface BackendSelectorProps {
  backendType: BackendType;
  onChange: (backend: BackendType) => void;
  pythonServerAvailable: boolean;
}

function BackendSelector({ backendType, onChange, pythonServerAvailable }: BackendSelectorProps) {
  return (
    <div className="backend-selector">
      <label className="backend-selector-label">BACKEND:</label>
      <select
        className="backend-selector-dropdown"
        value={backendType}
        onChange={(e) => onChange(e.target.value as BackendType)}
      >
        <option value="pyodide">Pyodide (Browser)</option>
        <option value="python-server" disabled={!pythonServerAvailable}>
          Python Server {!pythonServerAvailable && '(Unavailable)'}
        </option>
      </select>
    </div>
  );
}

export function TopBar({
  isPyodideReady,
  onRunAll,
  onRunCurrent,
  initMessage,
  backendType,
  onBackendChange,
  pythonServerAvailable
}: TopBarProps) {
  const [hoveredButton, setHoveredButton] = React.useState<string | null>(null);
  const shortcuts = getShortcuts();

  const isBackendReady = backendType === 'python-server' ? pythonServerAvailable : isPyodideReady;

  return (
    <div className="top-bar">
      <div className="top-bar-content">
        <BackendSelector
          backendType={backendType}
          onChange={onBackendChange}
          pythonServerAvailable={pythonServerAvailable}
        />

        <ActionButton
          label="▶ RUN CURRENT"
          onClick={onRunCurrent || (() => {})}
          disabled={!isBackendReady}
          onMouseEnter={() => setHoveredButton("current")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.current}
          showTooltip={hoveredButton === "current" && isBackendReady}
        />

        <ActionButton
          label="▶ RUN ALL"
          onClick={onRunAll}
          disabled={!isBackendReady}
          onMouseEnter={() => setHoveredButton("all")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.all}
          showTooltip={hoveredButton === "all" && isBackendReady}
        />

        <StatusIndicator isReady={isBackendReady} message={initMessage} />
      </div>
    </div>
  );
}
