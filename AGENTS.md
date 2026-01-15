# Repository Guidelines

## Project Structure & Module Organization
- `pdit/` contains the FastAPI backend, CLI, and execution engine; `pdit/_static/` holds built frontend assets that are committed to git.
- `fe/` contains the Vite/React frontend source (TypeScript).
- `tests/` contains Python tests; frontend tests live alongside the frontend in `fe/`.
- `examples/` contains sample scripts for manual runs and demos.

## Build, Test, and Development Commands
- `uv sync --dev` installs Python dependencies and dev tools.
- `uv run pdit script.py` runs the server and opens the editor on port 8888.
- `uv run honcho start` runs backend + frontend with hot reload (recommended).
- `cd fe && npm run build` builds frontend assets into `pdit/_static/` (required before committing frontend changes).
- `uv run pytest` runs Python tests; `cd fe && npm test` runs Vitest and starts a backend automatically with token auth disabled.

## Coding Style & Naming Conventions
- Python is formatted with Black (line length 100) and linted with Ruff; keep new code consistent.
- Type hints are required for new Python functions (`mypy` is strict with `disallow_untyped_defs`).
- Use `snake_case` for Python modules/functions and `PascalCase` for React components (e.g., `Editor.tsx`).

## Testing Guidelines
- Pytest naming: `tests/test_*.py`, `Test*` classes, `test_*` functions (configured in `pyproject.toml`).
- Example targeted run: `uv run pytest tests/test_server.py::test_health -v`.
- Frontend tests use Vitest: `cd fe && npm test` (auto-starts backend with token auth disabled).

## Commit & Pull Request Guidelines
- Commit messages are short, imperative, and sentence case (e.g., “Remove uv.lock from version control”).
- Use `jj` for version control workflows (git-compatible).
- PRs should include a concise summary, test results, and screenshots for UI changes.

## Notes for Contributors
- Built assets in `pdit/_static/` are versioned; keep them in sync with `fe/` builds.
- The `@dist` branch is used for pre-built assets; keep changes compatible with that flow.
