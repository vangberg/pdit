# CodeMirror 5 to 6 Migration Guide Summary

## Key Changes Overview

The migration from CodeMirror 5 to 6 represents a significant architectural shift. The library transitioned from a monolithic UMD module system to modular packages under the `@codemirror` scope, requiring a build step for integration.

## Module System Restructuring

"The 5.x library was distributed as UMD modules, which could either be loaded directly with `<script>` tags or bundled as CommonJS modules." Version 6 eliminates this flexibility, now requiring a bundling step. Language support moved to dedicated packages like `@codemirror/lang-javascript` and `@codemirror/lang-rust`.

## Creating an Editor

The `EditorView` class replaces the old `CodeMirror` class. Instantiation requires importing from the view package and providing configuration:

```javascript
import {EditorView} from "@codemirror/view"
let view = new EditorView({parent: document.body})
```

The new version requires explicit configuration of previously built-in features like undo history and key bindings through extensions.

## Position System Overhaul

"CodeMirror 6 just uses offsets—the number of characters (UTF16 code units) from the start of the document." This replaces the old `{line, ch}` object format, improving efficiency. Importantly, "in CodeMirror 6 the first line has number 1, whereas CodeMirror 5 lines started at 0."

## Document and Selection Access

Access the document via `cm.state.doc.toString()` and selection through `cm.state.selection.main` and related properties, moving from direct method calls to state property access.

## Transaction-Based Updates

Updates now use dispatched transactions rather than direct method calls. "Document changes are described by the `changes` property of the transaction specs," enabling atomic, grouped updates.

## Eliminated Features

The `fromTextArea()` convenience method no longer exists, requiring manual textarea integration if needed.

## Decorations Replace Marks

"Marked text (and bookmarks) are called decorations in the new system." Decorations must be managed through extensions and range sets rather than direct API calls.

## Event System Removal

CodeMirror 6 eliminated the event system in favor of transaction-based state management and custom state fields, improving robustness for complex customizations.
