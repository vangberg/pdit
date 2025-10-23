# CodeMirror API Reference Modules

Based on the reference manual, here are the available API packages and modules:

## Core Packages

| Package | Purpose |
|---------|---------|
| **@codemirror/state** | Data structures for editor state, documents, selections, and transactions |
| **@codemirror/view** | UI component and editor view functionality |
| **@codemirror/language** | Language support and syntax highlighting |
| **@codemirror/commands** | Built-in editor commands and keybindings |
| **@codemirror/search** | Search and replace functionality |
| **@codemirror/autocomplete** | Autocompletion features |
| **@codemirror/lint** | Linting integration |
| **@codemirror/collab** | Collaborative editing support |
| **@codemirror/language-data** | Language metadata and configuration |
| **@codemirror/merge** | Merge/diff functionality |
| **@codemirror/lsp-client** | Language Server Protocol client |
| **@codemirror** | Bundle package with preconfigured extensions |

## Key Classes & Interfaces

The `@codemirror/state` module contains foundational types including `EditorState`, `Transaction`, `Text`, `ChangeSet`, and `Range`. The `@codemirror/view` module provides the `EditorView` component for rendering.

All packages export both ECMAScript and CommonJS modules requiring a bundler or loader for browser use.

## Additional Resources

For detailed API documentation, visit the official CodeMirror reference manual at:
https://codemirror.net/docs/ref/
