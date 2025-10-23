# CodeMirror Split View Example

## Overview
This example demonstrates how to create synchronized split-view editors using CodeMirror 6. The documentation explains that "multiple views from a single editor state...will not, by themselves, stay in sync" because states are immutable values that diverge independently.

## Key Implementation Strategy

The solution involves:

1. **Separate States**: Create one state with history tracking (main editor) and another without (secondary editor)

2. **Custom Dispatch Function**: Implement a dispatch mechanism that forwards changes between views while preventing infinite loops

3. **Synchronization Annotation**: Use an annotation to distinguish user-initiated transactions from synchronization transactions, ensuring "changes made in one view" propagate to the other

## Core Code Pattern

The synchronization function checks whether changes exist and lack the sync annotation, then broadcasts those changes:

```javascript
if (!tr.changes.empty && !tr.annotation(syncAnnotation)) {
  // Forward to other editor
}
```

## Important Limitation

The documentation notes that "non-document state (like selection) isn't shared between the editors." Developers must implement additional syncing logic if they need to share supplementary state elements like breakpoints or other metadata through effects.

This approach maintains a single undo history in the primary editor while keeping document content consistent across both views.
