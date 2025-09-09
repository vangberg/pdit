import React from 'react'
import { Preview } from './Preview'
import { usePreviewHeights, PreviewHeight } from './hooks/previewHeights'

export type { PreviewHeight }

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
  const { containerRef, setPreviewRef } = usePreviewHeights(previewData, onHeightChange);

  return (
    <div id="preview" ref={containerRef}>
      <div className="preview-content">
        {previewData.map((item, index) => {
          const lineNumber = index + 1;
          const lineTargetHeight = targetHeights?.find(t => t.line === lineNumber)?.height;
          
          return (
            <Preview
              key={index}
              ref={setPreviewRef(index)}
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