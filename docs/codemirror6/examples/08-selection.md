# CodeMirror Selection Example

## Overview
CodeMirror's editor maintains selection state through ranges that consist of an anchor point and a head point. The anchor remains stationary during shift-selection, while the head moves. When these points coincide, it represents a cursor; otherwise, it's a text range.

## Key Concepts

**Multiple Selections**: When enabled, the editor can hold several selection ranges simultaneously, with one designated as the primary range accessible via `state.selection.main`.

**Selection Properties**: Each `SelectionRange` object contains `anchor` and `head` properties indicating document positions, plus `from`/`to` attributes for the minimum and maximum sides.

## Managing Selection Through Transactions

Selections are modified by dispatching transactions. A basic cursor movement example:

```javascript
view.dispatch({selection: {anchor: 0}})
```

The transaction's `selection` property accepts either shorthand notation or a full `EditorSelection` instance.

## Practical Examples

**Creating multiple ranges**:
```javascript
EditorSelection.create([
  EditorSelection.range(4, 5),
  EditorSelection.range(6, 7),
  EditorSelection.cursor(8)
], 1)
```

**Combining document changes with selection updates**:
```javascript
view.dispatch({
  changes: {from: 10, insert: "*"},
  selection: {anchor: 11}
})
```

The new selection must reference positions within the modified document state.

## Helper Methods

For multi-range operations, useful utilities include `replaceSelection()` (applies identical changes across all ranges) and `changeByRange()` (enables per-range modifications consolidated into a single transaction).
