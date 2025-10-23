# CodeMirror System Guide - Complete Documentation

## Architecture Overview

CodeMirror operates as a modular system fundamentally different from traditional JavaScript libraries. Understanding its architecture prevents misaligned expectations when beginning development.

### Modularity Principles

The library comprises separate modules that collectively form a complete text and code editor. This structure offers flexibility—you select needed features and replace core functionality if necessary. The trade-off requires assembling multiple pieces rather than a monolithic package.

Essential core packages include:

- **`@codemirror/state`**: Defines structures representing editor state and document changes
- **`@codemirror/view`**: Provides the display component showing state and translating editing actions
- **`@codemirror/commands`**: Supplies editing commands and key bindings

A minimal editor requires importing these three packages and initializing an `EditorState` with extensions, then creating an `EditorView` instance.

For easier setup, the `codemirror` package bundles most baseline requirements (excluding language packages). This approach simplifies initial configuration.

The library distributes as ES6 modules, necessitating a bundler (like Rollup or Vite) or module loader for practical use.

### Functional Core, Imperative Shell

The architecture separates pure functional state representation from imperative DOM interaction. Document and state data structures remain immutable, with operations as pure functions. The view component and commands wrap these in an imperative interface.

This separation means old state values persist when transitioning to new states. Having both old and new states available proves valuable when handling state changes. Directly modifying state values violates the design—properties marked `readonly` in TypeScript enforce this constraint.

### State and Updates

Following Redux and Elm patterns, the view's state derives entirely from its `EditorState` value. Changes occur through transactions describing document, selection, or field modifications. Dispatching transactions updates the view's DOM representation.

The view listens for events (text input, key presses, mouse interaction) and converts them to transactions. Transactions can originate elsewhere but must dispatch to the view for effectiveness.

### Extension System

The minimal core gains functionality through extensions. These can configure options, define new state fields, style the editor, or inject custom components. The system prevents unexpected conflicts when extensions compose.

Active extensions reside in editor state and can be reconfigured via transactions. Extensions may be values or nested arrays, with automatic deduplication during configuration. Extension precedence follows explicit priority categories first, then position in the flattened extension collection.

### Document Offsets

CodeMirror addresses document positions using numbers representing character counts (UTF16 code units). Astral characters count as two units; line breaks always count as one unit regardless of separator configuration.

Offsets track selection, changes, decoration, and related features. Position mapping determines where start-document positions relocate in changed documents. The document structure indexes by line, allowing efficient lookup by line number.

## Data Model

CodeMirror treats documents as flat strings, storing them split by line in a tree-shaped structure enabling cheap updates anywhere and efficient line-based indexing.

### Document Changes

Changes are immutable values describing precisely which document ranges receive replacement text. This enables extensions to track changes exactly, supporting features like undo history and collaborative editing outside the core.

When creating change sets, all positions reference the original document—conceptually occurring simultaneously. The `compose` method combines change lists where later changes reference documents created by earlier ones.

### Selection

Editor state stores a current selection containing multiple ranges. Each range represents either a cursor (empty) or span between anchor and head. The system automatically merges overlapping ranges and sorts them, ensuring non-overlapping arrays.

By default, states accept only single-range selections. Multiple selection support requires including extensions capable of drawing them (like `drawSelection`) and enabling the appropriate option.

State methods like `changeByRange` apply operations to each selection range separately. The `replaceSelection` method creates transactions replacing all ranges with specified text.

### Configuration

Each state maintains a private configuration reference determined by active extensions. During regular transactions, configuration remains stable. Compartments enable reconfiguration, allowing adding to or replacing configuration sections.

Configuration directly affects stored fields and facet values for that state.

### Facets

Facets function as extension points where multiple extensions provide values, and authorized parties read output values. The combining mechanism varies by facet type:

- **Single output**: Takes the highest-precedence value (e.g., tab size)
- **Array output**: Provides sorted handlers for sequential execution (e.g., event handlers)
- **Computed output**: Reduces inputs logically (e.g., OR operations or maximum values)

Facets defined with `Facet.define` return exportable values for other code access or remain module-private. Most facets prove static in given configurations, though computed facets derive from other state aspects and automatically recompute when inputs change.

Facet values only recompute when necessary, allowing cheap identity tests to detect changes.

### Transactions

Transactions created via state's `update` method combine optional effects:

- Document changes
- Explicit selection movement (implicitly mapped through changes if unspecified)
- Scroll viewport flags
- Annotations storing metadata
- Effects for extension-specific impacts
- Configuration influence through reconfiguration or compartment replacement

Transaction specs typically use object literals, though helper methods also return them. Multiple specs combine into single transactions, useful for augmenting helper-generated specs.

Changes use `{from, to, insert}` objects (with `to` and `insert` optional) or nested arrays. Document positions reference the transaction's start document across multiple changes. New selection and effect positions reference the post-change document.

Completely resetting state (loading new documents) recommends creating new states rather than transactions to prevent unwanted state persistence.

## The View

The view attempts transparency around state while handling aspects requiring DOM access:

