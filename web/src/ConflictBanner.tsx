import React from "react";

interface ConflictBannerProps {
  onReload: () => void;
  onKeep: () => void;
}

export function ConflictBanner({ onReload, onKeep }: ConflictBannerProps) {
  return (
    <div
      style={{
        backgroundColor: "#fff3cd",
        border: "1px solid #ffc107",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        fontSize: "14px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <span style={{ marginRight: "auto" }}>
        ⚠️ File changed on disk
      </span>
      <button
        onClick={onReload}
        style={{
          padding: "6px 12px",
          backgroundColor: "#0066cc",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        Reload from disk
      </button>
      <button
        onClick={onKeep}
        style={{
          padding: "6px 12px",
          backgroundColor: "white",
          color: "#333",
          border: "1px solid #ccc",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        Keep my changes
      </button>
    </div>
  );
}
