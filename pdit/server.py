"""
FastAPI server for local Python code execution.

Provides HTTP endpoints for:
- Listing Python files
- Saving files to disk
- Serving static frontend files

And a WebSocket endpoint for:
- Executing Python scripts
- Watching a script file for changes
"""

import asyncio
import os
import threading
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .ipython_executor import IPythonExecutor
from .file_watcher import FileWatcher

# Global shutdown event for WebSocket connections (threading.Event works across threads)
shutdown_event = threading.Event()


@dataclass
class Session:
    """Represents a session with an IPython executor and state tracking."""
    executor: IPythonExecutor
    is_executing: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    file_watcher_task: Optional[asyncio.Task] = None
    watcher_stop_event: Optional[threading.Event] = None


# Session registry: maps session_id -> Session
_sessions: dict[str, Session] = {}
_sessions_lock = threading.Lock()  # Thread-safe session creation/deletion


def get_or_create_session(session_id: str) -> Session:
    """Get existing session or create a new one (thread-safe).

    The kernel starts immediately in the background so it's ready when the user
    executes code. File watching and other operations don't wait for the kernel.
    """
    with _sessions_lock:
        if session_id not in _sessions:
            executor = IPythonExecutor()
            executor.start()  # Start kernel in background immediately
            _sessions[session_id] = Session(executor=executor)
        return _sessions[session_id]


async def delete_session(session_id: str) -> None:
    """Delete a session if it exists, shutting down its kernel."""
    session = None
    with _sessions_lock:
        if session_id in _sessions:
            session = _sessions.pop(session_id)

    # Do async cleanup outside the lock to avoid blocking other connections
    if session:
        if session.watcher_stop_event:
            session.watcher_stop_event.set()
        if session.file_watcher_task:
            session.file_watcher_task.cancel()
        await session.executor.shutdown()


async def shutdown_all_sessions() -> None:
    """Shutdown all active sessions. Called on server shutdown."""
    for session_id in list(_sessions.keys()):
        await delete_session(session_id)


def is_error_result(result: dict) -> bool:
    """Check if an execution result represents an error."""
    return any(item["type"] == "error" for item in result.get("output", []))


def signal_shutdown():
    """Signal WebSocket connections to close and cleanup. Called by cli.py before server shutdown."""
    shutdown_event.set()
    # Run async shutdown in a new event loop if called from sync context
    try:
        loop = asyncio.get_running_loop()
        # If there's a running loop, schedule it
        asyncio.create_task(shutdown_all_sessions())
    except RuntimeError:
        # No running loop, create one
        asyncio.run(shutdown_all_sessions())


