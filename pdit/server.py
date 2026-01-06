"""FastAPI server for pdit."""

import fnmatch
import os
import threading
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .file_watcher import FileWatcher
from .session import get_session, Session, shutdown_all_sessions
from .sse import format_sse

# Global shutdown event for SSE connections
shutdown_event = threading.Event()

def signal_shutdown():
    """Signal all SSE connections to close."""
    shutdown_event.set()
    shutdown_all_sessions()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    shutdown_event.set()
    shutdown_all_sessions()

# FastAPI app
app = FastAPI(title="pdit", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic models
class SaveFileRequest(BaseModel):
    path: str
    content: str


class ReadFileResponse(BaseModel):
    content: str


class ListFilesResponse(BaseModel):
    files: List[str]


# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok"}


# File operations
@app.get("/api/watch-file")
async def watch_file(path: str, sessionId: str):
    """Watch a file and stream initial content + changes via SSE."""
    watcher_stop_event = threading.Event()

    async def generate_events():
        watcher = FileWatcher(path, stop_event=watcher_stop_event)
        try:
            async for event in watcher.watch_with_initial():
                if shutdown_event.is_set():
                    break
                yield format_sse(asdict(event))
                if event.type in ("fileDeleted", "error"):
                    break
        finally:
            watcher_stop_event.set()

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/api/read-file", response_model=ReadFileResponse)
async def read_file(path: str):
    """Read a file from the filesystem."""
    try:
        file_path = Path(path)
        content = file_path.read_text()
        return ReadFileResponse(content=content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


@app.get("/api/list-files", response_model=ListFilesResponse)
async def list_files():
    """List all Python files in the current working directory."""
    cwd = Path.cwd()
    py_files: list[str] = []
    skip_dirs = {".git", ".venv", "venv", "__pycache__", "node_modules", ".tox", ".mypy_cache", ".pytest_cache", "dist", "build", "*.egg-info"}

    for root, dirs, files in os.walk(cwd):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in skip_dirs and not any(fnmatch.fnmatch(d, pattern) for pattern in skip_dirs)]
        for file in files:
            if file.endswith('.py'):
                full_path = Path(root) / file
                relative_path = full_path.relative_to(cwd)
                py_files.append(str(relative_path))

    py_files.sort(key=lambda p: Path(p).name.lower())
    return ListFilesResponse(files=py_files)


@app.post("/api/save-file")
async def save_file(request: SaveFileRequest):
    """Save a file to the filesystem."""
    try:
        file_path = Path(request.path)
        file_path.write_text(request.content)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")


# WebSocket execution
@app.websocket("/ws/execute")
async def execute_websocket(websocket: WebSocket):
    """WebSocket endpoint for script execution."""
    await websocket.accept()
    session: Optional[Session] = None

    try:
        # Initialize session
        init_msg = await websocket.receive_json()
        session_id = init_msg.get('sessionId')

        if not session_id:
            await websocket.send_json({'type': 'error', 'error': 'No sessionId'})
            return

        session = get_session(session_id)
        await websocket.send_json({'type': 'init-ack', 'sessionId': session_id})

        # Message loop
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get('type')

            if msg_type == 'execute':
                # Extract line range if provided (convert from {from, to} to tuple)
                line_range = None
                if 'lineRange' in msg and msg['lineRange']:
                    line_range = (msg['lineRange']['from'], msg['lineRange']['to'])
                await session.execute_script(msg['script'], msg['executionId'], websocket.send_json, line_range)

            elif msg_type == 'interrupt':
                session.interrupt()

            elif msg_type == 'reset':
                session.restart()

            elif msg_type == 'ping':
                await websocket.send_json({'type': 'pong'})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({'type': 'error', 'error': str(e)})
        except:
            pass
    finally:
        if session:
            session.cancel_execution()


# Static file serving
STATIC_DIR = Path(__file__).parent / "_static"

if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return ""
