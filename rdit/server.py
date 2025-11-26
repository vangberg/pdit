"""
FastAPI server for local Python code execution.

Provides HTTP endpoints for:
- Executing Python scripts
- Reading files from disk
- Resetting execution state
- Health checks
- Serving static frontend files
"""

from pathlib import Path
from typing import List, Optional
import json
import time
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .executor import get_executor, reset_executor
from .file_watcher import FileWatcher


# Pydantic models for API
class OutputItem(BaseModel):
    """Output item from execution."""
    type: str
    text: str


class ExpressionResult(BaseModel):
    """Result of executing a single statement."""
    nodeIndex: int
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
    title="rdit Python Backend",
    description="Local Python execution server for rdit",
    version="0.1.0"
)

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
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
            # Execute script (returns generator of results)
            results = executor.execute_script(request.script, line_range)

            # Stream each result as SSE event
            for result in results:
                # Convert to API response format
                expr_result = ExpressionResult(
                    nodeIndex=result.node_index,
                    lineStart=result.line_start,
                    lineEnd=result.line_end,
                    output=[
                        OutputItem(type=o.type, text=o.text)
                        for o in result.output
                    ],
                    isInvisible=result.is_invisible
                )

                # SSE format: "data: <json>\n\n"
                yield f"data: {expr_result.model_dump_json()}\n\n"

                # Force async yield to flush immediately
                await asyncio.sleep(0)

            # Send completion event
            yield 'data: {"type": "complete"}\n\n'

        except Exception as e:
            # Send error event
            error_data = {
                "type": "error",
                "message": str(e)
            }
            yield f"data: {json.dumps(error_data)}\n\n"

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


@app.websocket("/api/watch-file")
async def watch_file(websocket: WebSocket):
    """Watch a file for changes and stream events via WebSocket.

    Opens a long-lived WebSocket connection that streams file change events
    as they occur. Connection stays open until client disconnects or file is deleted.

    WebSocket Messages:
        Client sends:
        - {"type": "watch", "path": "<absolute-path>"} to start watching

        Server sends:
        - {"type": "fileChanged", "path": "...", "content": "...", "timestamp": ...}
        - {"type": "fileDeleted", "path": "..."}
        - {"type": "error", "message": "..."}
    """
    await websocket.accept()
    watcher = None

    try:
        # Wait for initial watch request
        message = await websocket.receive_json()

        if message.get("type") != "watch":
            await websocket.send_json({
                "type": "error",
                "message": "Expected 'watch' message"
            })
            await websocket.close()
            return

        path = message.get("path")
        if not path:
            await websocket.send_json({
                "type": "error",
                "message": "Missing 'path' in watch request"
            })
            await websocket.close()
            return

        # Create and start file watcher
        try:
            watcher = FileWatcher(path)
            watcher.start()
        except FileNotFoundError:
            await websocket.send_json({
                "type": "error",
                "message": f"File not found: {path}"
            })
            await websocket.close()
            return
        except Exception as e:
            await websocket.send_json({
                "type": "error",
                "message": str(e)
            })
            await websocket.close()
            return

        # Stream events as they occur
        async for event in watcher.get_events():
            if event["type"] == "modified":
                # Read new file content
                try:
                    file_path = Path(path)
                    content = file_path.read_text()
                    timestamp = int(time.time())

                    data = {
                        "type": "fileChanged",
                        "path": path,
                        "content": content,
                        "timestamp": timestamp
                    }
                    await websocket.send_json(data)

                except Exception as e:
                    # Error reading file
                    error_data = {
                        "type": "error",
                        "message": f"Error reading file: {str(e)}"
                    }
                    await websocket.send_json(error_data)
                    break

            elif event["type"] == "deleted":
                # File was deleted
                data = {
                    "type": "fileDeleted",
                    "path": path
                }
                await websocket.send_json(data)
                break

    except WebSocketDisconnect:
        # Client disconnected
        pass
    except Exception as e:
        # Send error if websocket still open
        try:
            error_data = {
                "type": "error",
                "message": str(e)
            }
            await websocket.send_json(error_data)
        except:
            pass
    finally:
        # Clean up watcher
        if watcher:
            watcher.stop()
        try:
            await websocket.close()
        except:
            pass


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
