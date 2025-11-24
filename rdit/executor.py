"""
Core Python execution logic for rdit.

This module provides the PythonExecutor class which handles:
- Parsing Python scripts into statements using AST
- Executing statements with output capture
- Maintaining execution namespace (like Jupyter kernels)
"""

import ast
import io
import traceback
from contextlib import redirect_stdout, redirect_stderr
from dataclasses import dataclass
from types import CodeType
from typing import Any, Dict, List, Optional


@dataclass
class OutputItem:
    """Single output item (stdout, stderr, or error)."""
    type: str  # 'stdout', 'stderr', or 'error'
    text: str


@dataclass
class Statement:
    """Parsed and compiled Python statement."""
    compiled: CodeType
    node_index: int
    line_start: int
    line_end: int
    is_expr: bool


@dataclass
class ExecutionResult:
    """Result of executing a single statement."""
    node_index: int
    line_start: int
    line_end: int
    output: List[OutputItem]
    is_invisible: bool


class PythonExecutor:
    """Stateful Python executor with namespace management."""

    def __init__(self):
        """Initialize executor with empty namespace."""
        self.namespace: Dict[str, Any] = {'__builtins__': __builtins__}

    def parse_script(self, script: str) -> List[Statement]:
        """Parse Python script into statements using AST.

        Compiles each AST node directly - no source extraction needed!
        This matches the working Pyodide implementation.

        Args:
            script: Python source code to parse

        Returns:
            List of compiled statements with metadata

        Raises:
            SyntaxError: If the script has syntax errors
        """
        tree = ast.parse(script)
        statements = []

        for i, node in enumerate(tree.body):
            # Get line range for UI display
            line_start = node.lineno
            line_end = node.end_lineno or node.lineno

            # Compile AST node directly
            is_expr = isinstance(node, ast.Expr)
            if is_expr:
                # Expression: compile for eval()
                compiled = compile(
                    ast.Expression(body=node.value),
                    '<rdit>',
                    'eval'
                )
            else:
                # Statement: compile for exec()
                compiled = compile(
                    ast.Module(body=[node], type_ignores=[]),
                    '<rdit>',
                    'exec'
                )

            statements.append(Statement(
                compiled=compiled,
                node_index=i,
                line_start=line_start,
                line_end=line_end,
                is_expr=is_expr
            ))

        return statements

    def execute_statement(self, compiled: CodeType, is_expr: bool) -> List[OutputItem]:
        """Execute pre-compiled statement with output capture.

        Args:
            compiled: Pre-compiled code object
            is_expr: Whether this is an expression (for result printing)

        Returns:
            List of output items (stdout, stderr, errors)
        """
        output = []
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()

        try:
            with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
                # Always use eval() - works for both exec and eval compiled code
                result = eval(compiled, self.namespace)

                # For expressions, print result if not None
                if is_expr and result is not None:
                    print(repr(result))

        except Exception:
            # Capture full traceback
            error_buffer = io.StringIO()
            traceback.print_exc(file=error_buffer)
            output.append(OutputItem(type="error", text=error_buffer.getvalue()))

        # Capture stdout output
        stdout_content = stdout_buffer.getvalue()
        if stdout_content:
            output.append(OutputItem(type="stdout", text=stdout_content))

        # Capture stderr output
        stderr_content = stderr_buffer.getvalue()
        if stderr_content:
            output.append(OutputItem(type="stderr", text=stderr_content))

        return output

    def execute_script(
        self,
        script: str,
        line_range: Optional[tuple[int, int]] = None
    ) -> List[ExecutionResult]:
        """Execute Python script, optionally filtered by line range.

        Args:
            script: Python source code to execute
            line_range: Optional (from, to) line range (1-based, inclusive)

        Returns:
            List of execution results for each statement.
            If there's a syntax error, returns a single result with the error.
        """
        # Parse script into statements
        try:
            statements = self.parse_script(script)
        except SyntaxError as e:
            # Return syntax error as an execution result
            error_line = e.lineno or 1
            error_buffer = io.StringIO()
            traceback.print_exc(file=error_buffer)

            return [ExecutionResult(
                node_index=0,
                line_start=error_line,
                line_end=error_line,
                output=[OutputItem(type="error", text=error_buffer.getvalue())],
                is_invisible=False
            )]

        # Unpack line range once if specified
        from_line = to_line = None
        if line_range:
            from_line, to_line = line_range

        results = []

        for stmt in statements:
            # Filter by line range if specified
            if line_range:
                # Skip statements that don't overlap with requested range
                if stmt.line_end < from_line or stmt.line_start > to_line:
                    continue

            # Execute statement
            output = self.execute_statement(stmt.compiled, stmt.is_expr)

            # Determine if output is invisible (no stdout/stderr/errors)
            is_invisible = len(output) == 0

            results.append(ExecutionResult(
                node_index=stmt.node_index,
                line_start=stmt.line_start,
                line_end=stmt.line_end,
                output=output,
                is_invisible=is_invisible
            ))

        return results

    def reset(self) -> None:
        """Reset the execution namespace (clear all variables)."""
        self.namespace.clear()
        self.namespace['__builtins__'] = __builtins__


# Singleton executor instance
_executor: Optional[PythonExecutor] = None


def get_executor() -> PythonExecutor:
    """Get the singleton executor instance."""
    global _executor
    if _executor is None:
        _executor = PythonExecutor()
    return _executor


def reset_executor() -> None:
    """Reset the singleton executor instance."""
    executor = get_executor()
    executor.reset()
