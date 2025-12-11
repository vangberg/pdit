import React, { useState, useRef, useEffect } from "react";
import { FuzzyFinder } from "./FuzzyFinder";

interface PathEditorProps {
  scriptPath: string | null | undefined;
  onPathChange: ((newPath: string) => void) | undefined;
  isFuzzyFinderOpen?: boolean;
  onFuzzyFinderOpenChange?: (open: boolean) => void;
}

function detectMacOS(): boolean {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

export function PathEditor({
  scriptPath,
  onPathChange,
  isFuzzyFinderOpen = false,
  onFuzzyFinderOpenChange
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
    <div style={{ position: "relative", marginLeft: "8px" }}>
      {display ? (
        <span
          style={{
            fontSize: "12px",
            color: "#ccc",
            cursor: onPathChange ? "pointer" : "default",
            borderBottom: onPathChange ? "1px dotted #666" : "none",
          }}
          onClick={() => {
            if (onPathChange) {
              setIsFuzzyFinderOpen(true);
            }
          }}
          onMouseEnter={() => onPathChange && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {display}
        </span>
      ) : onPathChange ? (
        <span
          style={{
            fontSize: "12px",
            color: "#888",
            cursor: "pointer",
          }}
          onClick={() => setIsFuzzyFinderOpen(true)}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          Open file...
        </span>
      ) : null}
      {showTooltip && !isFuzzyFinderOpen && (
        <div className="top-bar-tooltip">{shortcut}</div>
      )}
      <FuzzyFinder
        isOpen={isFuzzyFinderOpen}
        onClose={() => setIsFuzzyFinderOpen(false)}
        onSelect={handleFuzzySelect}
      />
    </div>
  );
}