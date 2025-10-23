# CodeMirror Basic Editor Example

## Overview
The documentation explains how to create a functional text editor using CodeMirror's `EditorView` class.

## Core Concept
To instantiate an editor, you create an `EditorView` object with configuration options. As stated: "Usually, you'll want to specify a parent element to put the editor in right away, but it is also possible to place `view.dom` into the document after initialization."

## Key Features

**Basic Implementation:**
The simplest approach uses `basicSetup`, which bundles essential features. The code demonstrates initializing with a starting document and parent container.

**Extended Configuration:**
For granular control, developers can inline individual extensions including:
- Line numbering and code folding
- Syntax highlighting
- Undo/redo history
- Multiple cursor support
- Bracket matching and auto-closing
- Autocompletion system
- Search functionality

**State Management:**
The editor maintains current content in `view.state`, retrievable as a string via `state.doc.toString()`.

**Language Support:**
The guide notes that "Extensions are also the way you load additional functionality, such as a language mode" through dedicated language packages that return configured extensions.

## Styling
By default, editors are borderless and content-responsive, with customization available through styling options documented separately.
