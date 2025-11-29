/**
 * Anywidget renderer component.
 * Loads and executes widget ESM code in a sandboxed manner.
 */

import React, { useEffect, useRef } from 'react';
import type { WidgetData } from './execution-backend-python';

interface WidgetRendererProps {
  widgetData: WidgetData;
}

export function WidgetRenderer({ widgetData }: WidgetRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Clear any previous content
    container.innerHTML = '';

    // Create a blob URL for the ESM module
    const blob = new Blob([widgetData.esm], { type: 'application/javascript' });
    const moduleUrl = URL.createObjectURL(blob);

    // Load and execute the widget
    const loadWidget = async () => {
      try {
        // Dynamically import the ESM module
        const module = await import(/* @vite-ignore */ moduleUrl);
        const widgetDef = module.default;

        if (!widgetDef || typeof widgetDef.render !== 'function') {
          console.error('Widget module must export a default object with a render function');
          return;
        }

        // Create a mock model object (read-only for now)
        const model = {
          get: (key: string) => widgetData.model[key],
          set: (_key: string, _value: unknown) => {
            // TODO: Implement two-way communication via WebSocket
            console.log('Widget model.set() called - two-way communication not yet implemented');
          },
          on: (_event: string, _callback: () => void) => {
            // TODO: Implement model change listeners
            console.log('Widget model.on() called - change listeners not yet implemented');
          },
          save_changes: () => {
            // No-op for read-only mode
          },
        };

        // Call the widget's render function
        widgetDef.render({ model, el: container });

        // Store cleanup function if provided
        if (typeof widgetDef.destroy === 'function') {
          cleanupRef.current = () => widgetDef.destroy({ model, el: container });
        }
      } catch (error) {
        console.error('Error loading widget:', error);
        container.innerHTML = `<div style="color: red; padding: 8px;">
          Error loading widget: ${error instanceof Error ? error.message : String(error)}
        </div>`;
      } finally {
        // Clean up blob URL
        URL.revokeObjectURL(moduleUrl);
      }
    };

    loadWidget();

    // Cleanup function
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [widgetData]);

  return (
    <div className="widget-container">
      {widgetData.css && <style>{widgetData.css}</style>}
      <div ref={containerRef} />
    </div>
  );
}
