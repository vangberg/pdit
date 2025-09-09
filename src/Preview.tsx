import React, { useRef } from 'react'
import { useSpacer } from './PreviewSpacer'

// Type for a single preview item - matching the structure from PreviewPane
type PreviewItem = {
  type: 'empty';
} | {
  type: 'table' | 'plot' | 'array';
  content: {
    title?: string;
    table?: string[][];
    data?: number[];
    array?: (string | number)[];
  };
};

interface PreviewProps {
  item: PreviewItem;
  index: number;
  targetHeight?: number;
  ref?: (element: HTMLDivElement | null) => void;
}

export const Preview: React.FC<PreviewProps> = ({ item, index, targetHeight, ref }) => {
  const lineNumber = index + 1;
  const contentRef = useRef<HTMLDivElement>(null);
  const spacer = useSpacer(targetHeight, contentRef);

  return (
    <div ref={ref} className="preview-spacer-container">
      <div ref={contentRef}>
        {item.type === 'empty' ? (
          <div className="preview-line empty-line">
            {/* Empty line content */}
          </div>
        ) : item.content ? (
          <div className="preview-line" data-line={lineNumber}>
            {item.type === 'table' && item.content.table && (
              <table className="preview-table">
                <tbody>
                  {item.content.table.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === 0 ? 'header-row' : ''}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {item.type === 'plot' && item.content.data && (
              <div className="plot-chart">
                {item.content.data.map((value, i) => (
                  <div 
                    key={i} 
                    className="plot-bar" 
                    style={{ 
                      height: `${(value / Math.max(...item.content.data!)) * 100}%`
                    }}
                  ></div>
                ))}
              </div>
            )}

            {item.type === 'array' && item.content.array && (
              <div className="array-items">
                {item.content.array.map((arrayItem, i) => (
                  <span key={i} className="array-item">{arrayItem}</span>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
      {spacer}
    </div>
  );
};