- Screen coordinate calculations for click positions and layout-dependent measurements
- Text direction determination from surrounding document context
- Cursor motion accounting for layout and directionality
- State not in functional representation (focus, scroll position) stored in DOM

The library doesn't expect user DOM manipulation. Attempted changes revert immediately. Use decorations for display modifications instead.

### Viewport Management

CodeMirror doesn't render entire documents when large. During updates, it detects visible content and renders that with surrounding margins—the viewport. This maintains responsiveness and low resource usage.

Coordinate queries outside the viewport fail (unrendered content lacks layout). The view tracks height information for all content, including viewport-external portions. Long lines and folded code can expand viewports significantly.

The `visibleRanges` property excludes invisible content, useful for operations like highlighting where invisible text work proves unnecessary.

### Update Cycle

The view minimizes DOM reflows through careful sequencing. Dispatching transactions generally causes DOM writes only. Reading (checking viewport validity, cursor scrolling) occurs in separate measure phases scheduled via `requestAnimationFrame`. Measure phases may trigger additional write phases if necessary.

Custom measure code can schedule using `requestMeasure`. The view raises errors when new updates initiate during synchronous update application, though measure-phase-pending updates combine without issues.

Completed view instances require calling `destroy` to release allocated resources (event handlers, mutation observers).

### DOM Structure

The editor's DOM structure follows this pattern:

```
<div class="cm-editor [theme classes]">
  <div class="cm-scroller">
    <div class="cm-content" contenteditable="true">
      <div class="cm-line">Content here</div>
    </div>
  </div>
</div>
```

The outer wrapper is a vertical flexbox hosting panels and tooltips. The scroller element supports `overflow: auto` or growing to content/max-height constraints. When gutters exist, they attach to the scroller's start.

The content element is editable with registered mutation observers, translating changes into document updates. Line elements hold document text, optionally decorated with styles or widgets.

### Styling and Themes

CodeMirror injects styles via JavaScript using a style-mod system. Registered styles become available through facets. Elements receive `cm-` prefixed classes for direct CSS targeting.

Themes created with `EditorView.theme` receive unique generated CSS classes scoped within their rules. Theme rules use style-mod notation, with `&` indicating the wrapper element position for class prefixing.

Extensions provide base themes for default styling using `&light` and `&dark` placeholders for light/dark mode detection, ensuring acceptable appearance without explicit theme overrides.

CSS rules including `.cm-editor` match injected style precedence when defining styles in regular CSS.

### Commands

Commands are functions with signature `(view: EditorView) => boolean`. Primary uses include key bindings and menu items. Commands represent user actions, returning `false` when inapplicable and `true` on successful execution. Effects occur imperatively, typically through transaction dispatching.

Multiple commands bound to single keys execute sequentially by precedence until one returns `true`.

`StateCommand` serves for state-only operations avoiding full view requirements, useful for testing without view instantiation.

The `@codemirror/commands` package exports numerous editing commands alongside keymaps—`KeyBinding` object arrays passed to the `keymap` facet.

## Extending CodeMirror

Multiple extension approaches suit different use cases. This section covers necessary concepts for writing extensions.

### State Fields

Extensions often need storing additional information in state. Examples include undo history tracking changes and code folding tracking folded regions.

Extensions define state fields using `StateField`, living in purely functional state and storing immutable values. Fields synchronize through reducer-like functions—every state update calls a function receiving current field value and transaction, returning the new value.

Annotations and effects communicate state changes to fields. Using actual state fields rather than external state proves beneficial, tying data into editor-wide update cycles and maintaining synchronization with other state aspects.

### Affecting the View

View plugins provide imperative components within the view, useful for event handlers, DOM management, and viewport-dependent operations.

Plugins should minimize non-derived state, working best as shallow views over editor-state data. When state reconfigures, unconfigured plugins destroy (necessitating `destroy` methods undoing DOM changes). Plugin crashes auto-disable to prevent entire-view failure.

### Decorating the Document

Decorations influence document appearance. Four types exist:

- **Mark decorations**: Apply styles/DOM attributes to text ranges
- **Widget decorations**: Insert DOM elements at positions
- **Replace decorations**: Hide or replace content with DOM nodes
- **Line decorations**: Add attributes to line-wrapping elements

Decorations come through facets, with content used during each view update to style visible content. Immutable range sets store decorations, mappable across changes or rebuilt on updates.

Two provision methods exist: directly (often derived from fields) or indirectly (functions from views to range sets). Only direct decoration sets influence vertical block structure; only indirect ones read viewports. This restriction exists because viewport derives from block structure.

### Extension Architecture

Creating functionality typically combines different extensions: state fields, base themes, view plugins, commands, configuration facets.

Exporting functions returning necessary extension values supports future parameterization without breaking compatibility. Even zero-parameter functions facilitate this.

When extensions enable multiple inclusions, relying on deduplication of identical extension values ensures single instances, preventing multiple copies in editors.

Configurable extensions benefit from module-private facets storing configuration with combining functions reconciling instances or throwing errors when impossible. State-needing code reads these facets.

---

This guide provides foundational knowledge for working with CodeMirror's architecture, state management, view rendering, and extension systems. Consult the reference manual for detailed interface documentation.
