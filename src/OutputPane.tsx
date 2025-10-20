import React, { useRef, useEffect, useCallback } from "react";
import { Output } from "./Output";
import { ApiExecuteResult } from "./api";
import { LineGroup } from "./compute-line-groups";

export interface OutputHeight {
  line: number;
  height: number;
}

const outputData = [
  {
    type: "table" as const,
    content: {
      title: "Sales Data",
      table: [
        ["Month", "Revenue", "Units"],
        ["Jan", "$12,400", "124"],
        ["Feb", "$9,800", "98"],
        ["Mar", "$15,200", "152"],
      ],
    },
  },
  {
    type: "plot" as const,
    content: {
      title: "Temperature Trend",
      data: [23, 28, 31, 35, 29, 26, 24],
    },
  },
  {
    type: "array" as const,
    content: {
      title: "User IDs",
      array: [1001, 1024, 1087, 1156, 1203, 1299, 1345],
    },
  },
  {
    type: "table" as const,
    content: {
      title: "Server Status",
      table: [
        ["Service", "Status", "Uptime"],
        ["API", "Online", "99.9%"],
        ["DB", "Online", "99.8%"],
        ["Cache", "Warning", "97.2%"],
      ],
    },
  },
  { type: "empty" as const },
  {
    type: "plot" as const,
    content: {
      title: "Memory Usage",
      data: [45, 52, 48, 61, 58, 43, 39, 55],
    },
  },
  {
    type: "array" as const,
    content: {
      title: "Colors",
      array: ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57"],
    },
  },
  { type: "empty" as const },
  {
    type: "table" as const,
    content: {
      title: "Network Stats",
      table: [
        ["Metric", "Value", "Change"],
        ["Latency", "45ms", "+2ms"],
        ["Bandwidth", "1.2GB/s", "-0.1"],
        ["Errors", "0.01%", "-0.02%"],
      ],
    },
  },
  {
    type: "plot" as const,
    content: {
      title: "CPU Load",
      data: [12, 18, 23, 19, 14, 21, 16, 25, 20],
    },
  },
  {
    type: "array" as const,
    content: {
      title: "Recent Files",
      array: ["config.json", "app.log", "backup.sql", "cache.tmp"],
    },
  },
];

interface OutputPaneProps {
  onLineGroupHeightChange?: (heights: number[]) => void;
  results: ApiExecuteResult[];
  lineGroups: LineGroup[];
}

export const OutputPane: React.FC<OutputPaneProps> = ({
  onLineGroupHeightChange,
  results,
  lineGroups,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineGroupRefs = useRef<(HTMLDivElement | null)[]>([]);

  const getLineGroupHeights = useCallback((): number[] => {
    if (!lineGroupRefs.current) return [];
    return lineGroupRefs.current.map((el) =>
      el ? Math.max(0, el.getBoundingClientRect().height) : 0
    );
  }, []);

  useEffect(() => {
    if (!containerRef.current || !onLineGroupHeightChange) return;

    // Initial callback (like CodeMirror's setTimeout pattern)
    const initialTimeout = setTimeout(() => {
      onLineGroupHeightChange(getLineGroupHeights());
    }, 0);

    // MutationObserver for DOM changes that might affect height
    const mutationObserver = new MutationObserver(() => {
      onLineGroupHeightChange(getLineGroupHeights());
    });

    // ResizeObserver to watch for content size changes in line elements
    const resizeObserver = new ResizeObserver(() => {
      onLineGroupHeightChange(getLineGroupHeights());
    });

    // Observe the container for mutations and resizes
    if (containerRef.current) {
      mutationObserver.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });

      // Single ResizeObserver on the container catches all internal size changes
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(initialTimeout);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [onLineGroupHeightChange, getLineGroupHeights]);

  return (
    <div id="output" ref={containerRef}>
      <div className="output-content">
        {lineGroups.map((group, groupIndex) => (
          <div
            className="output-group"
            key={group.resultIds.join("-")}
            ref={(el) => {
              lineGroupRefs.current[groupIndex] = el;
            }}
          >
            {group.resultIds.map((resultId) => {
              const index = results.findIndex((res) => res.id === resultId);
              if (index === -1) return null;
              const result = results[index];
              const item = outputData[index % outputData.length];

              return (
                <Output
                  key={result.id}
                  item={item}
                  index={index}
                  isEven={index % 2 === 1}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
