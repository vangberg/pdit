# Two-Way Widget Interaction Design (Future Enhancement)

## Current State (Phase 1: Read-Only)

The current implementation supports **one-way, read-only** widget rendering:

```
Python → Widget Creation → Serialization → Frontend → Render
```

Widgets render and display data, but user interactions in the widget (button clicks, selections, etc.) **do not** propagate back to Python.

## Motivation for Two-Way Interaction

Many interactive widgets benefit from bidirectional communication:

1. **Data Selection**: User selects rows in ITable → Python receives selected indices
2. **Parameter Tuning**: User adjusts sliders → Python recomputes and updates results
3. **Interactive Plots**: User clicks on chart points → Python filters data based on selection
4. **Form Inputs**: User fills form fields → Python processes input

## Architecture Design

### Challenge: SSE is Unidirectional

The current implementation uses Server-Sent Events (SSE) for streaming execution results from Python to the frontend. SSE only supports **server → client** communication, not the reverse.

**Solution**: Add **WebSocket** connection for bidirectional communication while keeping SSE for execution results.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │ WidgetModel  │◄───────►│WidgetRenderer│                 │
│  │  (JS State)  │         │  (React)     │                 │
│  └──────┬───────┘         └──────────────┘                 │
│         │                                                    │
│         │ model.set()                                       │
│         ▼                                                    │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  WebSocket   │         │  EventSource │                 │
│  │   Client     │         │   (SSE)      │                 │
│  └──────┬───────┘         └──────▲───────┘                 │
└─────────┼──────────────────────────┼──────────────────────┘
          │                          │
          │ Widget Updates           │ Execution Results
          ▼                          │
┌─────────────────────────────────────────────────────────────┐
│                         Backend                              │
│                                                              │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  WebSocket   │         │ SSE Endpoint │                 │
│  │   Handler    │         │ /api/execute │                 │
│  └──────┬───────┘         └──────────────┘                 │
│         │                                                    │
│         │ Update widget attribute                           │
│         ▼                                                    │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │   Widget     │         │  Executor    │                 │
│  │   Manager    │         │  Namespace   │                 │
│  └──────────────┘         └──────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Widget Manager (Backend)

**File**: `rdit/widget_manager.py` (new)

```python
from typing import Dict, Any
import anywidget

class WidgetManager:
    """
    Manages active widget instances and handles state updates from frontend.
    """

    def __init__(self):
        self.widgets: Dict[str, anywidget.AnyWidget] = {}

    def register(self, widget_id: str, widget: anywidget.AnyWidget) -> None:
        """Register a widget instance for two-way communication."""
        self.widgets[widget_id] = widget

    def update(self, widget_id: str, property: str, value: Any) -> None:
        """Update a widget property from frontend."""
        if widget_id not in self.widgets:
            raise ValueError(f"Widget {widget_id} not found")

        widget = self.widgets[widget_id]
        # Set the traitlet - this triggers observers in Python!
        setattr(widget, property, value)

    def unregister(self, widget_id: str) -> None:
        """Remove a widget (cleanup)."""
        self.widgets.pop(widget_id, None)

    def clear(self) -> None:
        """Clear all widgets (e.g., on namespace reset)."""
        self.widgets.clear()
```

#### 2. WebSocket Endpoint (Backend)

**File**: `rdit/server.py` (extend existing)

```python
from fastapi import WebSocket, WebSocketDisconnect
from .widget_manager import WidgetManager

widget_manager = WidgetManager()

@app.websocket("/ws/widgets")
async def widget_websocket(websocket: WebSocket):
    """WebSocket endpoint for two-way widget communication."""
    await websocket.accept()

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()

            if data['type'] == 'widget_update':
                # Client is updating a widget property
                widget_id = data['widget_id']
                property_name = data['property']
                value = data['value']

                try:
                    widget_manager.update(widget_id, property_name, value)

                    # Acknowledge update
                    await websocket.send_json({
                        'type': 'ack',
                        'widget_id': widget_id,
                        'property': property_name
                    })
                except Exception as e:
                    # Send error
                    await websocket.send_json({
                        'type': 'error',
                        'message': str(e)
                    })

    except WebSocketDisconnect:
        print("WebSocket disconnected")
```

