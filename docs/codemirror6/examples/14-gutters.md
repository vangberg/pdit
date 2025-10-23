# CodeMirror Gutters: Complete Overview

## What Are Gutters?

According to the documentation, gutters are "vertical bars in front of the code" that can display custom content alongside your editor. The simplest implementation uses the `lineNumbers()` function for line numbering.

## Core Concepts

**Basic Structure**: Gutters are displayed as a collection of vertical elements next to each other. Each gutter maintains its own styling and content, with ordering determined by extension placement in the configuration.

**Configuration Methods**: Two primary approaches exist for adding gutter content:
1. The `lineMarker` option—called for each visible line to determine display content
2. The `markers` option—uses a persistent RangeSet data structure for declarative updates

## Implementation Examples

### Empty Line Marker
The documentation shows how to create a gutter displaying "ø" on empty lines:

> "The `lineMarker` option checks if the line is zero-length, and if so, returns our marker."

This demonstrates using `GutterMarker` classes that implement `toDOM()` methods for rendering.

### Breakpoint Gutter
A more complex example combines state management through `StateField` and `StateEffect`. The breakpoint implementation:

- Tracks positions using RangeSet structures
- Handles click events via `domEventHandlers`
- Maps positions through document changes automatically
- Uses CSS styling for visual presentation

## Advanced Features

**Event Handling**: The `domEventHandlers` option enables interactive gutters, allowing mousedown handlers and similar interactions.

**Line Number Customization**: The `lineNumbers()` function accepts configuration for event handlers and custom formatting, such as hexadecimal display.

**Dynamic Markers**: The `lineNumberMarkers` facet allows extensions to inject markers into the line number gutter without direct configuration.
