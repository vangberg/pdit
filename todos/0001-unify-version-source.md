## Unify version source of truth

### Problem
- `pdit/server.py` advertises `version="0.2.0"` while `pyproject.toml` and `pdit/__init__.py` are `0.1.0`.

### Goal
- One canonical version string, used everywhere.

### Proposed change
- Make `pdit/__init__.py#__version__` the source of truth.
- `pdit/server.py` imports `__version__` and uses it for FastAPI `version`.
- Keep `pyproject.toml` aligned (manual bump is fine; just don’t disagree).

### Acceptance
- `GET /api/health` (or OpenAPI docs) reports the same version as `pdit.__version__`.

