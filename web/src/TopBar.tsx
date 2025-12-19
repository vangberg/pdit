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
  debugMode?: boolean;
  onDebugModeToggle?: (enabled: boolean) => void;
  isFuzzyFinderOpen?: boolean;
  onFuzzyFinderOpenChange?: (open: boolean) => void;
  isExecuting?: boolean;
  hasAuthError?: boolean;
}

function detectMacOS(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

function getShortcuts() {
  const isMac = detectMacOS();
  return {
    current: isMac ? "Command + Enter" : "Ctrl + Enter",
    all: isMac ? "Command + Shift + Enter" : "Ctrl + Shift + Enter",
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



interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  label: string;
  tooltip?: string;
  showTooltip: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  disabled?: boolean;
}

function ToggleSwitch({
  enabled,
  onToggle,
  label,
  tooltip,
  showTooltip,
  onMouseEnter,
  onMouseLeave,
  disabled
}: ToggleSwitchProps) {
  return (
    <div
      className="top-bar-toggle-wrapper"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        className={`top-bar-toggle ${enabled ? "enabled" : ""}`}
        onClick={() => !disabled && onToggle(!enabled)}
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
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
  onAutorunToggle,
  debugMode,
  onDebugModeToggle,
  isFuzzyFinderOpen,
  onFuzzyFinderOpenChange,
  isExecuting,
  hasAuthError
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
          disabled={isExecuting || hasAuthError || false}
          onMouseEnter={() => setHoveredButton("current")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.current}
          showTooltip={hoveredButton === "current"}
        />

        <ActionButton
          label="▶ RUN ALL"
          onClick={onRunAll}
          disabled={isExecuting || hasAuthError || false}
          onMouseEnter={() => setHoveredButton("all")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip={shortcuts.all}
          showTooltip={hoveredButton === "all"}
        />

        <ToggleSwitch
          enabled={readerMode ?? false}
          onToggle={onToggleReaderMode || (() => {})}
          label="READER"
          tooltip="Toggle reader mode"
          showTooltip={hoveredButton === "reader"}
          onMouseEnter={() => setHoveredButton("reader")}
          onMouseLeave={() => setHoveredButton(null)}
          disabled={hasAuthError}
        />

        {onAutorunToggle && (
          <ToggleSwitch
            enabled={autorun ?? false}
            onToggle={onAutorunToggle}
            label="AUTORUN"
            tooltip="Auto-execute script on save or file change"
            showTooltip={hoveredButton === "autorun"}
            onMouseEnter={() => setHoveredButton("autorun")}
            onMouseLeave={() => setHoveredButton(null)}
            disabled={hasAuthError}
          />
        )}

        {onDebugModeToggle && (
          <ToggleSwitch
            enabled={debugMode ?? false}
            onToggle={onDebugModeToggle}
            label="DEBUG"
            tooltip="Show debug buttons on outputs to inspect raw data"
            showTooltip={hoveredButton === "debug"}
            onMouseEnter={() => setHoveredButton("debug")}
            onMouseLeave={() => setHoveredButton(null)}
            disabled={hasAuthError}
          />
        )}

        {scriptPath && (
          <ActionButton
            label="SAVE"
            onClick={onSave || (() => {})}
            disabled={!(hasUnsavedChanges ?? false) || hasAuthError || false}
            onMouseEnter={() => setHoveredButton("save")}
            onMouseLeave={() => setHoveredButton(null)}
            tooltip={saveShortcut}
            showTooltip={hoveredButton === "save" && (hasUnsavedChanges ?? false)}
          />
        )}

        <PathEditor
          scriptPath={scriptPath}
          onPathChange={onPathChange}
          isFuzzyFinderOpen={isFuzzyFinderOpen}
          onFuzzyFinderOpenChange={onFuzzyFinderOpenChange}
        />

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

        {hasAuthError && (
          <div
            className="top-bar-button-wrapper"
            onMouseEnter={() => setHoveredButton("auth-error")}
            onMouseLeave={() => setHoveredButton(null)}
          >
            <span className="top-bar-auth-error">⚠️ Auth failed</span>
            {hoveredButton === "auth-error" && (
              <Tooltip text="Copy the full URL from your terminal (including ?token=...) and paste it into your browser" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}