# Development Guide

## Run locally from git repo

**Requirement**: [uv](https://github.com/astral-sh/uv) installed

```bash
# Install dependencies (with dev tools)
uv sync --dev

# Run pdit
uv run pdit script.py
```

Built frontend assets are committed to git in `pdit/_static/`, so you don't need Node.js to run pdit.

## Run from GitHub without cloning

**Note**: Requires SSH key configured for GitHub (private repo)

```bash
# Run directly from GitHub
uvx --from git+https://github.com/vangberg/pdit pdit script.py
```

## Frontend development

**Before committing frontend changes**, rebuild:

```bash
cd web
npm install
npm run build  # Outputs to ../pdit/_static/
cd ..
git add pdit/_static/ web/
```

For hot reloading during development:

```bash
# With honcho (recommended)
uv run honcho start

# Or run separately:
# Terminal 1: Backend
uv run uvicorn pdit.server:app --reload --reload-exclude examples/** --port 8888

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
