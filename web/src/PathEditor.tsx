import React, { useState, useRef, useEffect } from "react";

interface PathEditorProps {
  scriptPath: string | null | undefined;
  onPathChange: ((newPath: string) => void) | undefined;
}

export function PathEditor({ scriptPath, onPathChange }: PathEditorProps) {
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [editedPath, setEditedPath] = useState(scriptPath || "");
  const inputRef = useRef<HTMLInputElement>(null);

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
      <input
        ref={inputRef}
        type="text"
        className="top-bar-path-input"
        value={editedPath}
        onChange={(e) => setEditedPath(e.target.value)}
        onBlur={() => setIsEditingPath(false)}
        onKeyDown={handleKeyDown}
        style={{
          marginLeft: "8px",
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
    );
  }

  return (
    display ? (
      <span
        style={{
          fontSize: "12px",
          color: "#ccc",
          marginLeft: "8px",
          cursor: onPathChange ? "pointer" : "default",
          borderBottom: onPathChange ? "1px dotted #666" : "none",
        }}
        onClick={() => {
          if (onPathChange) {
            setIsEditingPath(true);
            setEditedPath(scriptPath || "");
          }
        }}
        title={onPathChange ? "Click to edit path" : undefined}
      >
        {display}
      </span>
    ) : null
  );
}