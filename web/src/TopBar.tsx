import React, { useState, useRef, useEffect, useMemo } from "react";
import { PathEditor } from "./PathEditor";
import { useDropdownNavigation, DropdownList } from "./Dropdown";
import { Play, BookOpen, Zap, Save, Square } from "lucide-react";

interface TopBarProps {
  onRunAll: () => void;
  onRunCurrent?: () => void;
  onInterrupt?: () => void;
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
  isFuzzyFinderOpen?: boolean;
  onFuzzyFinderOpenChange?: (open: boolean) => void;
  isExecuting?: boolean;
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
  icon?: React.ReactNode;
}

function ActionButton({
  label,
  onClick,
  disabled,
  onMouseEnter,
  onMouseLeave,
  tooltip,
  showTooltip,
  icon
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
        {icon && <span className="top-bar-button-icon">{icon}</span>}
        <span className="top-bar-label">{label}</span>
      </button>
      {showTooltip && tooltip && <Tooltip text={tooltip} />}
    </div>
  );
}



interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  label: string;
  icon?: React.ReactNode;
  tooltip?: string;
  showTooltip: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ToggleSwitch({
  enabled,
  onToggle,
  label,
  icon,
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
        {icon && <span className="top-bar-toggle-icon">{icon}</span>}
        <span className="top-bar-toggle-label">{label}</span>
        <span className="top-bar-toggle-switch">
          <span className="top-bar-toggle-knob" />
        </span>
      </button>
      {showTooltip && tooltip && <Tooltip text={tooltip} />}
    </div>
  );
}

function RunButton({
  onRunAll,
  onRunCurrent,
  isExecuting,
  shortcuts
}: {
  onRunAll: () => void;
  onRunCurrent?: () => void;
  isExecuting?: boolean;
  shortcuts: { current: string; all: string };
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [lastRunMode, setLastRunMode] = useState<"all" | "current">("current");
  const [hoveredPart, setHoveredPart] = useState<"main" | "arrow" | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => [
    { id: "current", label: "Run Current", shortcut: shortcuts.current, action: onRunCurrent, disabled: !onRunCurrent },
    { id: "all", label: "Run All", shortcut: shortcuts.all, action: onRunAll },
  ], [onRunAll, onRunCurrent, shortcuts.current, shortcuts.all]);

  const handleOptionSelect = (option: typeof options[0]) => {
     if (option.disabled) return;
     setIsDropdownOpen(false);
     setLastRunMode(option.id as "all" | "current");
     option.action?.();
     arrowRef.current?.focus();
  };

  const { selectedIndex, setSelectedIndex, handleKeyDown } = useDropdownNavigation({
    items: options,
    onSelect: handleOptionSelect,
    onClose: () => {
        setIsDropdownOpen(false);
        arrowRef.current?.focus();
    },
    defaultIndex: options.findIndex(o => o.id === lastRunMode)
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus dropdown when opened
  useEffect(() => {
    if (isDropdownOpen) {
      // Re-sync index with lastRunMode
      setSelectedIndex(options.findIndex(o => o.id === lastRunMode));
      // Small timeout to ensure render
      requestAnimationFrame(() => {
        dropdownRef.current?.focus();
      });
    }
  }, [isDropdownOpen, lastRunMode, setSelectedIndex]);

  const handleMainClick = () => {
    if (onRunCurrent) {
      onRunCurrent();
    }
  };

  const handleArrowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsDropdownOpen(true);
    }
  };

  const label = "RUN CURRENT";
  const tooltip = shortcuts.current;

  return (
    <div 
      className="top-bar-split-button-wrapper" 
      onMouseLeave={() => setIsDropdownOpen(false)}
      ref={containerRef}
    >
      <button
        className="top-bar-split-button-main"
        onClick={handleMainClick}
        disabled={isExecuting}
        onMouseEnter={() => setHoveredPart("main")}
        onMouseLeave={() => setHoveredPart(null)}
      >
        <Play size={14} className="top-bar-icon" />
        <span className="top-bar-label">{label}</span>
      </button>
      {hoveredPart === "main" && <Tooltip text={tooltip} />}
      
      <button
        ref={arrowRef}
        className={`top-bar-split-button-arrow ${isDropdownOpen ? "active" : ""}`}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        onKeyDown={handleArrowKeyDown}
        disabled={isExecuting}
        onMouseEnter={() => setHoveredPart("arrow")}
        onMouseLeave={() => setHoveredPart(null)}
        aria-haspopup="true"
        aria-expanded={isDropdownOpen}
      >
        ▼
      </button>
      
      {isDropdownOpen && (
        <DropdownList
          listRef={dropdownRef}
          className="top-bar-dropdown-menu"
          itemClassName="top-bar-dropdown-item"
          items={options}
          selectedIndex={selectedIndex}
          onSelect={handleOptionSelect}
          onHover={setSelectedIndex}
          keyExtractor={(opt) => opt.id}
          tabIndex={-1}
          style={{ outline: 'none' }}
          onKeyDown={handleKeyDown}
          renderItem={(option) => (
             <>
               <span>{option.label}</span>
               <span className="top-bar-dropdown-item-shortcut">{option.shortcut}</span>
             </>
          )}
        />
      )}
    </div>
  );
}

export function TopBar({
  onRunAll,
  onRunCurrent,
  onInterrupt,
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
  isFuzzyFinderOpen,
  onFuzzyFinderOpenChange,
  isExecuting
}: TopBarProps) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  const shortcuts = getShortcuts();
  const isMac = detectMacOS();
  const saveShortcut = isMac ? "Command + S" : "Ctrl + S";

  return (
    <div className="top-bar">
      <div className="top-bar-content">
        <RunButton
          onRunAll={onRunAll}
          onRunCurrent={onRunCurrent}
          isExecuting={isExecuting}
          shortcuts={shortcuts}
        />

        <ActionButton
          label="STOP"
          onClick={onInterrupt || (() => {})}
          disabled={false}
          onMouseEnter={() => setHoveredButton("interrupt")}
          onMouseLeave={() => setHoveredButton(null)}
          tooltip="Interrupt execution (KeyboardInterrupt)"
          showTooltip={hoveredButton === "interrupt"}
          icon={<Square size={14} />}
        />

        <ToggleSwitch
          enabled={readerMode ?? false}
          onToggle={onToggleReaderMode || (() => {})}
          label="READER"
          icon={<BookOpen size={14} />}
          tooltip="Toggle reader mode"
          showTooltip={hoveredButton === "reader"}
          onMouseEnter={() => setHoveredButton("reader")}
          onMouseLeave={() => setHoveredButton(null)}
        />

        {onAutorunToggle && (
          <ToggleSwitch
            enabled={autorun ?? false}
            onToggle={onAutorunToggle}
            label="AUTORUN"
            icon={<Zap size={14} />}
            tooltip="Auto-execute script on save or file change"
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
            icon={<Save size={14} />}
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
      </div>
    </div>
  );
}