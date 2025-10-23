# CodeMirror Autocompletion Example

## Overview
This documentation covers CodeMirror's autocompletion functionality, explaining how to enable it and create custom completion sources.

## Key Sections

### Setting Up Autocompletion
The `autocompletion` extension enables input suggestions in editors. According to the documentation, "Autocompletion is enabled by including the `autocompletion` extension (which is included in the basic setup) in your configuration."

By default, completions appear when users type, though this can be configured. The standard keymap binds Ctrl-Space to initiate completion, arrow keys for selection, Enter to accept, and Escape to dismiss.

### Providing Completions
Completion sources are functions accepting a completion context object and returning results describing the completion range and available options. The documentation notes that "Sources may run asynchronously by returning a promise."

A basic example function demonstrates:
- Using `matchBefore()` to identify text eligible for completion
- Checking the `explicit` flag to determine if completion was user-initiated
- Returning an object with `from` position and `options` array

Completion objects support properties including:
- `label`: displayed text and insertion text
- `type`: determines icon appearance
- `detail`: short string shown after label
- `info`: longer descriptive text in side window
- `apply`: custom insertion logic
- `boost`: adjusts match scoring

### Sorting and Filtering
The plugin employs fuzzy matching to filter and rank completions automatically. Developers can set `filter: false` to implement custom filtering or use the `boost` property to influence ranking.

### Completion Result Validity
The `validFor` property (function or regex) indicates when cached completion lists remain applicable, improving efficiency across keystrokes.

### Completing from Syntax
Developers can inspect the syntax tree around the completion point for context-aware suggestions. The example demonstrates a JSDoc tag completer for JavaScript that checks for block comments starting with `/**` before offering tag completions.
