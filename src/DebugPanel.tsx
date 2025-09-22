import React, { useState } from 'react';
import { LineHeight } from './line-heights';
import { PreviewHeight } from './PreviewPane';
import { ApiExecuteResponse } from './api';
import { RangeSet } from '@codemirror/state';

interface DebugPanelProps {
  editorHeights: LineHeight[];
  previewHeights: PreviewHeight[];
  targetEditorHeights: LineHeight[];
  targetPreviewHeights: PreviewHeight[];
  isSyncing: boolean;
  executeResults?: ApiExecuteResponse | null;
  resultRanges?: RangeSet<any>;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  editorHeights,
  previewHeights,
  targetEditorHeights,
  targetPreviewHeights,
  isSyncing,
  executeResults
}) => {
  const [activeTab, setActiveTab] = useState<'heights' | 'ranges'>('heights');

  // Get max lines to show for heights tab
  const maxLines = Math.max(
    editorHeights.length,
    previewHeights.length,
    targetEditorHeights.length,
    targetPreviewHeights.length,
    5
  );

  const renderHeightsTab = () => (
    <table className="debug-table">
      <thead>
        <tr>
          <th>Line</th>
          <th>Editor Natural</th>
          <th>Preview Natural</th>
          <th>Target Editor</th>
          <th>Target Preview</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: Math.min(maxLines, 8) }, (_, index) => {
          const lineNum = index + 1;
          const editorHeight = editorHeights.find(h => h.line === lineNum);
          const previewHeight = previewHeights.find(h => h.line === lineNum);
          const targetEditor = targetEditorHeights.find(h => h.line === lineNum);
          const targetPreview = targetPreviewHeights.find(h => h.line === lineNum);

          return (
            <tr key={lineNum}>
              <td className="line-number">{lineNum}</td>
              <td className="height-value">{editorHeight?.height.toFixed(1) || '-'}</td>
              <td className="height-value">{previewHeight?.height.toFixed(1) || '-'}</td>
              <td className="height-value">{targetEditor?.height.toFixed(1) || '-'}</td>
              <td className="height-value">{targetPreview?.height.toFixed(1) || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderRangesTab = () => {
    if (!executeResults || !executeResults.results.length) {
      return <div className="debug-empty">No execution results available</div>;
    }

    return (
      <table className="debug-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>From</th>
            <th>To</th>
            <th>Length</th>
          </tr>
        </thead>
        <tbody>
          {executeResults.results.map(result => (
            <tr key={result.id}>
              <td className="range-id">{result.id}</td>
              <td className="range-value">{result.from}</td>
              <td className="range-value">{result.to}</td>
              <td className="range-value">{result.to - result.from}</td>
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
          <strong>Syncing:</strong> {isSyncing ? 'Yes' : 'No'}
        </div>
      </div>

      <div className="debug-tabs">
        <button
          className={`debug-tab ${activeTab === 'heights' ? 'active' : ''}`}
          onClick={() => setActiveTab('heights')}
        >
          Heights
        </button>
        <button
          className={`debug-tab ${activeTab === 'ranges' ? 'active' : ''}`}
          onClick={() => setActiveTab('ranges')}
        >
          Result Ranges
        </button>
      </div>

      <div className="debug-tab-content">
        {activeTab === 'heights' ? renderHeightsTab() : renderRangesTab()}
      </div>
    </div>
  );
};