import React, { useRef, useEffect, createRef } from 'react'
import { Preview } from './Preview'

export interface PreviewHeight {
  line: number;
  height: number;
}

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
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({ onHeightChange, targetHeights }) => {
  const lineRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Manage refs array size based on data length
  useEffect(() => {
    lineRefs.current = previewData.map((_, index) => 
      lineRefs.current[index] || createRef<HTMLDivElement>()
    );
  }, [previewData.length]);

  const getPreviewHeights = (): PreviewHeight[] => {
    return lineRefs.current.map((refObject, index) => {
      const lineNumber = index + 1;
      const previewElement = refObject?.current;
      
      if (!previewElement) {
        return { line: lineNumber, height: 0 };
      }
      
      // Find the preview-line element within the Preview component
      const lineElement = previewElement.querySelector('.preview-line');
      if (!lineElement) {
        return { line: lineNumber, height: 0 };
      }
      
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
            <Preview
              key={index}
              ref={lineRefs.current[index]}
              item={item}
              index={index}
              targetHeight={lineTargetHeight}
            />
          );
        })}
      </div>
    </div>
  );
};