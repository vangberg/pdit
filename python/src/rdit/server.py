"""FastAPI server for executing Python code."""

from typing import Dict, List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .executor import get_executor, reset_executor, Statement as ExecutorStatement


app = FastAPI(title="rdit Python Backend")

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OutputItem(BaseModel):
    type: str  # 'stdout' | 'stderr' | 'error' | 'warning' | 'message'
    text: str


class Statement(BaseModel):
    code: str
    nodeIndex: int
    lineStart: int
    lineEnd: int
    isExpr: bool

    def to_executor_statement(self) -> ExecutorStatement:
        """Convert API model to executor Statement."""
        return ExecutorStatement(
            code=self.code,
            node_index=self.nodeIndex,
            line_start=self.lineStart,
            line_end=self.lineEnd,
            is_expr=self.isExpr
        )


class ExecuteScriptRequest(BaseModel):
    script: str
    lineRange: Optional[Dict[str, int]] = None


class ExecuteRequest(BaseModel):
    statements: List[Statement]
    lineRange: Optional[Dict[str, int]] = None


class ExpressionResult(BaseModel):
    nodeIndex: int
    lineStart: int
    lineEnd: int
    output: List[OutputItem]
    isInvisible: bool


class ExecuteResponse(BaseModel):
    results: List[ExpressionResult]


@app.post("/execute-script", response_model=ExecuteResponse)
async def execute_script(request: ExecuteScriptRequest) -> ExecuteResponse:
    """Parse and execute a Python script, returning results."""
    executor = get_executor()
    results = executor.execute_script(request.script, request.lineRange)

    return ExecuteResponse(
        results=[
            ExpressionResult(
                nodeIndex=r.node_index,
                lineStart=r.line_start,
                lineEnd=r.line_end,
                output=[OutputItem(type=o.type, text=o.text) for o in r.output],
                isInvisible=r.is_invisible
            )
            for r in results
        ]
    )


@app.post("/execute", response_model=ExecuteResponse)
async def execute(request: ExecuteRequest) -> ExecuteResponse:
    """Execute pre-parsed Python statements and return results."""
    executor = get_executor()

    # Convert API statements to executor statements
    executor_statements = [stmt.to_executor_statement() for stmt in request.statements]

    results = executor.execute_statements(executor_statements, request.lineRange)

    return ExecuteResponse(
        results=[
            ExpressionResult(
                nodeIndex=r.node_index,
                lineStart=r.line_start,
                lineEnd=r.line_end,
                output=[OutputItem(type=o.type, text=o.text) for o in r.output],
                isInvisible=r.is_invisible
            )
            for r in results
        ]
    )


@app.post("/reset")
async def reset():
    """Reset the execution namespace."""
    reset_executor()
    return {"status": "ok"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
