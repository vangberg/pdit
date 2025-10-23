# CodeMirror Tooltips: Complete Overview

## Purpose and Architecture

CodeMirror's tooltip system displays floating widgets over editor content. Rather than using side effects, tooltips are managed through a facet—a state-driven approach that "avoid[s] a whole class of potential synchronization problems."

## Core Concept

Tooltips are controlled by state fields that provide tooltip objects containing position data, orientation preferences, and DOM creation functions. This ties tooltips directly to editor state.

## Two Main Implementations

**Cursor Position Tooltips:**
The first example shows row:column coordinates above the cursor. A `StateField` stores tooltip data and updates when selection or document changes occur. The field uses a helper function to generate tooltips for empty ranges (cursors only):

- Extracts line number and column position
- Creates DOM elements with styling
- Returns tooltip objects with position and appearance properties

**Hover Tooltips:**
The `hoverTooltip` helper function triggers tooltips when users pause over content. It provides:

- Position and pointer-side information to a callback function
- Word boundary detection using regex patterns
- Optional tooltip return based on pointer context
- An `end` field defining the range where tooltips remain visible

## Styling

Both implementations use `EditorView.baseTheme()` to define CSS properties—background colors, padding, borders, and arrow decorations—maintaining visual consistency with the editor interface.

## Extension Pattern

Both features export functions returning extension arrays combining state fields and theme definitions for clean integration into CodeMirror editors.
