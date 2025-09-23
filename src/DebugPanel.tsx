import React, { useState } from "react";
import { LineHeight } from "./line-heights";
import { OutputHeight } from "./OutputPane";
import { ApiExecuteResponse } from "./api";
import { RangeSet, Text } from "@codemirror/state";

interface DebugPanelProps {
  editorHeights: LineHeight[];
  outputHeights: OutputHeight[];
  targetEditorHeights: LineHeight[];
  targetOutputHeights: OutputHeight[];
  isSyncing: boolean;
  executeResults?: ApiExecuteResponse | null;
  resultRanges?: RangeSet<any>;
  currentDoc?: Text | null;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  editorHeights,
  outputHeights,
  targetEditorHeights,
  targetOutputHeights,
  isSyncing,
  executeResults,
  resultRanges,
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
    if (!resultRanges || resultRanges.size === 0 || !currentDoc) {
      return (
        <div className="debug-empty">
          No result ranges or document available
        </div>
      );
    }

    const ranges: Array<{
      id: number;
      from: number;
      to: number;
      lines: string;
    }> = [];
    resultRanges.between(0, Number.MAX_SAFE_INTEGER, (from, to, value) => {
      const fromLine = currentDoc.lineAt(from).number;
      const toLine = currentDoc.lineAt(to).number;
      const linesDisplay =
        fromLine === toLine ? `${fromLine}` : `[${fromLine}, ${toLine}]`;

      ranges.push({
        id: (value as any).id || ranges.length,
        from,
        to,
        lines: linesDisplay,
      });
    });

    return (
      <table className="debug-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Lines</th>
            <th>From</th>
            <th>To</th>
            <th>Length</th>
          </tr>
        </thead>
        <tbody>
          {ranges.map((range, index) => (
            <tr key={range.id || index}>
              <td className="range-id">{range.id}</td>
              <td className="range-value">{range.lines}</td>
              <td className="range-value">{range.from}</td>
              <td className="range-value">{range.to}</td>
              <td className="range-value">{range.to - range.from}</td>
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
          Result Ranges
        </button>
      </div>

      <div className="debug-tab-content">
        {activeTab === "heights" ? renderHeightsTab() : renderRangesTab()}
      </div>
    </div>
  );
};
