# CodeMirror Core Extensions Overview

This document catalogs the primary extensions available for configuring a CodeMirror editor, organized into six categories:

## Editing Extensions

**Whitespace Management:**
- `tabSize`: Adjusts tab width in spaces
- `lineSeparator`: Configures line break behavior
- `indentUnit`: Sets indentation spacing per level
- `indentOnInput`: Triggers automatic reindentation upon specific inputs

**Content Access:**
- `editable`: Controls cursor visibility and editing appearance
- `readOnly`: Determines if commands can modify content

**Enhancement Features:**
- `allowMultipleSelections`: Enables multi-range selections
- `autocompletion`: Provides content hints during typing
- `closeBrackets`: Auto-inserts matching closing brackets
- `codeFolding` & `foldGutter`: Collapse/expand document sections
- `history`: Manages undo/redo functionality
- `search`: Configures search interface

## Presentation Extensions

**Visual Styling:**
- `theme`: Applies color schemes
- `baseTheme`: Defines generic base styling
- `styleModule`: Loads CSS modules
- `editorAttributes` & `contentAttributes`: Adds HTML attributes
- `decorations`: Adds styling to content

**Display Features:**
- `drawSelection`: Custom selection rendering
- `lineWrapping`: Enables text wrapping
- `highlightActiveLine`: Emphasizes cursor line
- `highlightSpecialChars`: Shows invisible characters
- `scrollPastEnd`: Allows scrolling beyond final line
- `bracketMatching`: Highlights matching brackets
- `highlightSelectionMatches`: Marks duplicate selections
- `placeholder`: Shows empty-state text
- `phrases`: Enables interface translation

**Gutters & Tooltips:**
- `lineNumbers`: Adds line number column
- `lintGutter`: Displays error locations
- `tooltips` & `hoverTooltip`: Manages contextual popups

## Input Handling Extensions

- `domEventHandlers`: Processes browser events
- `dropCursor`: Shows drag-and-drop position
- `keymap`: Registers keyboard mappings (including standardKeymap, defaultKeymap, and specialized variants)
- `inputHandler`: Intercepts text input
- `mouseSelectionStyle`: Customizes selection behavior
- `dragMovesSelection`: Controls drag-copy versus move
- `clickAddsSelectionRange`: Defines click selection behavior
- `rectangularSelection`: Enables Alt-click rectangular regions
- `crosshairCursor`: Shows crosshair under Alt key

## Language Extensions

Language packages (e.g., @codemirror/lang-javascript) provide:
- `Language` objects for syntax selection
- `syntaxHighlighting`: Applies code coloring styles
- `foldService` & `indentService`: Provide folding and indentation
- `linter`: Registers diagnostic tools

## Primitive Extensions

- `StateField`: Custom editor state containers
- `ViewPlugin`: Plugin registration mechanism
- `exceptionSink`: Routes caught exceptions
- `updateListener`: Triggers on editor changes
- `changeFilter`, `transactionFilter`, `transactionExtender`: Transaction processing

## Extension Bundles

- `basicSetup`: "an array of extensions that enables many of the features listed on this page"
- `minimalSetup`: Lightweight alternative with essential-only extensions
