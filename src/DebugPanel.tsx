import React, { useState } from "react";
import { LineHeight } from "./line-heights";
import { OutputHeight } from "./OutputPane";
import { RangeSet, Text } from "@codemirror/state";
import { GroupValue } from "./result-grouping-plugin";

interface DebugPanelProps {
  editorHeights: LineHeight[];
  outputHeights: OutputHeight[];
  targetEditorHeights: LineHeight[];
  targetOutputHeights: OutputHeight[];
  isSyncing: boolean;
  groupRanges?: RangeSet<GroupValue>;
  currentDoc?: Text | null;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  editorHeights,
  outputHeights,
  targetEditorHeights,
  targetOutputHeights,
  isSyncing,
  groupRanges,
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
    if (!groupRanges || groupRanges.size === 0 || !currentDoc) {
      return (
        <div className="debug-empty">
          No result groups or document available
        </div>
      );
    }

    const groups: Array<{
      groupIndex: number;
      lines: string;
      from: number;
      to: number;
      resultIds: string;
    }> = [];

    groupRanges.between(0, currentDoc.length, (from, to, value) => {
      const startLine = currentDoc.lineAt(from).number;
      const endPos = to > from ? to - 1 : to;
      const endLine = currentDoc.lineAt(endPos).number;
      const linesDisplay =
        startLine === endLine ? `${startLine}` : `[${startLine}, ${endLine}]`;

      groups.push({
        groupIndex: value.groupIndex,
        lines: linesDisplay,
        from,
        to,
        resultIds: value.resultIds.join(", "),
      });
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
              <td className="range-value">{group.to - group.from}</td>
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
