import React, { useState } from "react";
import { LineHeight } from "./line-heights";
import { OutputHeight } from "./OutputPane";
import { Text } from "@codemirror/state";
import { LineGroup } from "./compute-line-groups";

interface DebugPanelProps {
  editorHeights: LineHeight[];
  outputHeights: OutputHeight[];
  targetEditorHeights: LineHeight[];
  targetOutputHeights: OutputHeight[];
  isSyncing: boolean;
  lineGroups?: LineGroup[];
  currentDoc?: Text | null;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  editorHeights,
  outputHeights,
  targetEditorHeights,
  targetOutputHeights,
  isSyncing,
  lineGroups,
  currentDoc,
}) => {
  const [activeTab, setActiveTab] = useState<"heights" | "ranges">(() => {
    const saved = localStorage.getItem("debugPanelTab");
    return saved === "ranges" || saved === "heights" ? saved : "heights";
  });

  const handleTabChange = (tab: "heights" | "ranges") => {
    setActiveTab(tab);
    localStorage.setItem("debugPanelTab", tab);
  };

  // Get max lines to show for heights tab
  const maxLines = Math.max(
    editorHeights.length,
    outputHeights.length,
    targetEditorHeights.length,
    targetOutputHeights.length,
    5
  );

  const renderHeightsTab = () => (
    <table className="debug-table">
      <thead>
        <tr>
          <th>Line</th>
          <th>Editor Natural</th>
          <th>Output Natural</th>
          <th>Target Editor</th>
          <th>Target Output</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: Math.min(maxLines, 8) }, (_, index) => {
          const lineNum = index + 1;
          const editorHeight = editorHeights.find((h) => h.line === lineNum);
          const outputHeight = outputHeights.find((h) => h.line === lineNum);
          const targetEditor = targetEditorHeights.find(
            (h) => h.line === lineNum
          );
          const targetOutput = targetOutputHeights.find(
            (h) => h.line === lineNum
          );

          return (
            <tr key={lineNum}>
              <td className="line-number">{lineNum}</td>
              <td className="height-value">
                {editorHeight?.height.toFixed(1) || "-"}
              </td>
              <td className="height-value">
                {outputHeight?.height.toFixed(1) || "-"}
              </td>
              <td className="height-value">
                {targetEditor?.height.toFixed(1) || "-"}
              </td>
              <td className="height-value">
                {targetOutput?.height.toFixed(1) || "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderRangesTab = () => {
    if (!lineGroups || lineGroups.length === 0 || !currentDoc) {
      return (
        <div className="debug-empty">
          No result groups or document available
        </div>
      );
    }

    const groups = lineGroups.map((group, index) => {
      const linesDisplay =
        group.lineStart === group.lineEnd
          ? `${group.lineStart}`
          : `[${group.lineStart}, ${group.lineEnd}]`;

      const from = currentDoc.line(group.lineStart).from;
      const to = currentDoc.line(group.lineEnd).to;

      return {
        groupIndex: index,
        lines: linesDisplay,
        from,
        to,
        length: to - from,
        resultIds: group.resultIds.join(", "),
      };
    });

    return (
      <table className="debug-table">
        <thead>
          <tr>
            <th>Group</th>
            <th>Lines</th>
            <th>From</th>
            <th>To</th>
            <th>Length</th>
            <th>Result IDs</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.groupIndex}>
              <td className="range-id">{group.groupIndex}</td>
              <td className="range-value">{group.lines}</td>
              <td className="range-value">{group.from}</td>
              <td className="range-value">{group.to}</td>
              <td className="range-value">{group.length}</td>
              <td className="range-value">{group.resultIds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h3>Debug Panel</h3>
        <div className="debug-status">
          <strong>Syncing:</strong> {isSyncing ? "Yes" : "No"}
        </div>
      </div>

      <div className="debug-tabs">
        <button
          className={`debug-tab ${activeTab === "heights" ? "active" : ""}`}
          onClick={() => handleTabChange("heights")}
        >
          Heights
        </button>
        <button
          className={`debug-tab ${activeTab === "ranges" ? "active" : ""}`}
          onClick={() => handleTabChange("ranges")}
        >
          Result Groups
        </button>
      </div>

      <div className="debug-tab-content">
        {activeTab === "heights" ? renderHeightsTab() : renderRangesTab()}
      </div>
    </div>
  );
};
