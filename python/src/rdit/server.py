"""FastAPI server for executing Python code."""

import sys
import io
import ast
import json
import traceback
from contextlib import redirect_stdout, redirect_stderr
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI(title="rdit Python Backend")

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global namespace for code execution
_execution_namespace: Dict[str, Any] = {'__builtins__': __builtins__}


class OutputItem(BaseModel):
    type: str  # 'stdout' | 'stderr' | 'error' | 'warning' | 'message'
    text: str


class Statement(BaseModel):
    code: str
    nodeIndex: int
    lineStart: int
    lineEnd: int
    isExpr: bool


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


def parse_script(script: str) -> List[Statement]:
    """Parse Python script into statements using AST."""
    try:
        tree = ast.parse(script)
        statements = []

        for i, node in enumerate(tree.body):
            # Get the line range for this statement
            line_start = node.lineno
            line_end = node.end_lineno if hasattr(node, 'end_lineno') and node.end_lineno else node.lineno

            # Extract the code for this statement
            lines = script.split('\n')
            code_lines = lines[line_start - 1:line_end]
            code = '\n'.join(code_lines)

            # Check if it's an expression
            is_expr = isinstance(node, ast.Expr)

            statements.append(Statement(
                code=code,
                nodeIndex=i,
                lineStart=line_start,
                lineEnd=line_end,
                isExpr=is_expr
            ))

        return statements

    except SyntaxError as e:
        # If there's a syntax error, return the whole script as one statement
        return [Statement(
            code=script,
            nodeIndex=0,
            lineStart=1,
            lineEnd=len(script.split('\n')),
            isExpr=False
        )]


def execute_statement(code: str, is_expr: bool) -> List[OutputItem]:
    """Execute a single Python statement and capture output."""
    output: List[OutputItem] = []

    # Capture stdout and stderr
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()

    try:
        with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
            # Compile the code
            mode = 'eval' if is_expr else 'exec'
            compiled = compile(code, '<rdit>', mode)

            # Execute the code
            if is_expr:
                result = eval(compiled, _execution_namespace)
                # For expressions, print result if not None
                if result is not None:
                    print(repr(result))
            else:
                exec(compiled, _execution_namespace)

    except Exception as e:
        # Capture the full traceback
        error_buffer = io.StringIO()
        traceback.print_exc(file=error_buffer)
        output.append(OutputItem(
            type="error",
            text=error_buffer.getvalue()
        ))

    # Add stdout output
    stdout_content = stdout_buffer.getvalue()
    if stdout_content:
        output.append(OutputItem(type="stdout", text=stdout_content))

    # Add stderr output
    stderr_content = stderr_buffer.getvalue()
    if stderr_content:
        output.append(OutputItem(type="stderr", text=stderr_content))

    return output


@app.post("/execute-script", response_model=ExecuteResponse)
async def execute_script(request: ExecuteScriptRequest) -> ExecuteResponse:
    """Parse and execute a Python script, returning results."""
    # Parse the script into statements
    statements = parse_script(request.script)

    # Execute the statements
    return await execute_statements_internal(statements, request.lineRange)


@app.post("/execute", response_model=ExecuteResponse)
async def execute(request: ExecuteRequest) -> ExecuteResponse:
    """Execute pre-parsed Python statements and return results."""
    return await execute_statements_internal(request.statements, request.lineRange)


async def execute_statements_internal(
    statements: List[Statement],
    line_range: Optional[Dict[str, int]] = None
) -> ExecuteResponse:
    """Internal method to execute statements."""
    results: List[ExpressionResult] = []

    for stmt in statements:
        # Filter by line range if specified
        if line_range:
            from_line = line_range.get("from", 0)
            to_line = line_range.get("to", float("inf"))
            if stmt.lineEnd < from_line or stmt.lineStart > to_line:
                continue

        # Execute statement
        output = execute_statement(stmt.code, stmt.isExpr)

        # Determine if output is invisible
        has_visible_output = len(output) > 0

        results.append(ExpressionResult(
            nodeIndex=stmt.nodeIndex,
            lineStart=stmt.lineStart,
            lineEnd=stmt.lineEnd,
            output=output,
            isInvisible=not has_visible_output
        ))

    return ExecuteResponse(results=results)


@app.post("/reset")
async def reset():
    """Reset the execution namespace."""
    global _execution_namespace
    _execution_namespace.clear()
    # Re-add built-ins
    _execution_namespace['__builtins__'] = __builtins__
    return {"status": "ok"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}
