import React, { useRef, useEffect, useCallback } from 'react'
import { Preview } from './Preview'
import { ApiExecuteResult } from './api'

export interface PreviewHeight {
  line: number;
  height: number;
}

const usePreviewHeights = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  previewRefs: React.RefObject<(HTMLDivElement | null)[]>,
  previewData: any[],
  onHeightChange?: (heights: PreviewHeight[]) => void
) => {
  const getPreviewHeights = useCallback((): PreviewHeight[] => {
    return previewData.map((_, index) => {
      const lineNumber = index + 1;
      const previewElement = previewRefs.current[index];
      
      if (!previewElement) {
        return { line: lineNumber, height: 0 };
      }
      
      return {
        line: lineNumber,
        height: Math.max(0, previewElement.getBoundingClientRect().height)
      };
    });
  }, [previewData]);

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
  }, [onHeightChange, getPreviewHeights]);

  return {
    containerRef,
  };
};

const previewData = [
  {
    type: 'table' as const,
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
    type: 'plot' as const,
    content: {
      title: 'Temperature Trend',
      data: [23, 28, 31, 35, 29, 26, 24]
    }
  },
  {
    type: 'array' as const,
    content: {
      title: 'User IDs',
      array: [1001, 1024, 1087, 1156, 1203, 1299, 1345]
    }
  },
  {
    type: 'table' as const,
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
  { type: 'empty' as const },
  {
    type: 'plot' as const,
    content: {
      title: 'Memory Usage',
      data: [45, 52, 48, 61, 58, 43, 39, 55]
    }
  },
  {
    type: 'array' as const,
    content: {
      title: 'Colors',
      array: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57']
    }
  },
  { type: 'empty' as const },
  {
    type: 'table' as const,
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
    type: 'plot' as const,
    content: {
      title: 'CPU Load',
      data: [12, 18, 23, 19, 14, 21, 16, 25, 20]
    }
  },
  {
    type: 'array' as const,
    content: {
      title: 'Recent Files',
      array: ['config.json', 'app.log', 'backup.sql', 'cache.tmp']
    }
  }
]

interface PreviewPaneProps {
  onHeightChange?: (heights: PreviewHeight[]) => void;
  targetHeights?: PreviewHeight[];
  results: ApiExecuteResult[];
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({ onHeightChange, targetHeights, results }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dataToRender = results.map((_, index) => previewData[index % previewData.length]);
  usePreviewHeights(containerRef, previewRefs, dataToRender, onHeightChange);

  return (
    <div id="preview" ref={containerRef}>
      <div className="preview-content">
        {results.map((result, index) => {
          const item = previewData[index % previewData.length];
          const lineNumber = index + 1;
          const lineTargetHeight = targetHeights?.find(t => t.line === lineNumber)?.height;

          return (
            <Preview
              key={result.id}
              ref={el => previewRefs.current[index] = el}
              item={item}
              index={index}
              targetHeight={lineTargetHeight}
              isEven={index % 2 === 1}
            />
          );
        })}
      </div>
    </div>
  );
};