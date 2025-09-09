import React, { useRef, useEffect } from 'react'
import { PreviewSpacer } from './PreviewSpacer'

export interface PreviewHeight {
  line: number;
  height: number;
}

export interface PreviewProps {
  onHeightChange?: (heights: PreviewHeight[]) => void;
  targetHeights?: PreviewHeight[];
}

const previewData = [
  {
    type: 'table',
    content: {
      title: 'Sales Data',
      table: [
        ['Month', 'Revenue', 'Units'],
        ['Jan', '$12,400', '124'],
        ['Feb', '$9,800', '98'],
        ['Mar', '$15,200', '152']
      ]
    }
  },
  {
    type: 'plot',
    content: {
      title: 'Temperature Trend',
      data: [23, 28, 31, 35, 29, 26, 24]
    }
  },
  {
    type: 'array',
    content: {
      title: 'User IDs',
      array: [1001, 1024, 1087, 1156, 1203, 1299, 1345]
    }
  },
  {
    type: 'table',
    content: {
      title: 'Server Status',
      table: [
        ['Service', 'Status', 'Uptime'],
        ['API', 'Online', '99.9%'],
        ['DB', 'Online', '99.8%'],
        ['Cache', 'Warning', '97.2%']
      ]
    }
  },
  { type: 'empty' },
  {
    type: 'plot',
    content: {
      title: 'Memory Usage',
      data: [45, 52, 48, 61, 58, 43, 39, 55]
    }
  },
  {
    type: 'array',
    content: {
      title: 'Colors',
      array: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57']
    }
  },
  { type: 'empty' },
  {
    type: 'table',
    content: {
      title: 'Network Stats',
      table: [
        ['Metric', 'Value', 'Change'],
        ['Latency', '45ms', '+2ms'],
        ['Bandwidth', '1.2GB/s', '-0.1'],
        ['Errors', '0.01%', '-0.02%']
      ]
    }
  },
  {
    type: 'plot',
    content: {
      title: 'CPU Load',
      data: [12, 18, 23, 19, 14, 21, 16, 25, 20]
    }
  },
  {
    type: 'array',
    content: {
      title: 'Recent Files',
      array: ['config.json', 'app.log', 'backup.sql', 'cache.tmp']
    }
  }
]

export const Preview: React.FC<PreviewProps> = ({ onHeightChange, targetHeights }) => {
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);


  const getPreviewHeights = (): PreviewHeight[] => {
    return lineRefs.current.map((lineElement, index) => {
      const lineNumber = index + 1;
      if (!lineElement) {
        return { line: lineNumber, height: 0 };
      }
      
      // The lineElement now contains the natural content height
      // (spacers are rendered separately)
      const rect = lineElement.getBoundingClientRect();
      
      return {
        line: lineNumber,
        height: Math.max(0, rect.height)
      };
    });
  };


  useEffect(() => {
    if (!containerRef.current || !onHeightChange) return;

    // Initial callback (like CodeMirror's setTimeout pattern)
    const initialTimeout = setTimeout(() => {
      onHeightChange(getPreviewHeights());
    }, 0);

    // MutationObserver for DOM changes that might affect height
    // But skip changes to spacer elements to avoid loops
    const mutationObserver = new MutationObserver((mutations) => {
      const hasNonSpacerChanges = mutations.some(mutation => {
        const target = mutation.target as Element;
        return !target.classList?.contains('preview-spacer');
      });
      
      if (hasNonSpacerChanges) {
        onHeightChange(getPreviewHeights());
      }
    });

    // ResizeObserver to watch for content size changes in line elements
    const resizeObserver = new ResizeObserver(() => {
      onHeightChange(getPreviewHeights());
    });

    // Observe the container for mutations and resizes
    if (containerRef.current) {
      mutationObserver.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // Single ResizeObserver on the container catches all internal size changes
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(initialTimeout);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [onHeightChange]);

  return (
    <div id="preview" ref={containerRef}>
      <div className="preview-content">
        {previewData.map((item, index) => {
          const lineNumber = index + 1;
          const lineTargetHeight = targetHeights?.find(t => t.line === lineNumber)?.height;
          
          return (
            <PreviewSpacer key={index} targetHeight={lineTargetHeight}>
              {item.type === 'empty' ? (
                <div className="preview-line empty-line" ref={el => { lineRefs.current[index] = el; }}>
                  {/* Empty line content */}
                </div>
              ) : item.content ? (
                <div className="preview-line" data-line={lineNumber} ref={el => { lineRefs.current[index] = el; }}>
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
            </PreviewSpacer>
          );
        })}
      </div>
    </div>
  );
};