#### 3. Widget Registration in Executor

**File**: `rdit/executor.py` (modify existing)

```python
import uuid
from .widget_manager import widget_manager

def _serialize_widget(widget: Any) -> Dict[str, Any]:
    """Serialize an anywidget instance for frontend rendering."""
    if not WIDGET_SUPPORT or not isinstance(widget, anywidget.AnyWidget):
        return {}

    # Generate unique widget ID
    widget_id = str(uuid.uuid4())

    # Register widget for two-way communication
    widget_manager.register(widget_id, widget)

    # ... rest of serialization ...

    return {
        'widget_id': widget_id,  # NEW: Include widget ID
        'esm': esm,
        'css': css,
        'model': model
    }
```

#### 4. WidgetModel Class (Frontend)

**File**: `web/src/WidgetModel.ts` (new)

```typescript
export class WidgetModel {
  private widgetId: string;
  private state: Record<string, unknown>;
  private listeners: Map<string, Set<(value: unknown) => void>>;
  private ws: WebSocket;

  constructor(widgetId: string, initialState: Record<string, unknown>, ws: WebSocket) {
    this.widgetId = widgetId;
    this.state = { ...initialState };
    this.listeners = new Map();
    this.ws = ws;
  }

  get(key: string): unknown {
    return this.state[key];
  }

  set(key: string, value: unknown): void {
    // Update local state
    const oldValue = this.state[key];
    this.state[key] = value;

    // Send update to Python via WebSocket
    this.ws.send(JSON.stringify({
      type: 'widget_update',
      widget_id: this.widgetId,
      property: key,
      value: value
    }));

    // Trigger local listeners (for immediate UI feedback)
    if (oldValue !== value) {
      this.triggerListeners(`change:${key}`, value);
    }
  }

  on(event: string, callback: (value: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (value: unknown) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private triggerListeners(event: string, value: unknown): void {
    this.listeners.get(event)?.forEach(fn => fn(value));
  }

  // Handle updates from Python (via WebSocket)
  handleRemoteUpdate(property: string, value: unknown): void {
    const oldValue = this.state[property];
    this.state[property] = value;

    if (oldValue !== value) {
      this.triggerListeners(`change:${property}`, value);
    }
  }

  save_changes(): void {
    // Called by some widgets - we send updates immediately in set()
  }
}
```

#### 5. Updated WidgetRenderer (Frontend)

**File**: `web/src/WidgetRenderer.tsx` (modify existing)

```typescript
import { WidgetModel } from './WidgetModel';

// Assume WebSocket is created at app level and passed down
interface WidgetRendererProps {
  widgetData: WidgetData & { widget_id: string };
  websocket: WebSocket;
}

export function WidgetRenderer({ widgetData, websocket }: WidgetRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<WidgetModel | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = '';

    const blob = new Blob([widgetData.esm], { type: 'application/javascript' });
    const moduleUrl = URL.createObjectURL(blob);

    const loadWidget = async () => {
      try {
        const module = await import(moduleUrl);
        const widgetDef = module.default;

        // Create interactive model with WebSocket
        const model = new WidgetModel(
          widgetData.widget_id,
          widgetData.model,
          websocket
        );
        modelRef.current = model;

        // Render widget with interactive model
        widgetDef.render({ model, el: container });

        // Cleanup
        return () => {
          if (widgetDef.destroy) {
            widgetDef.destroy({ model, el: container });
          }
        };
      } catch (error) {
        console.error('Error loading widget:', error);
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    };

    loadWidget();
  }, [widgetData, websocket]);

  return (
    <div className="widget-container">
      {widgetData.css && <style>{widgetData.css}</style>}
      <div ref={containerRef} />
    </div>
  );
}
```

### Message Protocol

#### Client → Server (Widget Updates)

```json
{
  "type": "widget_update",
  "widget_id": "uuid-here",
  "property": "selected_rows",
  "value": [0, 2, 5]
}
```

