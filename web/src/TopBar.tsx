import React from "react";

interface TopBarProps {
  onRunAll: () => void;
  onRunCurrent?: () => void;
  onSave?: () => void;
  onInsertMarkdownCell?: () => void;
  hasUnsavedChanges?: boolean;
  scriptName?: string;
  hasConflict?: boolean;
  onReloadFromDisk?: () => void;
  onKeepChanges?: () => void;
  readerMode?: boolean;
  onToggleReaderMode?: () => void;
}

function detectMacOS(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

function getShortcuts() {
  const isMac = detectMacOS();
  return {
    current: isMac ? "Command + Enter" : "Ctrl + Enter",
    all: isMac ? "Command + Shift + Enter" : "Ctrl + Shift + Enter",
    markdown: isMac ? "Command + Shift + M" : "Ctrl + Shift + M"
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

export function TopBar({
  onRunAll,
  onRunCurrent,
  onSave,
  onInsertMarkdownCell,
  hasUnsavedChanges,
  scriptName,
  hasConflict,
  onReloadFromDisk,
  onKeepChanges,
  readerMode,
  onToggleReaderMode,
}: TopBarProps) {
  const [hoveredButton, setHoveredButton] = React.useState<string | null>(null);
  const shortcuts = getShortcuts();
  const isMac = detectMacOS();
  const saveShortcut = isMac ? "Command + S" : "Ctrl + S";

  return (
    <div className="top-bar">
      <div className="top-bar-content">
        <ActionButton
          label="▶ RUN CURRENT"
          onClick={onRunCurrent || (() => {})}
          disabled={false}
          onMouseEnter={() => setHoveredButton("current")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.current}
          showTooltip={hoveredButton === "current"}
        />

        <ActionButton
          label="▶ RUN ALL"
          onClick={onRunAll}
          disabled={false}
          onMouseEnter={() => setHoveredButton("all")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.all}
          showTooltip={hoveredButton === "all"}
        />

        <ActionButton
          label="Markdown"
          onClick={onInsertMarkdownCell || (() => {})}
          disabled={false}
          onMouseEnter={() => setHoveredButton("markdown")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.markdown}
          showTooltip={hoveredButton === "markdown"}
        />

        <ActionButton
          label={readerMode ? "📖 Reader" : "Reader"}
          onClick={onToggleReaderMode || (() => {})}
          disabled={false}
          onMouseEnter={() => setHoveredButton("reader")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip="Toggle reader mode"
          showTooltip={hoveredButton === "reader"}
        />

        {scriptName && (
          <ActionButton
            label="SAVE"
            onClick={onSave || (() => {})}
            disabled={!(hasUnsavedChanges ?? false)}
            onMouseEnter={() => setHoveredButton("save")}
            onMouseLeave={() => setHoveredButton(null)}
            tooltip={saveShortcut}
            showTooltip={hoveredButton === "save" && (hasUnsavedChanges ?? false)}
          />
        )}

        {scriptName && (
          <span style={{ fontSize: "12px", color: "#ccc", marginLeft: "8px" }}>
            {scriptName}
          </span>
        )}

        <StatusIndicator isReady={true} />

        {hasConflict && (
          <div className="top-bar-conflict-compact">
            <div
              className="top-bar-button-wrapper"
              onMouseEnter={() => setHoveredButton("conflict")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              <span className="top-bar-conflict-compact-message">⚠️ File changed</span>
              {hoveredButton === "conflict" && (
                <Tooltip text="The file was modified on disk. Reload to see changes or keep your edits." />
              )}
            </div>
            <button
              className="top-bar-conflict-button-primary"
              onClick={onReloadFromDisk}
              onMouseEnter={() => setHoveredButton("reload")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Reload
              {hoveredButton === "reload" && <Tooltip text="Discard your changes and reload from disk" />}
            </button>
            <button
              className="top-bar-conflict-button-secondary"
              onClick={onKeepChanges}
              onMouseEnter={() => setHoveredButton("keep")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Keep
              {hoveredButton === "keep" && <Tooltip text="Keep your changes and dismiss this warning" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
