import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { Output } from "./Output";
import { Expression } from "./execution";
import { LineGroup } from "./compute-line-groups";
import { LineGroupLayout } from "./line-group-layout";
import { CSSProperties } from "react";

interface OutputPaneProps {
  onLineGroupHeightChange?: (heights: Map<string, number>) => void;
  expressions: Expression[];
  lineGroups: LineGroup[];
  lineGroupLayouts?: Map<string, LineGroupLayout>;
  lineGroupHeights?: Map<string, number>;
}

export const OutputPane: React.FC<OutputPaneProps> = ({
  onLineGroupHeightChange,
  expressions,
  lineGroups,
  lineGroupLayouts,
  lineGroupHeights,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineGroupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const minHeight = useMemo(() => {
    if (!lineGroupLayouts || !lineGroupHeights || lineGroups.length === 0) {
      return undefined;
    }

    const lastGroup = lineGroups[lineGroups.length - 1];
    const layout = lineGroupLayouts.get(lastGroup.id);
    const height = lineGroupHeights.get(lastGroup.id);

    return layout && height !== undefined ? layout.top + height : undefined;
  }, [lineGroups, lineGroupLayouts, lineGroupHeights]);

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
  }, [onLineGroupHeightChange, getLineGroupHeights, lineGroups]);

  return (
    <div id="output" ref={containerRef}>
      <div
        className="output-content"
        style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      >
        {lineGroups.map((group) => {
          // Check if any expression in this group has output to display
          const hasOutput = group.resultIds.some((resultId) => {
            const expr = expressions.find((e) => e.id === resultId);
            return expr?.result && expr.result.output.length > 0;
          });

          // Don't render empty output boxes
          if (!hasOutput) {
            return null;
          }

          const layout = lineGroupLayouts?.get(group.id);
          const groupClassName = group.allInvisible
            ? "output-group output-group-invisible"
            : "output-group";

          const style: CSSProperties = {};
          if (layout) {
            style.position = "absolute";
            style.top = layout.top;
            style.left = 8;
            style.right = 8;
            style.minHeight = `${layout.naturalHeight}px`;
          }

          return (
            <div
              className={groupClassName}
              key={group.id}
              ref={(el) => {
                if (el) {
                  lineGroupRefs.current.set(group.id, el);
                } else {
                  lineGroupRefs.current.delete(group.id);
                }
              }}
              style={Object.keys(style).length > 0 ? style : undefined}
            >
              {group.resultIds.map((resultId) => {
                const index = expressions.findIndex(
                  (expr) => expr.id === resultId
                );
                if (index === -1) return null;
                const expression = expressions[index];

                return (
                  <Output
                    key={expression.id}
                    expression={expression}
                    index={index}
                    allInvisible={group.allInvisible}
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
