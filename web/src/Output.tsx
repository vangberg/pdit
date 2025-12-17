import React, { useImperativeHandle, useRef, useEffect, useState } from "react";
import Markdown from "react-markdown";
import { Expression } from "./execution";
import { DataframeTable } from "./DataframeTable";
import { getCommManager } from "./comm-manager";

interface OutputProps {
  expression: Expression;
  index: number;
  ref?: (element: HTMLDivElement | null) => void;
  allInvisible?: boolean;
  sessionId?: string;
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
// Uses ESM code from widget state to render in an iframe with bidirectional comm
const WidgetOutput: React.FC<{ data: string; sessionId?: string }> = ({ data, sessionId }) => {
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

      const modelId = widget.model_id;

      // Create HTML document for iframe with bidirectional communication via postMessage
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
    const modelId = ${JSON.stringify(modelId)};
    
    // Model implementation with bidirectional communication
    const model = {
      _state: { ...initialState },
      _callbacks: new Map(),
      _pendingChanges: {},
      
      get(key) {
        return this._state[key];
      },
      
      set(key, value) {
        const oldValue = this._state[key];
        if (oldValue !== value) {
          this._state[key] = value;
          this._pendingChanges[key] = value;
          // Trigger local callbacks
          this._triggerCallbacks('change:' + key);
        }
      },
      
      save_changes() {
        // Send state update to parent window (which forwards to kernel)
        // Use window.location.origin for security (same-origin only)
        if (Object.keys(this._pendingChanges).length > 0) {
          window.parent.postMessage({
            type: 'widget_state_update',
            modelId: modelId,
            state: this._pendingChanges
          }, window.location.origin);
          this._pendingChanges = {};
        }
      },
      
      on(event, callback) {
        const callbacks = this._callbacks.get(event) || [];
        callbacks.push(callback);
        this._callbacks.set(event, callbacks);
      },
      
      off(event, callback) {
        if (!callback) {
          this._callbacks.delete(event);
        } else {
          const callbacks = this._callbacks.get(event) || [];
          const index = callbacks.indexOf(callback);
          if (index >= 0) callbacks.splice(index, 1);
        }
      },
      
      _triggerCallbacks(event) {
        const callbacks = this._callbacks.get(event) || [];
        for (const cb of callbacks) {
          try { cb(); } catch (err) { console.error('Callback error:', err); }
        }
      },
      
      _updateFromParent(state) {
        for (const [key, value] of Object.entries(state)) {
          if (this._state[key] !== value) {
            this._state[key] = value;
            this._triggerCallbacks('change:' + key);
          }
        }
      }
    };
    
    // Listen for state updates from parent
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'widget_state_from_kernel' && event.data?.modelId === modelId) {
        model._updateFromParent(event.data.state);
      }
    });
    
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

      // Set up message handler to forward widget state updates to CommManager
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'widget_state_update' && event.data?.modelId === modelId) {
          // Forward to kernel via CommManager
          if (sessionId) {
            const commManager = getCommManager(sessionId);
            commManager.sendCommMsg(modelId, {
              method: 'update',
              state: event.data.state
            });
          }
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    } catch (e) {
      setError(`Failed to parse widget data: ${e}`);
    }
  }, [data, sessionId]);

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

export const Output: React.FC<OutputProps> = ({ expression, ref, allInvisible, sessionId }) => {
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
                <WidgetOutput data={item.content} sessionId={sessionId} />
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
