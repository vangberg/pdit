"""
FastAPI server for local Python code execution.

Provides HTTP endpoints for:
- Executing Python scripts
- Reading files from disk
- Resetting execution state
- Health checks
- Serving static frontend files
"""

import asyncio
import os
import threading
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .xeus_executor import XeusPythonExecutor
from .executor import ExecutionResult, ExecutionState, Session
from .sse import format_sse
from .file_watcher import FileWatcher

# Global shutdown event for SSE connections (threading.Event works across threads)
shutdown_event = threading.Event()

# Session registry: maps session_id -> Session
_sessions: dict[str, Session] = {}


def get_or_create_session(session_id: str) -> Session:
    """Get existing session or create a new one lazily."""
    if session_id not in _sessions:
        executor = XeusPythonExecutor()
        _sessions[session_id] = Session(
            session_id=session_id,
            executor=executor,
            websocket=None,
            current_execution=None,
            execution_history={},
            created_at=datetime.now(),
            last_active=datetime.now(),
            execution_queue=asyncio.Queue()
        )
    return _sessions[session_id]


def delete_session(session_id: str) -> None:
    """Delete a session if it exists, shutting down its kernel."""
    if session_id in _sessions:
        session = _sessions.pop(session_id)
        session.executor.shutdown()


def shutdown_all_sessions() -> None:
    """Shutdown all active sessions. Called on server shutdown."""
    for session_id in list(_sessions.keys()):
        delete_session(session_id)


def cleanup_old_executions() -> None:
    """Clean up execution history older than 5 minutes."""
    cutoff = datetime.now() - timedelta(minutes=5)
    for session in _sessions.values():
        to_remove = [
            exec_id for exec_id, exec_state in session.execution_history.items()
            if exec_state.completed_at and exec_state.completed_at < cutoff
        ]
        for exec_id in to_remove:
            del session.execution_history[exec_id]


def signal_shutdown():
    """Signal all SSE connections to close and cleanup. Called by cli.py before server shutdown."""
    shutdown_event.set()
    shutdown_all_sessions()


# Pydantic models for API
class OutputItem(BaseModel):
    """Output item from execution."""
    type: str
    content: str


class ExpressionResult(BaseModel):
    """Result of executing a single statement."""
    lineStart: int
    lineEnd: int
    output: List[OutputItem]
    isInvisible: bool


class LineRange(BaseModel):
    """Line range filter for execution."""
    from_: int = Field(alias='from')
    to: int


class ExecuteScriptRequest(BaseModel):
    """Request to execute a Python script."""
    script: str
    sessionId: str
    scriptName: Optional[str] = None
    lineRange: Optional[LineRange] = None
    reset: Optional[bool] = False


class ExecuteResponse(BaseModel):
    """Response from script execution."""
    results: List[ExpressionResult]


class ReadFileResponse(BaseModel):
    """Response from reading a file."""
    content: str


class SaveFileRequest(BaseModel):
    """Request to save a file."""
    path: str
    content: str


class ResetRequest(BaseModel):
    """Request to reset execution namespace."""
    sessionId: str


