---
title: Basic Usage
description: Core workflow and usage patterns
---

## Running pdit

Start pdit with any Python file:

```bash
pdit script.py
```

This opens your default browser with the pdit interface. The file is loaded into a CodeMirror editor.

## Executing Code

Press **Cmd+Enter** (Mac) or **Ctrl+Enter** (Windows/Linux) to execute the entire script.

Results appear inline, grouped by the lines of code that produced them.

## Editing

You can edit code directly in the browser. Changes are saved back to the file automatically.

Alternatively, edit the file in your favorite editor. pdit watches for changes and updates the display in real-time.

## Understanding Results

Results are color-coded and grouped:

- **Return values** - The result of expressions (like `df` or `x + y`)
- **Print output** - Text from `print()` calls
- **Errors** - Exceptions with full tracebacks
- **Rich output** - DataFrames, plots, images

## Working with Sessions

Each browser tab gets its own IPython kernel session. Variables persist between executions until you close the tab.

To reset your session, refresh the browser tab.

## File Watching

When you edit the source file externally, pdit detects changes and updates the editor. You can then re-execute to see new results.
