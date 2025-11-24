"""
FastAPI server for local Python code execution.

Provides HTTP endpoints for:
- Executing Python scripts
- Resetting execution state
- Health checks
"""

from typing import List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


@app.get("/health")
async def health():
    """Health check endpoint.

    Returns:
        Status OK if server is running
    """
    return {"status": "ok"}


@app.post("/execute-script", response_model=ExecuteResponse)
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


@app.post("/reset")
async def reset():
    """Reset the execution namespace.

    Clears all variables and imported modules from the execution state.

    Returns:
        Status OK
    """
    reset_executor()
    return {"status": "ok"}
