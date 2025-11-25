# Development Guide

## Run locally from git repo

**Requirement**: [uv](https://github.com/astral-sh/uv) installed

```bash
# Install dependencies (with dev tools)
uv pip install -e ".[dev]"

# Run rdit
uv run rdit script.py
```

Built frontend assets are committed to git in `rdit/_static/`, so you don't need Node.js to run rdit.

## Run from GitHub without cloning

**Note**: Requires SSH key configured for GitHub (private repo)

```bash
# Run directly from GitHub
uvx --from git+https://github.com/vangberg/rdit rdit script.py
```

## Frontend development

**Before committing frontend changes**, rebuild:

```bash
cd web
npm install
npm run build  # Outputs to ../rdit/_static/
cd ..
git add rdit/_static/ web/
```

For hot reloading during development:

```bash
# Terminal 1: Backend
uv run uvicorn rdit.server:app --reload --port 8888

# Terminal 2: Frontend dev server
cd web
npm run dev
# Open http://localhost:5173
```

## Testing

```bash
# Python tests
uv run pytest

# Frontend tests
cd web
npm test
```

## Issue tracking

Uses [bd (beads)](https://github.com/steveyegge/beads). See AGENTS.md for workflow.
