"""
FastAPI server for local Python code execution.

Provides HTTP endpoints for:
- Executing Python scripts
- Reading files from disk
- Resetting execution state
- Health checks
- Serving static frontend files
"""

import os
from dataclasses import asdict
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .executor import get_executor, reset_executor, ExecutionResult
from .sse import format_sse
from .file_watcher import FileWatcher


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
    scriptName: Optional[str] = None
    lineRange: Optional[LineRange] = None


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


# FastAPI app
app = FastAPI(
    title="pdit Python Backend",
    description="Local Python execution server for pdit",
    version="0.1.0"
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


@app.post("/api/execute-script")
async def execute_script(request: ExecuteScriptRequest):
    """Stream execution results as Server-Sent Events.

    Each statement result is sent as a separate SSE event as it completes,
    providing real-time feedback instead of waiting for entire script.

    Args:
        request: Script to execute with optional line range

    Returns:
        StreamingResponse with text/event-stream media type

    SSE Format: data: <JSON>\n\n
    """
    async def generate_events():
        import asyncio

        executor = get_executor()

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
async def reset():
    """Reset the execution namespace.

    Clears all variables and imported modules from the execution state.

    Returns:
        Status OK
    """
    reset_executor()
    return {"status": "ok"}


@app.get("/api/watch-file")
async def watch_file(path: str):
    """Watch a file and stream initial content + changes via SSE.

    This unified endpoint eliminates the need for separate /api/read-file.
    It sends an initial event with file content, then streams change events.

    Args:
        path: Absolute path to the file to watch

    Returns:
        StreamingResponse with text/event-stream media type

    SSE Events:
        - initial: Initial file content (sent first)
        - fileChanged: File was modified (includes new content)
        - fileDeleted: File was deleted (closes connection)
        - error: Error occurred (closes connection)
    """
    async def generate_events():
        watcher = FileWatcher(path)

        async for event in watcher.watch_with_initial():
            # Direct serialization using asdict()
            yield format_sse(asdict(event))

            # Stop after terminal events
            if event.type in ("fileDeleted", "error"):
                break

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
