# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

pdit is an interactive Python editor with inline execution results. It runs Python code locally using an IPython kernel and displays streaming results in a browser-based CodeMirror editor.

## Development Commands

```bash
# Install dependencies
uv sync --dev

# Run pdit
uv run pdit script.py

# Run Python tests
uv run pytest

# Run single test
uv run pytest tests/test_server.py::test_health -v

# Frontend development with hot reload (recommended)
uv run honcho start

# Frontend tests
cd fe && npm test

# Run all tests (backend + frontend)
make test

# Rebuild frontend assets (required before committing frontend changes)
cd fe && npm install && npm run build
```

## Architecture

### Backend (Python)

- `pdit/server.py` - FastAPI server with a unified WebSocket for real-time execution + file watching
- `pdit/ipython_executor.py` - IPython kernel management via jupyter_client; parses Python into statements using AST and executes each statement, yielding results
- `pdit/file_watcher.py` - Watches script files for changes, notifies frontend via WebSocket messages
- `pdit/cli.py` - Typer CLI entry point
- `pdit/exporter.py` - HTML export functionality

### Frontend (TypeScript/React)

- `fe/src/Script.tsx` - Main component managing editor, execution, and output state
- `fe/src/Editor.tsx` - CodeMirror 6 editor component
- `fe/src/Output.tsx` - Renders execution results (stdout, errors, dataframes, images)
- `fe/src/compute-line-groups.ts` - Groups results by source lines
- `fe/src/websocket-client.ts` - WebSocket client for file watching and execution streaming

### Key Data Flow

1. User edits code in CodeMirror editor
2. Frontend opens `/ws/session?sessionId=...` and starts watching the script file
3. On Cmd+Enter, frontend sends `{"type":"execute", ...}` over the WebSocket
4. Server parses code into statements, sends an expressions list, then sends results as each statement completes
5. Frontend groups results by line ranges and displays inline

### Session Management

Each browser tab gets a unique session ID. Sessions map to IPython kernel instances. Sessions are cleaned up when the WebSocket connection closes.

## Frontend Build

Built assets go to `pdit/_static/` and are committed to git.

## Testing Notes

- Tests use `pytest-asyncio` with `asyncio_mode = "auto"`
- Server tests use class-scoped fixtures to share kernel instances (faster)
- IPython executor tests use module-scoped fixtures for the same reason

## Version Control

This project uses [jj (Jujutsu)](https://github.com/martinvonz/jj) instead of git.
