import React, { useImperativeHandle, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Expression } from "./execution";
import { DataframeTable } from "./DataframeTable";

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
// Uses iframe with srcdoc for DOM isolation and security
const HtmlOutput: React.FC<{ html: string }> = ({ html }) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Auto-resize iframe to fit content
  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const resizeIframe = () => {
      if (iframe.contentDocument?.body) {
        // Get the content height
        const height = iframe.contentDocument.body.scrollHeight;
        iframe.style.height = `${height}px`;
      }
    };

    // Resize when iframe loads
    iframe.addEventListener('load', resizeIframe);

    // Also try to resize immediately in case content is already loaded
    resizeIframe();

    return () => iframe.removeEventListener('load', resizeIframe);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      className="output-html-iframe"
      sandbox="allow-scripts allow-same-origin"
      title="HTML output"
    />
  );
};

// Sanitize type for CSS class names (replace slashes with dashes)
const sanitizeTypeForCss = (type: string): string => type.replace(/\//g, '-');

// Get a fun type label for output items
const getTypeLabel = (type: string): string => {
  switch (type) {
    // Stream types
    case 'stdout': return '>>>';
    case 'stderr': return 'err';
    case 'error': return '!!!';
    // MIME types
    case 'text/plain': return 'out';
    case 'text/markdown': return 'md';
    case 'text/html': return 'htm';
    case 'application/json': return 'df';
    case 'image/png': return 'fig';
    case 'image/jpeg': return 'fig';
    case 'image/svg+xml': return 'svg';
    default: return '~~~';
  }
};

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
              <span className={`output-type-badge output-type-${sanitizeTypeForCss(item.type)}`}>
                {getTypeLabel(item.type)}
              </span>
              <div className="output-content-wrapper">
                {item.type === 'text/markdown' ? (
                  <Markdown>{item.content}</Markdown>
                ) : item.type === 'application/json' ? (
                  <DataframeTable jsonData={item.content} />
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
