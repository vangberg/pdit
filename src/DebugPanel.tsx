import React from 'react';
import { LineHeight } from './line-heights';
import { PreviewHeight } from './Preview';

interface DebugPanelProps {
  editorHeights: LineHeight[];
  previewHeights: PreviewHeight[];
  targetEditorHeights: LineHeight[];
  targetPreviewHeights: PreviewHeight[];
  isSyncing: boolean;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  editorHeights,
  previewHeights,
  targetEditorHeights,
  targetPreviewHeights,
  isSyncing
}) => {
  // Get max lines to show
  const maxLines = Math.max(
    editorHeights.length,
    previewHeights.length,
    targetEditorHeights.length,
    targetPreviewHeights.length,
    5
  );

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h3>Debug Heights</h3>
        <div className="debug-status">
          <strong>Syncing:</strong> {isSyncing ? 'Yes' : 'No'}
        </div>
      </div>
      
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
    </div>
  );
};