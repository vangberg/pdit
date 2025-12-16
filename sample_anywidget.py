"""
AnyWidget Example - Counter Widget

This demonstrates how to use AnyWidget to create interactive widgets.
Currently, pdit does not render AnyWidget widgets interactively.
See plans/016-anywidget-integration.md for the implementation plan.
"""

import anywidget
import traitlets


class CounterWidget(anywidget.AnyWidget):
    """A simple counter widget with increment/decrement buttons."""

    _esm = """
        export function render({ model, el }) {
            let count = model.get('count');
            
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.gap = '10px';
            container.style.alignItems = 'center';
            container.style.fontFamily = 'system-ui, sans-serif';
            
            const decrementBtn = document.createElement('button');
            decrementBtn.textContent = '-';
            decrementBtn.style.padding = '8px 16px';
            decrementBtn.style.fontSize = '16px';
            
            const countDisplay = document.createElement('span');
            countDisplay.textContent = count;
            countDisplay.style.fontSize = '24px';
            countDisplay.style.minWidth = '60px';
            countDisplay.style.textAlign = 'center';
            
            const incrementBtn = document.createElement('button');
            incrementBtn.textContent = '+';
            incrementBtn.style.padding = '8px 16px';
            incrementBtn.style.fontSize = '16px';
            
            decrementBtn.addEventListener('click', () => {
                model.set('count', model.get('count') - 1);
                model.save_changes();
            });
            
            incrementBtn.addEventListener('click', () => {
                model.set('count', model.get('count') + 1);
                model.save_changes();
            });
            
            model.on('change:count', () => {
                countDisplay.textContent = model.get('count');
            });
            
            container.appendChild(decrementBtn);
            container.appendChild(countDisplay);
            container.appendChild(incrementBtn);
            el.appendChild(container);
        }
    """

    count = traitlets.Int(0).tag(sync=True)


# Create and display the widget
widget = CounterWidget()
widget
