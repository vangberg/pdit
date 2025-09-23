import React, { useImperativeHandle, useRef } from "react";
import { useSpacerHeight, Spacer } from "./Spacer";

// Type for a single output item - matching the structure from OutputPane
type OutputItem =
  | {
      type: "empty";
    }
  | {
      type: "table" | "plot" | "array";
      content: {
        title?: string;
        table?: string[][];
        data?: number[];
        array?: (string | number)[];
      };
    };

interface OutputProps {
  item: OutputItem;
  index: number;
  targetHeight?: number;
  isEven?: boolean;
  ref?: (element: HTMLDivElement | null) => void;
}

export const Output: React.FC<OutputProps> = ({
  item,
  index,
  targetHeight,
  isEven,
  ref,
}) => {
  const lineNumber = index + 1;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const spacerHeight = useSpacerHeight(elementRef, targetHeight);
  
  useImperativeHandle(ref, () => elementRef.current as HTMLDivElement, []);

  return [
    <div key="content" ref={elementRef} className={`output-container${isEven ? ' zebra' : ''}`}>
      {item.type === "empty" ? (
        <div className="output-line empty-line">
          {/* Empty line content */}
        </div>
      ) : item.content ? (
        <div className="output-line" data-line={lineNumber}>
          {item.type === "table" && item.content.table && (
            <table className="output-table">
              <tbody>
                {item.content.table.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={rowIndex === 0 ? "header-row" : ""}
                  >
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {item.type === "plot" && item.content.data && (
            <div className="plot-chart">
              {item.content.data.map((value, i) => (
                <div
                  key={i}
                  className="plot-bar"
                  style={{
                    height: `${
                      (value / Math.max(...item.content.data!)) * 100
                    }%`,
                  }}
                ></div>
              ))}
            </div>
          )}

          {item.type === "array" && item.content.array && (
            <div className="array-items">
              {item.content.array.map((arrayItem, i) => (
                <span key={i} className="array-item">
                  {arrayItem}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>,
    <Spacer height={spacerHeight} />,
  ];
};
