import React, { useImperativeHandle, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import { Expression } from "./execution";
import { DataframeTable } from "./DataframeTable";

interface OutputProps {
  expression: Expression;
  index: number;
  ref?: (element: HTMLDivElement | null) => void;
  allInvisible?: boolean;
}

// Component for rendering a single image output item
const ImageOutput: React.FC<{ dataUrl: string }> = ({ dataUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

  useEffect(() => {
    const loadImage = async () => {
      try {
        // Convert data URL to Blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        // Convert Blob to ImageBitmap
        const imageBitmap = await createImageBitmap(blob);

        // Update dimensions
        setDimensions({ width: imageBitmap.width, height: imageBitmap.height });

        // Draw on canvas
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, imageBitmap.width, imageBitmap.height);
            ctx.drawImage(imageBitmap, 0, 0);
          }
        }
      } catch (error) {
        console.error('Failed to load image:', error);
      }
    };

    loadImage();
  }, [dataUrl]);

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
    />
  );
};

export const Output: React.FC<OutputProps> = ({ expression, ref, allInvisible }) => {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => elementRef.current as HTMLDivElement, []);

  const containerClassName = allInvisible ? "output-container output-container-invisible" : "output-container";

  return (
    <div
      ref={elementRef}
      className={containerClassName}
    >
      <div className="output-line">
        {expression.result?.output.map((item, i) => (
          <div
            key={i}
            className={`output-item output-${item.type}`}
          >
            {item.type === 'markdown' ? (
              <Markdown>{item.content}</Markdown>
            ) : item.type === 'dataframe' ? (
              <DataframeTable jsonData={item.content} />
            ) : item.type === 'image' ? (
              <ImageOutput dataUrl={item.content} />
            ) : (
              <pre>{item.content}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
