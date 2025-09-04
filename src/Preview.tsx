import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react'

export interface PreviewHeight {
  line: number;
  height: number;
}

export interface PreviewRef {
  getPreviewHeights: () => PreviewHeight[];
  setPreviewHeights: (heights: PreviewHeight[]) => void;
}

export interface PreviewProps {
  onHeightChange?: (heights: PreviewHeight[]) => void;
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

export const Preview = forwardRef<PreviewRef, PreviewProps>(({ onHeightChange }, ref) => {
  const [spacerHeights, setSpacerHeights] = useState<Map<number, number>>(new Map());
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSettingHeights = useRef<boolean>(false);

  const getPreviewHeights = (): PreviewHeight[] => {
    return lineRefs.current.map((lineElement, index) => {
      const lineNumber = index + 1;
      if (!lineElement) {
        return { line: lineNumber, height: 0 };
      }
      
      const rect = lineElement.getBoundingClientRect();
      const spacerHeight = spacerHeights.get(lineNumber) || 0;
      const actualHeight = rect.height - spacerHeight;
      
      return {
        line: lineNumber,
        height: Math.max(0, actualHeight)
      };
    });
  };

  const setPreviewHeights = (heights: PreviewHeight[]): void => {
    isSettingHeights.current = true;
    
    const newSpacerHeights = new Map<number, number>();
    
    heights.forEach(({ line, height }) => {
      const lineElement = lineRefs.current[line - 1];
      if (!lineElement) return;
      
      const currentRect = lineElement.getBoundingClientRect();
      const currentSpacerHeight = spacerHeights.get(line) || 0;
      const currentContentHeight = currentRect.height - currentSpacerHeight;
      const diff = height - currentContentHeight;
      
      if (diff > 0.1) {
        newSpacerHeights.set(line, diff);
      }
    });
    
    setSpacerHeights(newSpacerHeights);
    
    // Reset flag after state update
    requestAnimationFrame(() => {
      isSettingHeights.current = false;
    });
  };

  useImperativeHandle(ref, () => ({
    getPreviewHeights,
    setPreviewHeights
  }));

  useEffect(() => {
    if (!containerRef.current || !onHeightChange) return;

    // Initial callback (like CodeMirror's setTimeout pattern)
    const initialTimeout = setTimeout(() => {
      if (!isSettingHeights.current) {
        onHeightChange(getPreviewHeights());
      }
    }, 0);

    // ResizeObserver for container size changes (window resize, devtools, etc.)
    const resizeObserver = new ResizeObserver(() => {
      if (!isSettingHeights.current) {
        onHeightChange(getPreviewHeights());
      }
    });

    // MutationObserver for DOM changes that might affect height
    const mutationObserver = new MutationObserver(() => {
      if (!isSettingHeights.current) {
        onHeightChange(getPreviewHeights());
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      mutationObserver.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }

    return () => {
      clearTimeout(initialTimeout);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [onHeightChange]);

  return (
    <div id="preview" ref={containerRef}>
      <div className="preview-content">
        {previewData.map((item, index) => {
          const lineNumber = index + 1;
          const spacerHeight = spacerHeights.get(lineNumber) || 0;
          
          if (item.type === 'empty') {
            return (
              <div key={index} className="preview-line empty-line" ref={el => { lineRefs.current[index] = el; }}>
                {spacerHeight > 0 && (
                  <div className="preview-spacer" style={{ height: `${spacerHeight}px` }}></div>
                )}
              </div>
            );
          }

          if (!item.content) return null;

          return (
            <div key={index} className="preview-line" data-line={lineNumber} ref={el => { lineRefs.current[index] = el; }}>
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
              
              {spacerHeight > 0 && (
                <div className="preview-spacer" style={{ height: `${spacerHeight}px` }}></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});