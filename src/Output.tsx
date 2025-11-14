import React, { useImperativeHandle, useRef, useEffect } from "react";
import { ExecutionOutput } from "./execution";

interface OutputProps {
  result: ExecutionOutput;
  index: number;
  ref?: (element: HTMLDivElement | null) => void;
}

export const Output: React.FC<OutputProps> = ({ result, ref }) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useImperativeHandle(ref, () => elementRef.current as HTMLDivElement, []);

  // Composite all images onto a single canvas
  useEffect(() => {
    if (result.images && result.images.length > 0 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Draw all images on top of each other
        result.images.forEach((image) => {
          ctx.drawImage(image, 0, 0);
        });
      }
    }
  }, [result.images]);

  // Get dimensions from first image if available
  const firstImage = result.images?.[0];
  const width = firstImage?.width || 800;
  const height = firstImage?.height || 600;

  return (
    <div
      ref={elementRef}
      className={result.isInvisible ? "output-container-invisible" : "output-container"}
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
        {result.images && result.images.length > 0 && (
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
