# Changelog

## 0.7.0a1 - 2026-01-30

### Added
- Streaming output updates inline while statements run (stdout/stderr updates live).

## 0.6.0 - 2026-01-29

### Added
- F-strings now render as markdown, like regular string literals.

### Fixed
- `<details>` elements in `_repr_html_` output now trigger line group resize when toggled.
- `IPython.display.Image` now respects `width` and `height` parameters.

## 0.5.0 - 2026-01-27

### Fixed
- `IPython.display.Markdown` now renders as markdown instead of plain text.

## 0.4.0 - 2026-01-26

### Fixed
- Decorators were not correctly applied to functions and classes.
