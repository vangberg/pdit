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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .executor import get_executor, reset_executor


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


@app.post("/api/execute-script", response_model=ExecuteResponse)
async def execute_script(request: ExecuteScriptRequest):
    """Parse and execute a Python script.

    Args:
        request: Script to execute with optional line range

    Returns:
        Execution results for each statement.
        Syntax errors are returned as execution results with error output.
    """
    executor = get_executor()

    # Convert line range if provided
    line_range = None
    if request.lineRange:
        line_range = (request.lineRange.from_, request.lineRange.to)

    # Execute script (syntax errors are captured in results)
    results = executor.execute_script(request.script, line_range)

    # Convert to API response format
    return ExecuteResponse(
        results=[
            ExpressionResult(
                nodeIndex=r.node_index,
                lineStart=r.line_start,
                lineEnd=r.line_end,
                output=[
                    OutputItem(type=o.type, text=o.text)
                    for o in r.output
                ],
                isInvisible=r.is_invisible
            )
            for r in results
        ]
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


# Static file serving for frontend
# Get path to web/dist directory relative to this file
STATIC_DIR = Path(__file__).parent.parent / "web" / "dist"

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
        return {"error": "Frontend not found"}
