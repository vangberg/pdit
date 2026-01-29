import React, { useImperativeHandle, useRef } from "react";
import Markdown from "react-markdown";
import { Expression } from "./execution";

interface OutputProps {
  expression: Expression;
  index: number;
  ref?: (element: HTMLDivElement | null) => void;
  allInvisible?: boolean;
}

// Component for rendering a single image output item
// content is base64-encoded data (not a data URL)
const ImageOutput: React.FC<{
  content: string;
  mimeType: string;
  width?: number;
  height?: number;
}> = ({ content, mimeType, width, height }) => {
  const dataUrl = `data:${mimeType};base64,${content}`;
  return <img src={dataUrl} className="output-image" alt="Plot output" width={width} height={height} />;
};

// Component for rendering HTML output (from _repr_html_())
const HtmlOutput: React.FC<{ html: string }> = ({ html }) => {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;

    // Set the HTML content
    ref.current.innerHTML = html;

    // Execute scripts by creating new script elements
    // This is necessary because setting innerHTML does not execute scripts
    const scripts = ref.current.querySelectorAll('script');
    scripts.forEach((script) => {
      const newScript = document.createElement('script');
      Array.from(script.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = script.textContent;
      script.parentNode?.replaceChild(newScript, script);
    });
  }, [html]);

  return (
    <div
      ref={ref}
      className="output-html"
    />
  );
};

// Sanitize type for CSS class names (replace slashes with dashes)
const sanitizeTypeForCss = (type: string): string => type.replace(/\//g, '-');

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
        {expression.result?.output.map((item, i) => {
          return (
            <div
              key={i}
              className={`output-item output-${sanitizeTypeForCss(item.type)}`}
            >
              <div className="output-content-wrapper">
                {item.type === 'text/markdown' ? (
                  <Markdown>{item.content}</Markdown>
                ) : item.type.startsWith('image/') ? (
                  <ImageOutput content={item.content} mimeType={item.type} width={item.width} height={item.height} />
                ) : item.type === 'text/html' ? (
                  <HtmlOutput html={item.content} />
                ) : (
                  <pre>{item.content}</pre>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
