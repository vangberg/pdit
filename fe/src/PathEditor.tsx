import React, { useState, useRef, useEffect } from "react";
import { FuzzyFinder } from "./FuzzyFinder";

interface PathEditorProps {
  scriptPath: string | null | undefined;
  onPathChange: ((newPath: string) => void) | undefined;
  isFuzzyFinderOpen?: boolean;
  onFuzzyFinderOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

function detectMacOS(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

export function PathEditor({
  scriptPath,
  onPathChange,
  isFuzzyFinderOpen = false,
  onFuzzyFinderOpenChange,
  disabled = false
}: PathEditorProps) {
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [editedPath, setEditedPath] = useState(scriptPath || "");
  const [showTooltip, setShowTooltip] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setIsFuzzyFinderOpen = (open: boolean) => {
    onFuzzyFinderOpenChange?.(open);
  };

  const shortcut = detectMacOS() ? "Command + P" : "Ctrl + P";

  useEffect(() => {
    if (scriptPath) {
      setEditedPath(scriptPath);
    }
  }, [scriptPath]);

  useEffect(() => {
    if (isEditingPath && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditingPath]);

  useEffect(() => {
    if (disabled) {
      setIsEditingPath(false);
      setShowTooltip(false);
      setIsFuzzyFinderOpen(false);
    }
  }, [disabled]);

  const handleFuzzySelect = (path: string) => {
    if (onPathChange) {
      onPathChange(path);
    }
  };

  const handlePathSubmit = () => {
    if (onPathChange && editedPath !== scriptPath) {
      onPathChange(editedPath);
    }
    setIsEditingPath(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePathSubmit();
    } else if (e.key === "Escape") {
      setIsEditingPath(false);
      setEditedPath(scriptPath || "");
    }
  };

  const display = scriptPath ? scriptPath.split('/').pop() : null;

  if (isEditingPath) {
    return (
      <div style={{ position: "relative", marginLeft: "8px" }}>
        <input
          ref={inputRef}
          type="text"
          className="top-bar-path-input"
          value={editedPath}
          onChange={(e) => setEditedPath(e.target.value)}
          onBlur={() => setIsEditingPath(false)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          style={{
            background: "#333",
            color: "#eee",
            border: "1px solid #555",
            borderRadius: "4px",
            padding: "2px 6px",
            fontSize: "12px",
            fontFamily: "monospace",
            width: "300px",
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", marginLeft: "8px", display: "flex", alignItems: "center" }}>
      {display ? (
        <span
          style={{
            fontSize: "12px",
            color: disabled ? "#aaa" : "#333",
            fontWeight: 500,
            cursor: !disabled && onPathChange ? "pointer" : "default",
            borderBottom: !disabled && onPathChange ? "1px dotted #999" : "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "200px",
            display: "inline-block"
          }}
          onClick={() => {
            if (!disabled && onPathChange) {
              setIsFuzzyFinderOpen(true);
            }
          }}
          onMouseEnter={() => !disabled && onPathChange && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {display}
        </span>
      ) : onPathChange ? (
        <span
          style={{
            fontSize: "12px",
            color: disabled ? "#aaa" : "#666",
            cursor: disabled ? "default" : "pointer",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "200px",
            display: "inline-block"
          }}
          onClick={() => {
            if (!disabled) {
              setIsFuzzyFinderOpen(true);
            }
          }}
          onMouseEnter={() => !disabled && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          Open file...
        </span>
      ) : null}
      {showTooltip && !isFuzzyFinderOpen && !disabled && (
        <div className="top-bar-tooltip">{shortcut}</div>
      )}
      <FuzzyFinder
        isOpen={!disabled && isFuzzyFinderOpen}
        onClose={() => setIsFuzzyFinderOpen(false)}
        onSelect={handleFuzzySelect}
      />
    </div>
  );
}
