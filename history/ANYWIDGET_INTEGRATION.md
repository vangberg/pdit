# Anywidget Integration Plan for Rdit

## Overview

This document outlines the integration of [Anywidget](https://anywidget.dev) into Rdit, enabling interactive widgets like [ITable](https://mwouts.github.io/itables/) to render dataframes interactively.

## What is Anywidget?

Anywidget is a specification and toolkit for creating reusable web-based widgets for interactive computing environments. Key features:

- **ES Module Based**: Uses browser's native import mechanism to load widget code
- **Lightweight**: No bundling or complex build steps required
- **Jupyter Compatible**: Works with Jupyter's widget protocol but with a simpler API
- **Self-Contained**: Widget code (JavaScript/CSS) is embedded in Python objects

### How Anywidget Works

1. **Python Side**: Widget class inherits from `anywidget.AnyWidget`
   - Defines `_esm` (JavaScript ES module code) and `_css` (styles)
   - Maintains model state via traitlets (observable properties)

2. **JavaScript Side**: ESM module exports lifecycle hooks
   ```javascript
   export default {
     render({ model, el }) {
       // Initialize widget, render into el
       // model.get('prop') - read property
       // model.set('prop', value) - write property
       // model.on('change:prop', callback) - watch changes
     }
   }
   ```

3. **Communication**: Model changes sync between Python and JavaScript
   - Python → JS: `model.set()` triggers `change:prop` events
   - JS → Python: `model.set()` sends updates back

## ITable Widget

ITable is an anywidget-based widget for rendering Pandas/Polars DataFrames as interactive DataTables:

```python
from itables.widget import ITable
import pandas as pd

df = pd.DataFrame({'A': [1, 2, 3], 'B': [4, 5, 6]})
ITable(df)  # Returns anywidget instance
```

The widget uses DataTables.js for sorting, filtering, pagination.

## Rdit Architecture Review

### Current Output Flow

```
Python Execution (executor.py)
  ↓
Capture stdout/stderr via io.StringIO
  ↓
OutputItem(type='stdout'|'stderr'|'error', text=str)
  ↓
ExecutionResult with List[OutputItem]
  ↓
SSE stream as JSON
  ↓
Frontend receives via EventSource
  ↓
Output.tsx renders <pre> tags
```

### Limitations

- Only text-based output
- No HTML rendering
- No JavaScript execution
- No interactive elements

## Integration Design

### Phase 1: Read-Only Widget Rendering (MVP)

#### Backend Changes

1. **Install Dependencies**
   ```bash
   pip install anywidget itables[widget]
   ```

2. **Extend OutputItem** (`rdit/executor.py`)
   ```python
   @dataclass
   class OutputItem:
       type: str  # Add 'widget' type
       text: str
       widget_data: Optional[Dict[str, Any]] = None
   ```

3. **Widget Capture Mechanism** (`rdit/executor.py`)

   Hook into IPython's display mechanism (which anywidget uses):

   ```python
   from IPython.core.displayhook import DisplayHook
   from IPython.core.interactiveshell import InteractiveShell

   # Install display hook to capture widgets
   # When widget is displayed, capture:
   #   - ESM code (_esm attribute)
   #   - CSS code (_css attribute)
   #   - Model state (serialized traitlets)
   ```

   Alternative (simpler): Check if result is an anywidget instance:
   ```python
   import anywidget

   def execute_statement(...):
       result = eval(compiled, self.namespace)

       if isinstance(result, anywidget.AnyWidget):
           # Serialize widget
           widget_data = {
               'esm': result._esm,
               'css': result._css,
               'model': {k: getattr(result, k) for k in result.trait_names()}
           }
           output.append(OutputItem(
               type='widget',
               text='',
               widget_data=widget_data
           ))
   ```

4. **JSON Serialization**

   Handle DataFrame serialization (ITable stores dataframes):
   ```python
   import json
   import pandas as pd

   def serialize_model(model_dict):
       for key, value in model_dict.items():
           if isinstance(value, pd.DataFrame):
               model_dict[key] = value.to_dict('split')  # Or to_json()
       return model_dict
   ```

#### Frontend Changes

1. **Update TypeScript Types** (`web/src/execution-backend-python.ts`)
   ```typescript
   interface OutputItem {
     type: 'stdout' | 'stderr' | 'error' | 'widget';
     text: string;
     widgetData?: WidgetData;
   }

   interface WidgetData {
     esm: string;
     css?: string;
     model: Record<string, unknown>;
   }
   ```

2. **Create WidgetRenderer Component** (`web/src/WidgetRenderer.tsx`)
   ```tsx
   import { useEffect, useRef } from 'react';

   interface WidgetRendererProps {
     widgetData: WidgetData;
   }

   export function WidgetRenderer({ widgetData }: WidgetRendererProps) {
     const containerRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
       if (!containerRef.current) return;

       // Load ESM module as blob URL
       const blob = new Blob([widgetData.esm], { type: 'application/javascript' });
       const url = URL.createObjectURL(blob);

       // Dynamic import
       import(url).then(module => {
         const { default: widgetDef } = module;

         // Create mock model object (read-only for MVP)
         const model = {
           get: (key: string) => widgetData.model[key],
           set: () => {}, // No-op for read-only
           on: () => {}, // No-op for read-only
         };

         // Render widget
         widgetDef.render({
           model,
           el: containerRef.current
         });
       }).finally(() => {
         URL.revokeObjectURL(url);
       });
     }, [widgetData]);

     return (
       <div ref={containerRef}>
         {widgetData.css && <style>{widgetData.css}</style>}
       </div>
     );
   }
   ```

3. **Update Output.tsx**
   ```tsx
   import { WidgetRenderer } from './WidgetRenderer';

   // In render:
   {item.type === 'widget' && item.widgetData && (
     <WidgetRenderer widgetData={item.widgetData} />
   )}
   ```

### Phase 2: Two-Way Interaction (Future)

For two-way communication (user interactions → Python):

#### Design Approach

1. **WebSocket Connection** (replace/augment SSE)
   - SSE is unidirectional (server → client)
   - Need WebSocket for bidirectional communication
   - Keep SSE for execution results, add WS for widget updates

2. **Message Protocol**
   ```typescript
   // Client → Server
   interface WidgetUpdateMessage {
     type: 'widget_update';
     widget_id: string;
     property: string;
     value: unknown;
   }

   // Server → Client (via SSE)
   interface WidgetStateMessage {
     type: 'widget_state';
     widget_id: string;
     updates: Record<string, unknown>;
   }
   ```

3. **Backend Widget Manager** (`rdit/widget_manager.py`)
   ```python
   class WidgetManager:
       def __init__(self):
           self.widgets = {}  # widget_id → widget instance

       def register(self, widget_id: str, widget: AnyWidget):
           self.widgets[widget_id] = widget

       def update(self, widget_id: str, property: str, value: Any):
           widget = self.widgets[widget_id]
           setattr(widget, property, value)
           # Widget traitlets will trigger observers in Python
   ```

4. **Frontend Model Implementation**
   ```typescript
   class WidgetModel {
     private state: Record<string, unknown>;
     private listeners: Map<string, Set<Function>>;

     get(key: string) {
       return this.state[key];
     }

     set(key: string, value: unknown) {
       this.state[key] = value;
       // Send to server via WebSocket
       ws.send(JSON.stringify({
         type: 'widget_update',
         widget_id: this.id,
         property: key,
         value
       }));
       // Trigger local listeners
       this.listeners.get(`change:${key}`)?.forEach(fn => fn());
     }

     on(event: string, callback: Function) {
       // 'change:propname' events
       if (!this.listeners.has(event)) {
         this.listeners.set(event, new Set());
       }
       this.listeners.get(event)!.add(callback);
     }
   }
   ```

5. **State Sync**
   - Client-initiated changes: Model.set() → WS → Python widget → Python observers
   - Server-initiated changes: Python setattr() → WS → Client model update → JS listeners

## Testing Plan

### Test 1: Simple ITable

```python
import pandas as pd
from itables.widget import ITable

df = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie'],
    'Age': [25, 30, 35],
    'City': ['NYC', 'LA', 'SF']
})

ITable(df)
```

Expected: Interactive DataTable with sorting/filtering

### Test 2: Large DataFrame

```python
import numpy as np
import pandas as pd
from itables.widget import ITable

df = pd.DataFrame({
    'A': np.random.randn(1000),
    'B': np.random.randn(1000),
    'C': np.random.choice(['X', 'Y', 'Z'], 1000)
})

ITable(df)
```

Expected: Paginated table with search/filter

### Test 3: Custom Anywidget (Simple Counter)

```python
import anywidget
import traitlets

class Counter(anywidget.AnyWidget):
    _esm = """
    export default {
      render({ model, el }) {
        let count = model.get('value');
        el.innerHTML = `<div>
          <button id="dec">-</button>
          <span>${count}</span>
          <button id="inc">+</button>
        </div>`;

        el.querySelector('#inc').onclick = () => {
          count++;
          el.querySelector('span').textContent = count;
          model.set('value', count);  // For two-way: sends to Python
        };

        el.querySelector('#dec').onclick = () => {
          count--;
          el.querySelector('span').textContent = count;
          model.set('value', count);
        };
      }
    }
    """
    value = traitlets.Int(0).tag(sync=True)

Counter(value=5)
```

Expected (Phase 1): Renders counter, buttons work locally (no Python sync)
Expected (Phase 2): Button clicks update Python `value` attribute

## Implementation Priorities

1. ✅ **Phase 1.1**: Backend widget detection and serialization
2. ✅ **Phase 1.2**: Frontend widget rendering (read-only)
3. ✅ **Phase 1.3**: ITable integration test
4. 🔜 **Phase 2**: Two-way communication (WebSocket + state sync)

## Open Questions

1. **DataFrame Serialization**: ITable may have large dataframes - how to optimize?
   - Option 1: Full serialization (simple, may be slow)
   - Option 2: Pagination API (complex, efficient)
   - Option 3: Let ITable handle it (check if it has built-in optimization)

2. **Widget Lifecycle**: When do widgets get destroyed?
   - On namespace reset?
   - When execution results are cleared?
   - Need cleanup to avoid memory leaks

3. **Security**: Executing arbitrary JavaScript from Python
   - Trust model: same as executing arbitrary Python
   - Sandboxing: not needed for local development tool
   - Future: add CSP headers if deployed remotely

## Next Steps

Start with Phase 1.1 - get basic widget rendering working with ITable.

## Sources

- [Anywidget Documentation](https://anywidget.dev/en/getting-started/)
- [Anywidget AFM Specification](https://anywidget.dev/en/afm/)
- [ITable Widget Documentation](https://mwouts.github.io/itables/widget.html)
- [ITable PyPI](https://pypi.org/project/itables/)
- [Anywidget GitHub](https://github.com/manzt/anywidget)
- [Anywidget Paper (JOSS 2024)](https://www.theoj.org/joss-papers/joss.06939/10.21105.joss.06939.pdf)
