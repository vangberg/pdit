# CodeMirror Styling Guide

## Core Styling System

CodeMirror employs "a CSS-in-JS system to be able to include its styles directly in the script files." This eliminates the need for separate CSS library files, as styles load automatically through the JavaScript module system.

## Traditional CSS Approach

The editor exposes standard CSS class names like `cm-editor` for manual styling. However, injected library styles use generated class prefixes, so custom rules must match or exceed their specificity. As the documentation notes, rules "only need to be _as_ specific, not more specific, because the injected rules are placed before any other style sheets."

Example selectors:
- `.cm-editor.cm-focused { outline: 2px solid cyan }`
- `.cm-editor .cm-content { font-family: "Consolas" }`

## DOM Structure

Editors contain nested elements including scroller, gutters, content, selection layers, and cursor layers—all with specific class names for targeted styling.

## Customizable Aspects

Developers can adjust fonts, sizes, colors, padding, scrolling behavior, whitespace handling, and text direction. However, certain transformations like rotation or 3D effects will "break the editor."

## Theme Definition

Themes use `EditorView.theme()` with CSS selectors and style objects. The ampersand (`&`) character marks the outer editor element's position in rules. Dark themes pass `{dark: true}` to enable appropriate defaults.

## Syntax Highlighting

Code highlighting differs from general theming. Developers use `HighlightStyle.define()` to associate highlighting tags with styles, then wrap results in `syntaxHighlighting()` for extension activation.

## Layout Control

Line wrapping requires the `EditorView.lineWrapping` extension. Fixed heights use `height` properties, while maximum heights employ `max-height`. Minimum heights must target `.cm-content` and `.cm-gutter` elements directly.