class SaveFileRequest(BaseModel):
    """Request to save a file."""
    path: str
    content: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle - cleanup on shutdown."""
    yield
    # Signal all connections to close and shutdown kernels
    shutdown_event.set()
    await shutdown_all_sessions()


# FastAPI app
app = FastAPI(
    title="pdit Python Backend",
    description="Local Python execution server for pdit",
    version="0.1.0",
    lifespan=lifespan
)


@app.middleware("http")
async def require_token(request: Request, call_next):
    """Require a token for API routes when configured."""
    token = os.environ.get("PDIT_TOKEN")
    if token and request.url.path.startswith("/api") and request.method != "OPTIONS":
        provided = request.headers.get("X-PDIT-Token") or request.query_params.get("token")
        if provided != token:
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)

# Configure CORS origins based on server port
# Environment variable is set by cli.py before server starts
port = os.environ.get("PDIT_PORT", "8888")

# Allow localhost on the selected port (handles both localhost and 127.0.0.1)
allowed_origins = [
    f"http://localhost:{port}",
    f"http://127.0.0.1:{port}",
]

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# WebSocket endpoint for unified session communication
@app.websocket("/ws/session")
async def websocket_session(websocket: WebSocket, sessionId: str, token: Optional[str] = None):
    """Unified WebSocket endpoint for file watching and code execution.

    The WebSocket connection lifecycle is tied to the session - when the connection
    closes, the session is cleaned up.

    Query Parameters:
        sessionId: Unique session identifier
        token: Optional authentication token (required if PDIT_TOKEN env var is set)

    Message Protocol (Client -> Server):
        {"type": "watch", "path": "/absolute/path.py"}
        {"type": "execute", "script": "...", "lineRange?": {"from": N, "to": N}, "scriptName?": "...", "reset?": false}
        {"type": "interrupt"}
        {"type": "reset"}

    Message Protocol (Server -> Client):
        File events: {"type": "initial/fileChanged/fileDeleted", "path": "...", "content": "...", "timestamp": N}
        Execution: {"type": "expressions/result/stream/cancelled/complete/busy", ...}
        Errors: {"type": "error", "message": "..."}
    """
    # Validate token if configured
    expected_token = os.environ.get("PDIT_TOKEN")
    if expected_token and token != expected_token:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    session = get_or_create_session(sessionId)
    execute_task: Optional[asyncio.Task] = None

    try:
        while True:
            # Check for server shutdown
            if shutdown_event.is_set():
                break

            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "watch":
                await _handle_ws_watch(websocket, session, data.get("path", ""))

            elif msg_type == "execute":
                # Run execution in background so we can process interrupt/reset
                if execute_task is not None and not execute_task.done():
                    # Already executing - send busy
                    await websocket.send_json({"type": "busy"})
                else:
                    execute_task = asyncio.create_task(
                        _handle_ws_execute(websocket, session, data)
                    )

            elif msg_type == "interrupt":
                await session.executor.interrupt()

            elif msg_type == "reset":
                await session.executor.reset()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Cancel any running execution task
        if execute_task is not None and not execute_task.done():
            execute_task.cancel()
            try:
                await execute_task
            except asyncio.CancelledError:
                pass
        # Clean up session when WebSocket closes
        await delete_session(sessionId)


async def _handle_ws_watch(websocket: WebSocket, session: Session, path: str) -> None:
    """Handle file watch request over WebSocket."""
    # Stop existing watcher if any
    if session.watcher_stop_event:
        session.watcher_stop_event.set()
    if session.file_watcher_task:
        session.file_watcher_task.cancel()
        try:
            await session.file_watcher_task
        except asyncio.CancelledError:
            pass

    # Create new watcher
    session.watcher_stop_event = threading.Event()
    watcher = FileWatcher(path, stop_event=session.watcher_stop_event)

    async def watch_loop():
        try:
            async for event in watcher.watch_with_initial():
                if shutdown_event.is_set():
                    break
                await websocket.send_json(asdict(event))
                if event.type in ("fileDeleted", "error"):
                    break
        except asyncio.CancelledError:
            pass
        except Exception:
            pass  # Connection may have closed

    session.file_watcher_task = asyncio.create_task(watch_loop())


async def _handle_ws_execute(websocket: WebSocket, session: Session, data: dict) -> None:
    """Handle code execution request over WebSocket with busy detection."""
    # Check if already executing
    async with session.lock:
        if session.is_executing:
            await websocket.send_json({"type": "busy"})
            return
        session.is_executing = True

    try:
        script = data.get("script", "")
        script_name = data.get("scriptName")
        line_range = None
        if lr := data.get("lineRange"):
            line_range = (lr["from"], lr["to"])

        if data.get("reset"):
            await session.executor.reset()

        # Track expressions for cancelled handling
        expressions: list[dict] = []
        executed_count = 0

        async def _send_stream_update(line_start: int, line_end: int, output: list[dict]) -> None:
            if shutdown_event.is_set():
                return
            try:
                await websocket.send_json({
                    "type": "stream",
                    "lineStart": line_start,
                    "lineEnd": line_end,
                    "output": output,
                })
            except Exception:
                # Connection may have closed; ignore streaming failures
                pass

        async for event in session.executor.execute_script(
            script,
            line_range,
            script_name,
            on_stream=_send_stream_update,
        ):
            # Add type field to result messages (executor yields without type)
            if "output" in event and "type" not in event:
                event = {"type": "result", **event}

            # Send event to client
            await websocket.send_json(event)

            # Track expressions for cancelled handling
            if event.get("type") == "expressions":
                expressions = event["expressions"]
                executed_count = 0
            elif event.get("type") == "result":
                executed_count += 1
                if is_error_result(event):
                    remaining = expressions[executed_count:]
                    if remaining:
                        await websocket.send_json({"type": "cancelled", "expressions": remaining})
                    await websocket.send_json({"type": "complete"})
                    return

        await websocket.send_json({"type": "complete"})

    except WebSocketDisconnect:
        # Client disconnected, interrupt execution
        await session.executor.interrupt()
        raise
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        async with session.lock:
            session.is_executing = False


class ListFilesResponse(BaseModel):
    """Response from listing files."""
    files: List[str]


@app.get("/api/list-files", response_model=ListFilesResponse)
async def list_files():
    """List all Python files in the current working directory.

    Returns:
        List of relative paths to .py files

    Note:
        Excludes hidden directories and common virtual environment directories.
    """
    import fnmatch

    cwd = Path.cwd()
    py_files: list[str] = []

    # Directories to skip
    skip_dirs = {".git", ".venv", "venv", "__pycache__", "node_modules", ".tox", ".mypy_cache", ".pytest_cache", "dist", "build", "*.egg-info"}

    for root, dirs, files in os.walk(cwd):
        # Filter out hidden and virtual environment directories
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in skip_dirs and not any(fnmatch.fnmatch(d, pattern) for pattern in skip_dirs)]

        for file in files:
            if file.endswith('.py'):
                full_path = Path(root) / file
                relative_path = full_path.relative_to(cwd)
                py_files.append(str(relative_path))

    # Sort by filename (not path) for better UX
    py_files.sort(key=lambda p: Path(p).name.lower())

    return ListFilesResponse(files=py_files)


@app.post("/api/save-file")
async def save_file(request: SaveFileRequest):
    """Save a file to the filesystem.

    Args:
        request: File path and content to save

    Returns:
        Status OK if successful

    Raises:
        HTTPException: If file cannot be written

    Note:
        Security consideration: This endpoint allows writing to any path
        the server has access to. Path validation should be added.
    """
    try:
        file_path = Path(request.path)
        file_path.write_text(request.content)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")


# Static file serving for frontend
# Get path to _static directory inside the package
STATIC_DIR = Path(__file__).parent / "_static"

if STATIC_DIR.exists():
    # Mount assets directory for JS/CSS files
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Serve index.html for all unmatched routes (SPA routing)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes."""
        # If path starts with /api, this won't match (API routes take precedence)
        # Serve index.html for SPA routing
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return ""
