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
## Ticks

This project uses `tk` for issue tracking. Use ticks for work that spans sessions, has dependencies, or is discovered during other work. Use TodoWrite for simple single-session tasks.

**Essential commands:**
```
tk next                  # next ready tick
tk next EPIC_ID          # next ready tick in epic
tk create "title"        # create issue
tk update ID --status in_progress
tk note ID "message"     # log progress
tk close ID              # mark done
```

**Dependencies & epics:**
```
tk next --epic           # next ready epic
tk block ID BLOCKER_ID   # ID is blocked by BLOCKER_ID
tk create "task" --parent EPIC_ID
tk update ID --parent EPIC_ID  # move to epic
```

**Agent-Human workflow:**
```
tk update ID --awaiting approval   # hand off to human
tk update ID --awaiting=           # return to agent queue
```

Awaiting states: work, approval, input, review, content, escalation, checkpoint.
Use `--requires approval` at creation for tasks needing sign-off before close.

Commands show your ticks by default. Use `--all` to see everyone's (e.g. `tk next --all`).

All commands support `--help` for options.
