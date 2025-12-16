# AnyWidget Integration with pdit + xeus-python

## Overview

This plan describes how to implement [AnyWidget](https://anywidget.dev/) support in pdit. AnyWidget is a Python library for building custom Jupyter widgets using modern JavaScript/TypeScript. It follows the Jupyter widget protocol and can be used to create interactive visualizations.

## Background

### How AnyWidget Works

AnyWidget extends `ipywidgets.DOMWidget` and provides a simplified API for creating custom widgets:

```python
import anywidget
import traitlets

class CounterWidget(anywidget.AnyWidget):
    _esm = """
        export function render({ model, el }) {
            let count = model.get('count');
            const button = document.createElement('button');
            button.innerHTML = 'count: ' + count;
            button.addEventListener('click', () => {
                model.set('count', count + 1);
                model.save_changes();
            });
            el.appendChild(button);
        }
    """
    count = traitlets.Int(0).tag(sync=True)
```

When displayed in Jupyter, widgets use the **Jupyter Widget Protocol**:

1. **Comm channels**: Bidirectional communication between kernel and frontend
2. **Model/View architecture**: Widget state is synced between Python (model) and JavaScript (view)
3. **MIME type**: `application/vnd.jupyter.widget-view+json` indicates a widget output

### Message Flow in xeus-python

When executing widget code, the kernel sends these messages:

```
1. status: { execution_state: 'busy' }
2. comm_open: Create layout model (jupyter.widget target)
   - Contains LayoutModel state
3. comm_open: Create widget model (jupyter.widget target)
   - Contains widget state including:
     - _esm: JavaScript code
     - _anywidget_id: Widget class identifier
     - All synced traitlets
4. execute_result:
   - data['application/vnd.jupyter.widget-view+json'] = { model_id: '...', version_major: 2, version_minor: 1 }
5. status: { execution_state: 'idle' }
```

## Current pdit Architecture

### Backend (Python)

- **`xeus_executor.py`**: Uses jupyter_client to communicate with xeus-python kernel
- **`server.py`**: FastAPI server that exposes execution API
- **Message handling**: Currently handles `stream`, `execute_result`, `display_data`, `error`

### Frontend (TypeScript/React)

- **`execution-backend-python.ts`**: Fetches execution results via SSE
- **`Output.tsx`**: Renders different MIME types (text, markdown, HTML, images, DataFrames)

## Implementation Plan

### Phase 1: Backend - Capture Widget Messages

#### 1.1 Modify `_execute_code` in `xeus_executor.py`

Add handling for `comm_open` messages:

```python
def _execute_code(self, code: str, suppress_output: bool = False) -> List[OutputItem]:
    """Execute code in kernel and collect output."""
    output: List[OutputItem] = []
    comm_messages = []  # Collect comm messages
    
    msg_id = self.kc.execute(code)
    
    while True:
        msg = self.kc.get_iopub_msg(timeout=30)
        
        if msg['parent_header'].get('msg_id') != msg_id:
            continue
        
        msg_type = msg['msg_type']
        content = msg['content']
        
        if msg_type == 'status' and content['execution_state'] == 'idle':
            break
        elif msg_type == 'comm_open':
            # Store comm_open for widget rendering
            comm_messages.append({
                'type': 'comm_open',
                'comm_id': content['comm_id'],
                'target_name': content.get('target_name'),
                'data': content['data']
            })
        elif msg_type == 'execute_result':
            data = content['data']
            # Check for widget MIME type
            if 'application/vnd.jupyter.widget-view+json' in data:
                widget_data = data['application/vnd.jupyter.widget-view+json']
                # Bundle comm messages with widget output
                output.append(OutputItem(
                    type='application/vnd.jupyter.widget-view+json',
                    content=json.dumps({
                        'widget': widget_data,
                        'comm_messages': comm_messages
                    })
                ))
            else:
                output.extend(self._process_mime_data(data))
        # ... other message types
    
    return output
```

#### 1.2 Alternative: Session-level Comm State

For widgets that update after creation, we need a comm registry:

```python
class XeusPythonExecutor:
    def __init__(self):
        self.comm_registry: Dict[str, Dict] = {}  # comm_id -> state
        
    def _handle_comm_message(self, msg):
        """Handle comm_open, comm_msg, comm_close."""
        msg_type = msg['msg_type']
        content = msg['content']
        
        if msg_type == 'comm_open':
            self.comm_registry[content['comm_id']] = content['data']['state']
        elif msg_type == 'comm_msg':
            # Update state
            if 'state' in content['data']:
                self.comm_registry[content['comm_id']].update(content['data']['state'])
```

### Phase 2: Frontend - Widget Rendering

#### 2.1 Add Widget MIME Type Handler in `Output.tsx`

```tsx
// New component for widget rendering
const WidgetOutput: React.FC<{ data: string }> = ({ data }) => {
    const parsedData = JSON.parse(data);
    const { widget, comm_messages } = parsedData;
    const containerRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if (!containerRef.current) return;
        
        // Find the widget's comm_open message
        const widgetComm = comm_messages.find(
            (msg) => msg.comm_id === widget.model_id
        );
        
        if (!widgetComm) return;
        
        // Get the ESM code (for anywidget)
        const esm = widgetComm.data.state._esm;
        if (!esm) return;
        
        // Create a simple model for the widget
        const model = {
            get: (key: string) => widgetComm.data.state[key],
            set: (key: string, value: any) => {
                // In a full implementation, this would send comm_msg to kernel
                console.log('Widget set:', key, value);
            },
            save_changes: () => {
                console.log('Widget save_changes');
            }
        };
        
        // Execute the ESM code
        const blob = new Blob([esm], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        
        import(url).then((module) => {
            if (module.render) {
                module.render({ model, el: containerRef.current });
            }
        });
        
        return () => URL.revokeObjectURL(url);
    }, [data]);
    
    return <div ref={containerRef} className="widget-output" />;
};
```

#### 2.2 Update Output Component

```tsx
// In Output.tsx, add case for widget MIME type
{item.type === 'application/vnd.jupyter.widget-view+json' ? (
    <WidgetOutput data={item.content} />
) : /* ... other types */}
```

### Phase 3: Bidirectional Communication (Full Widget Support)

For full widget interactivity, we need:

#### 3.1 WebSocket or SSE for Comm Messages

Add a new endpoint to stream comm messages:

```python
@app.websocket("/api/comm/{session_id}")
async def comm_websocket(websocket: WebSocket, session_id: str):
    """WebSocket for bidirectional widget communication."""
    executor = get_or_create_session(session_id)
    await websocket.accept()
    
    try:
        while True:
            # Receive messages from frontend
            data = await websocket.receive_json()
            
            if data['type'] == 'comm_msg':
                # Forward to kernel
                executor.kc.send_shell_message('comm_msg', {
                    'comm_id': data['comm_id'],
                    'data': data['data']
                })
            
            # Also need background task to forward kernel -> frontend
    except WebSocketDisconnect:
        pass
```

#### 3.2 Frontend Comm Manager

```typescript
class CommManager {
    private ws: WebSocket;
    private models: Map<string, WidgetModel> = new Map();
    
    constructor(sessionId: string) {
        this.ws = new WebSocket(`/api/comm/${sessionId}`);
        this.ws.onmessage = (event) => this.handleMessage(event);
    }
    
    registerModel(modelId: string, state: any) {
        this.models.set(modelId, new WidgetModel(modelId, state, this));
    }
    
    send(commId: string, data: any) {
        this.ws.send(JSON.stringify({
            type: 'comm_msg',
            comm_id: commId,
            data: data
        }));
    }
}
```

## Implementation Priority

### MVP (Read-Only Widgets)

1. ✅ **Backend**: Capture `comm_open` and widget MIME type
2. ✅ **Frontend**: Render static widget views using ESM code

This allows widgets to be displayed but not interactive.

### Full Support (Interactive Widgets)

3. ⬜ **Backend**: WebSocket endpoint for comm messages
4. ⬜ **Frontend**: CommManager for bidirectional communication
5. ⬜ **Frontend**: Proper model/view binding with state updates

## Alternative Approaches

### Option A: Use @anywidget/core

AnyWidget provides `@anywidget/core` package for frontend widget rendering:

```bash
npm install @anywidget/core
```

This handles ESM loading, model binding, and more.

### Option B: Embed JupyterLab Widget Manager

Use `@jupyter-widgets/html-manager` for full Jupyter widget compatibility:

```bash
npm install @jupyter-widgets/html-manager
```

This provides complete widget protocol support but is more complex.

### Option C: iframe Isolation

Render widgets in sandboxed iframes with a custom widget runtime:

```tsx
<iframe
    srcDoc={generateWidgetHtml(esm, state)}
    sandbox="allow-scripts"
/>
```

## Security Considerations

1. **ESM Code Execution**: Widget ESM code is user-provided and runs in the browser
2. **Sandboxing**: Consider using iframes with `sandbox` attribute
3. **CSP Headers**: May need to allow `blob:` URLs for dynamic ESM

## Testing

1. **Unit Tests**: Test comm message parsing in xeus_executor
2. **Integration Tests**: Test widget rendering in browser
3. **Example Widgets**: Create sample widgets for testing

## References

- [AnyWidget Documentation](https://anywidget.dev/)
- [Jupyter Widget Protocol](https://jupyter-widgets.readthedocs.io/)
- [ipywidgets Source](https://github.com/jupyter-widgets/ipywidgets)
- [xeus-python](https://github.com/jupyter-xeus/xeus-python)
