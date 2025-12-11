import React, { useState } from "react";
import { PathEditor } from "./PathEditor";

interface TopBarProps {
  onRunAll: () => void;
  onRunCurrent?: () => void;
  onSave?: () => void;
  hasUnsavedChanges?: boolean;
  scriptPath?: string | null;
  onPathChange?: (newPath: string) => void;
  hasConflict?: boolean;
  onReloadFromDisk?: () => void;
  onKeepChanges?: () => void;
  readerMode?: boolean;
  onToggleReaderMode?: () => void;
  autorun?: boolean;
  onAutorunToggle?: (enabled: boolean) => void;
}

function detectMacOS(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

function getShortcuts() {
  const isMac = detectMacOS();
  return {
    current: isMac ? "Command + Enter" : "Ctrl + Enter",
    all: isMac ? "Command + Shift + Enter" : "Ctrl + Shift + Enter",
    reader: isMac ? "Command + \\" : "Ctrl + \\",
    autorun: isMac ? "Command + Shift + A" : "Ctrl + Shift + A",
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

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  label: string;
  tooltip?: string;
  showTooltip: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ToggleSwitch({
  enabled,
  onToggle,
  label,
  tooltip,
  showTooltip,
  onMouseEnter,
  onMouseLeave
}: ToggleSwitchProps) {
  return (
    <div
      className="top-bar-toggle-wrapper"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        className={`top-bar-toggle ${enabled ? "enabled" : ""}`}
        onClick={() => onToggle(!enabled)}
        role="switch"
        aria-checked={enabled}
      >
        <span className="top-bar-toggle-label">{label}</span>
        <span className="top-bar-toggle-switch">
          <span className="top-bar-toggle-knob" />
        </span>
      </button>
      {showTooltip && tooltip && <Tooltip text={tooltip} />}
    </div>
  );
}

export function TopBar({
  onRunAll,
  onRunCurrent,
  onSave,
  hasUnsavedChanges,
  scriptPath,
  onPathChange,
  hasConflict,
  onReloadFromDisk,
  onKeepChanges,
  readerMode,
  onToggleReaderMode,
  autorun,
  onAutorunToggle
}: TopBarProps) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

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

        <ToggleSwitch
          enabled={readerMode ?? false}
          onToggle={onToggleReaderMode || (() => {})}
          label="READER"
          tooltip={shortcuts.reader}
          showTooltip={hoveredButton === "reader"}
          onMouseEnter={() => setHoveredButton("reader")}
          onMouseLeave={() => setHoveredButton(null)}
        />

        {onAutorunToggle && (
          <ToggleSwitch
            enabled={autorun ?? false}
            onToggle={onAutorunToggle}
            label="AUTORUN"
            tooltip={shortcuts.autorun}
            showTooltip={hoveredButton === "autorun"}
            onMouseEnter={() => setHoveredButton("autorun")}
            onMouseLeave={() => setHoveredButton(null)}
          />
        )}

        {scriptPath && (
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

        <PathEditor
          scriptPath={scriptPath}
          onPathChange={onPathChange}
        />

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