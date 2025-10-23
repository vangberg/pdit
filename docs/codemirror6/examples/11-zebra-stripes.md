# CodeMirror Zebra Stripes Extension Example

## Overview

This example demonstrates creating a CodeMirror extension that applies alternating background colors to every Nth line of code, enhancing readability through visual distinction.

## Key Components

**Base Theme Definition**
The extension starts by establishing a theme using `EditorView.baseTheme()` that applies the `cm-zebraStripe` class with distinct colors: `"#a4f1f188"` for light themes and `"#34474788"` for dark themes.

**Configuration via Facets**
A `Facet` named `stepSize` manages the spacing between stripes. It accepts numeric values and uses their minimum (defaulting to 2 if unconfigured), allowing multiple extension instances to coordinate seamlessly.

**Main Export Function**
The `zebraStripes()` function returns an extension combining three elements: the base theme, optional step configuration, and a view plugin that handles decoration rendering.

**Decoration Logic**
The `stripeDeco()` helper iterates through visible line ranges, creating line decorations for every Nth line based on the configured step size. It accesses the step value dynamically through the editor state.

**View Plugin Implementation**
The `showStripes` plugin manages decorations through a class-based approach, recalculating them whenever the document or viewport changes, using a `RangeSetBuilder` for efficient decoration composition.

## Architecture Benefits

This design separates concerns: theming, configuration, and rendering operate independently, making the extension composable and maintainable while respecting theme overrides.