async def cleanup_task():
    """Periodic cleanup of old sessions and execution history."""
    while True:
        await asyncio.sleep(300)  # Every 5 minutes

        # Cleanup old execution history
        cleanup_old_executions()

        # Cleanup inactive sessions (1 hour of inactivity, no current execution)
        cutoff = datetime.now() - timedelta(hours=1)
        to_remove = [
            sid for sid, session in _sessions.items()
            if session.last_active < cutoff and not session.current_execution
        ]
        for sid in to_remove:
            delete_session(sid)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle - cleanup on shutdown."""
    # Start cleanup task
    cleanup = asyncio.create_task(cleanup_task())
    try:
        yield
    finally:
        # Stop cleanup task
        cleanup.cancel()
        try:
            await cleanup
        except asyncio.CancelledError:
            pass
        # Signal all SSE connections to close and shutdown kernels
        shutdown_event.set()
        shutdown_all_sessions()


# FastAPI app
app = FastAPI(
    title="pdit Python Backend",
    description="Local Python execution server for pdit",
    version="0.1.0",
    lifespan=lifespan
)

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


@app.get("/api/health")
async def health():
    """Health check endpoint.

    Returns:
        Status OK if server is running
    """
    return {"status": "ok"}


@app.post("/api/init-session")
async def init_session(request: ResetRequest):
    """Initialize a session and start its kernel.

    This endpoint is called on page load to start the kernel immediately,
    so it's ready when the user first runs code.

    Args:
        request: Session ID to initialize

    Returns:
        Status OK
    """
    get_or_create_session(request.sessionId)
    return {"status": "ok"}


@app.post("/api/execute-script")
async def execute_script(request: ExecuteScriptRequest):
    """Stream execution results as Server-Sent Events.

    Each statement result is sent as a separate SSE event as it completes,
    providing real-time feedback instead of waiting for entire script.

    Args:
        request: Script to execute with optional line range and reset flag

    Returns:
        StreamingResponse with text/event-stream media type

    SSE Format: data: <JSON>\n\n
    """
    async def generate_events():
        import asyncio

        session = get_or_create_session(request.sessionId)
        executor = session.executor

        # Reset execution environment if requested
        if request.reset:
            executor.reset()

        # Convert line range if provided
        line_range = None
        if request.lineRange:
            line_range = (request.lineRange.from_, request.lineRange.to)

        try:
            # Execute script (yields expression list first, then results)
            events = executor.execute_script(request.script, line_range, request.scriptName)

            for event in events:
                # First event is expression list
                if isinstance(event, list):
                    yield format_sse({
                        "type": "expressions",
                        "expressions": [
                            {
                                "lineStart": expr.line_start,
                                "lineEnd": expr.line_end
                            }
                            for expr in event
                        ]
                    })
                # Subsequent events are execution results
                elif isinstance(event, ExecutionResult):
                    expr_result = ExpressionResult(
                        lineStart=event.line_start,
                        lineEnd=event.line_end,
                        output=[
                            OutputItem(type=o.type, content=o.content)
                            for o in event.output
                        ],
                        isInvisible=event.is_invisible
                    )
                    yield format_sse(expr_result.model_dump())

                # Force async yield to flush immediately
                await asyncio.sleep(0)

            # Send completion event
            yield format_sse({"type": "complete"})

        except Exception as e:
            # Send error event
            yield format_sse({
                "type": "error",
                "message": str(e)
            })

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.post("/api/reset")
async def reset(request: ResetRequest):
    """Reset the execution namespace.

    Clears all variables and imported modules from the execution state.

    Returns:
        Status OK
    """
    session = get_or_create_session(request.sessionId)
    session.executor.reset()
    return {"status": "ok"}


@app.get("/api/watch-file")
async def watch_file(path: str, sessionId: str):
    """Watch a file and stream initial content + changes via SSE.

    This unified endpoint eliminates the need for separate /api/read-file.
    It sends an initial event with file content, then streams change events.
    When the SSE connection closes, the associated session is cleaned up.

    Args:
        path: Absolute path to the file to watch
        sessionId: Session ID for cleanup on disconnect

    Returns:
        StreamingResponse with text/event-stream media type

    SSE Events:
        - initial: Initial file content (sent first)
        - fileChanged: File was modified (includes new content)
        - fileDeleted: File was deleted (closes connection)
        - error: Error occurred (closes connection)
    """
    # Each watcher gets its own stop event for cleanup on disconnect
    watcher_stop_event = threading.Event()

    async def generate_events():
        watcher = FileWatcher(path, stop_event=watcher_stop_event)

        try:
            async for event in watcher.watch_with_initial():
                # Check if server is shutting down
                if shutdown_event.is_set():
                    break

                # Direct serialization using asdict()
                yield format_sse(asdict(event))

                # Stop after terminal events
                if event.type in ("fileDeleted", "error"):
                    break
        finally:
            # Signal watcher to stop (important for cleanup on client disconnect)
            watcher_stop_event.set()
            # Clean up session when SSE connection closes
            delete_session(sessionId)

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
    """Read a file from the filesystem.

    Args:
        path: Absolute path to the file to read

    Returns:
        File contents as text

    Raises:
        HTTPException: If file not found or cannot be read

    Note:
        Security consideration: This endpoint allows reading any file
        the server has access to. Path validation should be added.
    """
    try:
        file_path = Path(path)
        content = file_path.read_text()
        return ReadFileResponse(content=content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


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


# WebSocket endpoint for execution
async def safe_send(websocket: WebSocket, data: dict) -> bool:
    """Safely send JSON over WebSocket, return False if connection is closed."""
    try:
        await websocket.send_json(data)
        return True
    except Exception:
        return False


async def execute_script_ws(session: Session, execution_state: ExecutionState, websocket: WebSocket) -> None:
    """Execute script and send results via WebSocket."""
    executor = session.executor

    try:
        # Add 5 minute timeout for entire execution
        async with asyncio.timeout(300):
            # Parse script using executor
            statements = executor._parse_script(execution_state.script)

            # Filter by line range if provided
            filtered = []
            if execution_state.line_range:
                from_line, to_line = execution_state.line_range
                for stmt in statements:
                    if stmt.line_end < from_line or stmt.line_start > to_line:
                        continue
                    filtered.append(stmt)
            else:
                filtered = statements

            # Build expression info list
            from .executor import ExpressionInfo
            execution_state.expressions = [
                ExpressionInfo(
                    node_index=stmt.node_index,
                    line_start=stmt.line_start,
                    line_end=stmt.line_end
                )
                for stmt in filtered
            ]

            # Send execution started with expression list
            if not await safe_send(websocket, {
                'type': 'execution-started',
                'executionId': execution_state.execution_id,
                'expressions': [
                    {
                        'nodeIndex': expr.node_index,
                        'lineStart': expr.line_start,
                        'lineEnd': expr.line_end
                    }
                    for expr in execution_state.expressions
                ]
            }):
                return  # WebSocket closed

            # Execute each statement
            for i, stmt in enumerate(filtered):
                # Check if cancelled
                if execution_state.status == 'cancelled':
                    break

                # Update current index
                execution_state.current_index = i

                # Execute statement (wrapped in thread pool since it's sync)
                if stmt.is_markdown_cell:
                    import ast
                    try:
                        value = ast.literal_eval(stmt.source)
                        from .executor import OutputItem
                        output = [OutputItem(type="text/markdown", content=str(value).strip())]
                    except (ValueError, SyntaxError):
                        output = await asyncio.to_thread(executor._execute_code, stmt.source)
                else:
                    output = await asyncio.to_thread(executor._execute_code, stmt.source)

                # Create result
                from .executor import ExecutionResult as ExecResult
                result = ExecResult(
                    node_index=stmt.node_index,
                    line_start=stmt.line_start,
                    line_end=stmt.line_end,
                    output=output,
                    is_invisible=len(output) == 0
                )
                execution_state.results[stmt.node_index] = result

                # Send result
                if not await safe_send(websocket, {
                    'type': 'expression-done',
                    'executionId': execution_state.execution_id,
                    'nodeIndex': result.node_index,
                    'lineStart': result.line_start,
                    'lineEnd': result.line_end,
                    'output': [{'type': o.type, 'content': o.content} for o in result.output],
                    'isInvisible': result.is_invisible
                }):
                    return  # WebSocket closed

            # Mark complete
            if execution_state.status == 'cancelled':
                execution_state.completed_at = datetime.now()
                await safe_send(websocket, {
                    'type': 'execution-cancelled',
                    'executionId': execution_state.execution_id
                })
            else:
                execution_state.status = 'completed'
                execution_state.completed_at = datetime.now()
                await safe_send(websocket, {
                    'type': 'execution-complete',
                    'executionId': execution_state.execution_id
                })

    except asyncio.TimeoutError:
        execution_state.status = 'error'
        execution_state.error_message = 'Execution timeout (5 minutes)'
        execution_state.completed_at = datetime.now()
        await safe_send(websocket, {
            'type': 'execution-error',
            'executionId': execution_state.execution_id,
            'error': 'Execution timeout (5 minutes)'
        })
    except Exception as e:
        execution_state.status = 'error'
        execution_state.error_message = str(e)
        execution_state.completed_at = datetime.now()
        await safe_send(websocket, {
            'type': 'execution-error',
            'executionId': execution_state.execution_id,
            'error': str(e)
        })


async def process_execution_queue(session: Session, websocket: WebSocket):
    """Process queued executions one at a time."""
    try:
        while True:
            # Get next execution from queue
            execution_state = await session.execution_queue.get()

            # Mark as running
            session.current_execution = execution_state
            execution_state.status = 'running'

            # Execute
            task = asyncio.create_task(execute_script_ws(session, execution_state, websocket))
            execution_state.task = task

            try:
                await task
            except asyncio.CancelledError:
                # Task was cancelled
                execution_state.status = 'cancelled'
                execution_state.completed_at = datetime.now()
                raise  # Propagate cancellation
            except Exception as e:
                # Log error but continue processing queue
                print(f"Error in execution: {e}")
            finally:
                # Clear current execution
                session.current_execution = None
                session.execution_queue.task_done()
    except asyncio.CancelledError:
        # Queue processor was cancelled (WebSocket closed)
        # Cancel any running execution
        if session.current_execution and session.current_execution.task:
            session.current_execution.task.cancel()
        raise


@app.websocket("/ws/execute")
async def execute_websocket(websocket: WebSocket):
    """WebSocket endpoint for script execution."""
    await websocket.accept()
    session: Optional[Session] = None
    queue_processor_task: Optional[asyncio.Task] = None

    try:
        # 1. First message must be 'init'
        init_msg = await websocket.receive_json()
        if init_msg.get('type') != 'init':
            await websocket.send_json({
                'type': 'error',
                'error': 'First message must be init'
            })
            return

        # 2. Get or create session
        session_id = init_msg['sessionId']
        session = get_or_create_session(session_id)
        session.websocket = websocket
        session.last_active = datetime.now()

        # 3. Start queue processor
        queue_processor_task = asyncio.create_task(process_execution_queue(session, websocket))

        # 4. Acknowledge
        await websocket.send_json({
            'type': 'init-ack',
            'sessionId': session_id
        })

        # 5. Message loop
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get('type')

            if msg_type == 'execute':
                # Create execution state
                execution_state = ExecutionState(
                    execution_id=msg['executionId'],
                    session_id=session.session_id,
                    script=msg['script'],
                    line_range=tuple(msg['lineRange'].values()) if msg.get('lineRange') else None,
                    status='pending',
                    started_at=datetime.now(),
                )

                # Add to history
                session.execution_history[execution_state.execution_id] = execution_state

                # Reset if requested
                if msg.get('reset'):
                    session.executor.reset()

                # Queue execution
                await session.execution_queue.put(execution_state)

            elif msg_type == 'cancel':
                # Cancel execution
                execution_id = msg['executionId']
                execution = session.execution_history.get(execution_id)
                if execution and execution.status == 'running' and execution.task:
                    execution.status = 'cancelled'
                    execution.task.cancel()
                    execution.completed_at = datetime.now()

                    await websocket.send_json({
                        'type': 'execution-cancelled',
                        'executionId': execution_id
                    })
                else:
                    await websocket.send_json({
                        'type': 'error',
                        'error': f'Execution {execution_id} not found or not running'
                    })

            elif msg_type == 'get-state':
                # Get execution state
                execution_id = msg['executionId']
                execution = session.execution_history.get(execution_id)
                if not execution:
                    await websocket.send_json({
                        'type': 'error',
                        'error': f'Execution {execution_id} not found'
                    })
                else:
                    await websocket.send_json({
                        'type': 'state',
                        'executionId': execution_id,
                        'state': {
                            'status': execution.status,
                            'currentIndex': execution.current_index,
                            'expressions': [
                                {
                                    'nodeIndex': expr.node_index,
                                    'lineStart': expr.line_start,
                                    'lineEnd': expr.line_end
                                }
                                for expr in execution.expressions
                            ],
                            'results': {
                                str(idx): {
                                    'nodeIndex': result.node_index,
                                    'lineStart': result.line_start,
                                    'lineEnd': result.line_end,
                                    'output': [
                                        {'type': o.type, 'content': o.content}
                                        for o in result.output
                                    ],
                                    'isInvisible': result.is_invisible
                                }
                                for idx, result in execution.results.items()
                            },
                            'errorMessage': execution.error_message
                        }
                    })

            elif msg_type == 'reset':
                session.executor.reset()

            elif msg_type == 'ping':
                await websocket.send_json({'type': 'pong'})

            # Update last active
            session.last_active = datetime.now()

    except WebSocketDisconnect:
        # Clean up connection reference but keep session alive
        if session:
            session.websocket = None
        if queue_processor_task:
            queue_processor_task.cancel()

    except Exception as e:
        await websocket.send_json({
            'type': 'error',
            'error': str(e)
        })
        if queue_processor_task:
            queue_processor_task.cancel()


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
