import React, { useImperativeHandle, useRef } from "react";
import { ExecutionOutput } from "./execution";

interface OutputProps {
  result: ExecutionOutput;
  index: number;
  isEven?: boolean;
  ref?: (element: HTMLDivElement | null) => void;
}

export const Output: React.FC<OutputProps> = ({ result, isEven, ref }) => {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => elementRef.current as HTMLDivElement, []);

  return (
    <div
      ref={elementRef}
      className={`output-container${isEven ? " zebra" : ""}`}
    >
      <div className="output-line">
        {result.output.map((item, i) => (
          <div
            key={i}
            className={`output-item output-${item.type}`}
          >
            <pre>{item.text}</pre>
          </div>
        ))}
      </div>
    </div>
  );
};
