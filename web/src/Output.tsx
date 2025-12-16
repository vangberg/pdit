import React, { useImperativeHandle, useRef, useEffect, useState } from "react";
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

// Interface for comm message data
interface CommMessage {
  type: string;
  comm_id: string;
  target_name: string;
  data: {
    state: Record<string, unknown>;
    buffer_paths?: string[];
  };
}

// Interface for widget data
interface WidgetData {
  widget: {
    model_id: string;
    version_major: number;
    version_minor: number;
  };
  comm_messages: CommMessage[];
}

// Component for rendering AnyWidget widgets
// Uses ESM code from widget state to render in an iframe
const WidgetOutput: React.FC<{ data: string }> = ({ data }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const parsed: WidgetData = JSON.parse(data);
      const { widget, comm_messages } = parsed;

      // Find the widget's comm_open message
      const widgetComm = comm_messages.find(
        (msg) => msg.comm_id === widget.model_id
      );

      if (!widgetComm) {
        setError('Widget comm message not found');
        return;
      }

      const state = widgetComm.data.state;

      // Get the ESM code (for anywidget)
      const esm = state._esm as string | undefined;
      if (!esm) {
        setError('Widget ESM code not found');
        return;
      }

      // Create HTML document for iframe
      const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 8px;
      font-family: system-ui, -apple-system, sans-serif;
    }
  </style>
</head>
<body>
  <div id="widget-container"></div>
  <script type="module">
    // Widget state from Python
    const initialState = ${JSON.stringify(state)};
    
    // Simple model implementation (read-only for now)
    const model = {
      _state: { ...initialState },
      _callbacks: {},
      get(key) {
        return this._state[key];
      },
      set(key, value) {
        this._state[key] = value;
        // Trigger callbacks
        const cb = this._callbacks['change:' + key];
        if (cb) cb();
      },
      save_changes() {
        // In full implementation, this would send to kernel
        console.log('[Widget] save_changes called - bidirectional comm not implemented');
      },
      on(event, callback) {
        this._callbacks[event] = callback;
      }
    };
    
    // Load and execute the ESM code
    const esm = ${JSON.stringify(esm)};
    const blob = new Blob([esm], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    
    try {
      const module = await import(url);
      if (module.render) {
        const el = document.getElementById('widget-container');
        module.render({ model, el });
      } else if (module.default?.render) {
        const el = document.getElementById('widget-container');
        module.default.render({ model, el });
      }
    } catch (err) {
      document.getElementById('widget-container').innerHTML = 
        '<pre style="color: red;">Widget error: ' + err.message + '</pre>';
    } finally {
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>
      `.trim();

      const iframe = iframeRef.current;
      if (iframe) {
        iframe.srcdoc = html;
      }
    } catch (e) {
      setError(`Failed to parse widget data: ${e}`);
    }
  }, [data]);

  // Auto-resize iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const resizeIframe = () => {
      if (iframe.contentDocument?.body) {
        const height = Math.max(
          iframe.contentDocument.body.scrollHeight,
          50 // Minimum height
        );
        iframe.style.height = `${height}px`;
      }
    };

    iframe.addEventListener('load', resizeIframe);
    // Use a longer interval (500ms) to reduce CPU usage while still catching dynamic content changes
    const interval = setInterval(resizeIframe, 500);

    return () => {
      iframe.removeEventListener('load', resizeIframe);
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return <pre className="widget-error">{error}</pre>;
  }

  return (
    <iframe
      ref={iframeRef}
      className="output-widget-iframe"
      sandbox="allow-scripts allow-same-origin"
      title="Widget output"
    />
  );
};

// Sanitize type for CSS class names (replace slashes and plus signs with dashes)
const sanitizeTypeForCss = (type: string): string => type.replace(/[/+]/g, '-');

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
    case 'application/vnd.jupyter.widget-view+json': return 'wgt';
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
              ) : item.type === 'application/vnd.jupyter.widget-view+json' ? (
                <WidgetOutput data={item.content} />
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
