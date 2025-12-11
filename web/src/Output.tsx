import React, { useImperativeHandle, useRef } from "react";
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

// Get a fun type label for output items
const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'result': return 'out';
    case 'stdout': return '>>>';
    case 'stderr': return 'err';
    case 'error': return '!!!';
    case 'dataframe': return 'df';
    case 'image': return 'fig';
    case 'markdown': return 'md';
    case 'html': return 'htm';
    default: return '~~~';
  }
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
            <span className={`output-type-badge output-type-${item.type}`}>
              {getTypeLabel(item.type)}
            </span>
            <div className="output-content-wrapper">
              {item.type === 'markdown' ? (
                <Markdown>{item.content}</Markdown>
              ) : item.type === 'dataframe' ? (
                <DataframeTable jsonData={item.content} />
              ) : item.type === 'image' ? (
                <ImageOutput dataUrl={item.content} />
              ) : item.type === 'html' ? (
                <HtmlOutput html={item.content} />
              ) : (
                <pre>{item.content}</pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
