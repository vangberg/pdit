# Development Guide

## Requirements

- [uv](https://github.com/astral-sh/uv) for Python dependencies and tools
- Node.js + npm for frontend dev/build (optional if you only run the backend; built assets are committed in `pdit/_static/`)

## Setup

```bash
uv sync --dev
```

## Run locally

```bash
uv run pdit script.py
```

This starts the server on port 8888 and opens the editor.

## Hot reload (backend + frontend)

```bash
# Recommended
uv run honcho start
```

## Testing

```bash
# Python tests
uv run pytest

# Frontend tests
cd fe
npm test  # Starts a backend automatically with token auth disabled
```

You can also run the combined test suite:

```bash
make test
```

## Run without cloning

```bash
# Pre-built assets via the dist branch
uvx --from git+https://github.com/vangberg/pdit@dist pdit script.py
```
