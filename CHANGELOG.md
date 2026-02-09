# Changelog

## Unreleased

### Added
- CLI `--agent-guide` flag to print the bundled coding agent guide and exit.

## 0.7.0 - 2026-02-02

### Added
- Streaming output updates inline while statements run (stdout/stderr updates live).

### Fixed
- CLI `--export` now runs scripts correctly after the async executor changes.

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
