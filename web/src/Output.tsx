import React, { useImperativeHandle, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Expression } from "./execution";

interface OutputProps {
  expression: Expression;
  index: number;
  ref?: (element: HTMLDivElement | null) => void;
  allInvisible?: boolean;
  debugMode?: boolean;
}

// Component for rendering a single image output item
// content is base64-encoded data (not a data URL)
const ImageOutput: React.FC<{ content: string; mimeType: string }> = ({ content, mimeType }) => {
  const dataUrl = `data:${mimeType};base64,${content}`;
  return <img src={dataUrl} className="output-image" alt="Plot output" />;
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

export const Output: React.FC<OutputProps> = ({ expression, ref, allInvisible, debugMode }) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [expandedDebugItems, setExpandedDebugItems] = useState<Set<number>>(new Set());

  useImperativeHandle(ref, () => elementRef.current as HTMLDivElement, []);

  const containerClassName = allInvisible ? "output-container output-container-invisible" : "output-container";

  const toggleDebugInfo = (index: number) => {
    setExpandedDebugItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div
      ref={elementRef}
      className={containerClassName}
    >
      <div className="output-line">
        {expression.result?.output.map((item, i) => {
          const isDebugExpanded = expandedDebugItems.has(i);

          return (
            <div
              key={i}
              className={`output-item output-${sanitizeTypeForCss(item.type)}`}
            >
              <div className="output-content-wrapper">
                {item.type === 'text/markdown' ? (
                  <Markdown>{item.content}</Markdown>
                ) : item.type.startsWith('image/') ? (
                  <ImageOutput content={item.content} mimeType={item.type} />
                ) : item.type === 'text/html' ? (
                  <HtmlOutput html={item.content} />
                ) : (
                  <pre>{item.content}</pre>
                )}
                {debugMode && (
                  <div className="output-debug">
                    <button
                      className="output-debug-button"
                      onClick={() => toggleDebugInfo(i)}
                      title="Toggle debug info"
                    >
                      {isDebugExpanded ? '▼' : '▶'} debug
                    </button>
                    {isDebugExpanded && (
                      <div className="output-debug-info">
                        <pre>{JSON.stringify({
                          type: item.type,
                          content: item.content,
                          expression: {
                            id: expression.id,
                            lineStart: expression.lineStart,
                            lineEnd: expression.lineEnd,
                            state: expression.state,
                            isInvisible: expression.result?.isInvisible,
                          }
                        }, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
