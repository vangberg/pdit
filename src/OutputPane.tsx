import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { Output } from "./Output";
import { Expression } from "./execution";
import { LineGroup } from "./compute-line-groups";
import { CSSProperties } from "react";

interface OutputPaneProps {
  onLineGroupHeightChange?: (heights: Map<string, number>) => void;
  expressions: Expression[];
  lineGroups: LineGroup[];
  lineGroupTops?: Map<string, number>;
  lineGroupHeights?: Map<string, number>;
}

export const OutputPane: React.FC<OutputPaneProps> = ({
  onLineGroupHeightChange,
  expressions,
  lineGroups,
  lineGroupTops,
  lineGroupHeights,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineGroupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const minHeight = useMemo(() => {
    if (!lineGroupTops || !lineGroupHeights || lineGroups.length === 0) {
      return undefined;
    }

    const lastGroup = lineGroups[lineGroups.length - 1];
    const top = lineGroupTops.get(lastGroup.id);
    const height = lineGroupHeights.get(lastGroup.id);

    return (top !== undefined && height !== undefined) ? top + height : undefined;
  }, [lineGroups, lineGroupTops, lineGroupHeights]);

  const getLineGroupHeights = useCallback((): Map<string, number> => {
    const heights = new Map<string, number>();
    for (const [id, el] of lineGroupRefs.current.entries()) {
      if (el) {
        heights.set(id, Math.max(0, el.getBoundingClientRect().height));
      }
    }
    return heights;
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
      // mutationObserver.observe(containerRef.current, {
      //   childList: true,
      //   subtree: true,
      //   attributes: true,
      //   attributeFilter: ["style", "class"],
      // });
      // Single ResizeObserver on the container catches all internal size changes
      // resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(initialTimeout);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [onLineGroupHeightChange, getLineGroupHeights, lineGroups]);

  return (
    <div id="output" ref={containerRef}>
      <div
        className="output-content"
        style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      >
        {lineGroups.map((group) => {
          const topValue = lineGroupTops?.get(group.id);
          return (
            <div
              className="output-group"
              key={group.id}
              ref={(el) => {
                if (el) {
                  lineGroupRefs.current.set(group.id, el);
                } else {
                  lineGroupRefs.current.delete(group.id);
                }
              }}
              style={
                topValue !== undefined && Number.isFinite(topValue)
                  ? ({
                      position: "absolute",
                      top: topValue,
                      left: 0,
                      right: 0,
                    } as CSSProperties)
                  : undefined
              }
            >
              {group.resultIds.map((resultId) => {
                const index = expressions.findIndex((expr) => expr.id === resultId);
                if (index === -1) return null;
                const expression = expressions[index];

                return (
                  <Output
                    key={expression.id}
                    expression={expression}
                    index={index}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
