# CodeMirror Decorations Overview

## Core Concept

CodeMirror manages DOM structure internally within the `cm-content` element. Direct manipulation typically gets reset. Instead, "decorations" allow controlled styling, content replacement, or element insertion. As stated: "to style content, replace content, or add additional elements in between the content, we have to tell the editor to do so."

## Four Decoration Types

1. **Mark decorations**: Add attributes or wrapping DOM elements to content portions (used for syntax highlighting)

2. **Widget decorations**: Insert DOM elements into editor content, such as color pickers or block-level widgets

3. **Replace decorations**: Hide content stretches, useful for code folding or replacing text with alternative displays

4. **Line decorations**: Positioned at line starts to influence wrapping DOM element attributes

## Decoration Architecture

Decorations use the `RangeSet` data structure to store values with associated position ranges. This efficiently handles position updates when documents change. Decorations reach the editor view through facets, provided either directly or via functions that compute them dynamically.

## Practical Examples

**Underline Command**: A state field tracks underlined regions using mark decorations with CSS styling (`textDecoration: "underline 3px red"`).

**Boolean Toggles**: Widget decorations display checkboxes alongside boolean literals, with event handlers enabling user interaction to flip values.

**Placeholders**: The `MatchDecorator` helper class decorates regex matches (like `[[name]]`) as replacing decorations with custom widgets, supporting atomic range behavior for unified cursor treatment.