#### Server → Client (Acknowledgment)

```json
{
  "type": "ack",
  "widget_id": "uuid-here",
  "property": "selected_rows"
}
```

#### Server → Client (Errors)

```json
{
  "type": "error",
  "message": "Widget uuid-here not found"
}
```

### Python-Side Observers

Widgets can use traitlets observers to react to changes from frontend:

```python
from itables.widget import ITable
import traitlets

class MyTable(ITable):
    selected_rows = traitlets.List(traitlets.Int()).tag(sync=True)

    @traitlets.observe('selected_rows')
    def _on_selection_change(self, change):
        print(f"Selected rows: {change['new']}")
        # React to user selection!

# Usage
table = MyTable(df)
table  # Display widget

# Later, when user selects rows in frontend:
# → WebSocket message → widget_manager.update() → setattr(table, 'selected_rows', [0, 2, 5])
# → Triggers _on_selection_change observer
# → Python code can react!
```

## Implementation Phases

### Phase 1: Read-Only (✅ DONE)

- Widget serialization and rendering
- One-way data flow: Python → Frontend
- ITable display without selection

### Phase 2: WebSocket Infrastructure

1. Add WebSocket endpoint to FastAPI server
2. Create WidgetManager class
3. Add WebSocket client to frontend
4. Implement message protocol

### Phase 3: Widget Registration & Cleanup

1. Generate widget IDs during serialization
2. Register widgets in manager
3. Handle cleanup (namespace reset, widget removal)

### Phase 4: Interactive Model

1. Implement WidgetModel class
2. Update WidgetRenderer to use WidgetModel
3. Test with simple counter widget

### Phase 5: Production Features

1. Handle WebSocket reconnection
2. Add message queue for offline buffering
3. Implement widget lifecycle management
4. Add security/validation for widget updates

## Example: Interactive Counter Widget

```python
import anywidget
import traitlets

class Counter(anywidget.AnyWidget):
    _esm = """
    export default {
      render({ model, el }) {
        let btn = document.createElement('button');

        function updateButton() {
          btn.textContent = `Count: ${model.get('value')}`;
        }

        btn.onclick = () => {
          let count = model.get('value');
          model.set('value', count + 1);  // Sends to Python!
          model.save_changes();
        };

        model.on('change:value', updateButton);  // Listen to Python updates
        el.appendChild(btn);
        updateButton();
      }
    }
    """

    value = traitlets.Int(0).tag(sync=True)

    @traitlets.observe('value')
    def _on_value_change(self, change):
        print(f"Python saw value change: {change['old']} → {change['new']}")

Counter(value=0)
```

**With two-way communication**:
- User clicks button → `model.set('value', 1)` → WebSocket → Python `setattr(widget, 'value', 1)` → Observer prints "Python saw value change: 0 → 1"

**Without two-way (current state)**:
- User clicks button → `model.set('value', 1)` → Console log (no-op) → Python never knows

## Trade-offs & Considerations

### Complexity
- Two-way communication adds significant complexity
- Need to manage WebSocket lifecycle, reconnection, etc.
- Widget cleanup becomes more important

### Use Cases
- Many use cases (like ITable data display) work perfectly fine in read-only mode
- Interactive parameter tuning and data selection benefit most from two-way
- Consider opt-in: only widgets that need two-way register for it

### Alternative: Polling
Instead of WebSocket, could poll widget state periodically:
```python
# Check widget state every second
while True:
    selected = table.selected_rows
    if selected:
        print(f"Selected: {selected}")
    time.sleep(1)
```

But this is inefficient and doesn't scale.

## Recommendation

**For MVP**: Stick with read-only (Phase 1) ✅
- Covers 80% of use cases (data display, visualization)
- Significantly simpler
- Can add two-way later without breaking changes

**For Future**: Implement two-way when needed
- Wait for specific use case that requires it
- Start with Phase 2 (WebSocket infrastructure)
- Implement incrementally

The current read-only implementation is a solid foundation that can be extended when the need arises!
