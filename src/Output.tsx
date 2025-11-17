import React, { useImperativeHandle, useRef, useEffect } from "react";
import { Expression } from "./execution";

interface OutputProps {
  expression: Expression;
  index: number;
  ref?: (element: HTMLDivElement | null) => void;
}

export const Output: React.FC<OutputProps> = ({ expression, ref }) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useImperativeHandle(ref, () => elementRef.current as HTMLDivElement, []);

  // Composite all images onto a single canvas
  useEffect(() => {
    if (expression.result?.images && expression.result.images.length > 0 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw all images on top of each other
        expression.result.images.forEach((image) => {
          ctx.drawImage(image, 0, 0);
        });
      }
    }
  }, [expression.result?.images]);

  // Get dimensions from first image if available
  const firstImage = expression.result?.images?.[0];
  const width = firstImage?.width || 800;
  const height = firstImage?.height || 600;

  return (
    <div
      ref={elementRef}
      className="output-container"
    >
      <div className="output-line">
        {expression.result?.output.map((item, i) => (
          <div
            key={i}
            className={`output-item output-${item.type}`}
          >
            <pre>{item.text}</pre>
          </div>
        ))}
        {expression.result?.images && expression.result.images.length > 0 && (
          <div
            className="output-item output-plot"
          >
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
            />
          </div>
        )}
      </div>
    </div>
  );
};
