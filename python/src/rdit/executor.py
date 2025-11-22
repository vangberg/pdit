"""
Core Python execution logic shared between Pyodide and server backends.

This module provides the fundamental code execution, parsing, and output
capture functionality used by both the browser-based (Pyodide) and
server-based (FastAPI) backends.
"""

import ast
import io
import sys
import traceback
from contextlib import redirect_stdout, redirect_stderr
from typing import Any, Dict, List, Optional


class OutputItem:
    """Represents a single output item (stdout, stderr, or error)."""

    def __init__(self, type: str, text: str):
        self.type = type  # 'stdout' | 'stderr' | 'error'
        self.text = text

    def to_dict(self) -> Dict[str, str]:
        return {"type": self.type, "text": self.text}


class Statement:
    """Represents a parsed Python statement."""

    def __init__(self, code: str, node_index: int, line_start: int,
                 line_end: int, is_expr: bool):
        self.code = code
        self.node_index = node_index
        self.line_start = line_start
        self.line_end = line_end
        self.is_expr = is_expr

    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "nodeIndex": self.node_index,
            "lineStart": self.line_start,
            "lineEnd": self.line_end,
            "isExpr": self.is_expr
        }


class ExecutionResult:
    """Represents the result of executing a statement."""

    def __init__(self, node_index: int, line_start: int, line_end: int,
                 output: List[OutputItem], is_invisible: bool):
        self.node_index = node_index
        self.line_start = line_start
        self.line_end = line_end
        self.output = output
        self.is_invisible = is_invisible

    def to_dict(self) -> Dict[str, Any]:
        return {
            "nodeIndex": self.node_index,
            "lineStart": self.line_start,
            "lineEnd": self.line_end,
            "output": [o.to_dict() for o in self.output],
            "isInvisible": self.is_invisible
        }


class PythonExecutor:
    """Executes Python code and manages execution namespace."""

    def __init__(self):
        """Initialize with a fresh namespace."""
        self.namespace: Dict[str, Any] = {'__builtins__': __builtins__}

    def reset(self) -> None:
        """Clear the execution namespace."""
        self.namespace.clear()
        self.namespace['__builtins__'] = __builtins__

    def parse_script(self, script: str) -> List[Statement]:
        """
        Parse a Python script into statements using AST.

        Returns a list of Statement objects with line numbers and metadata.
        """
        try:
            tree = ast.parse(script)
            statements = []

            for i, node in enumerate(tree.body):
                # Get line range for this statement
                line_start = node.lineno
                line_end = node.end_lineno if hasattr(node, 'end_lineno') and node.end_lineno else node.lineno

                # Extract code for this statement
                lines = script.split('\n')
                code_lines = lines[line_start - 1:line_end]
                code = '\n'.join(code_lines)

                # Check if it's an expression
                is_expr = isinstance(node, ast.Expr)

                statements.append(Statement(
                    code=code,
                    node_index=i,
                    line_start=line_start,
                    line_end=line_end,
                    is_expr=is_expr
                ))

            return statements

        except SyntaxError as e:
            # If there's a syntax error, return whole script as one statement
            return [Statement(
                code=script,
                node_index=0,
                line_start=1,
                line_end=len(script.split('\n')),
                is_expr=False
            )]

    def execute_statement(self, code: str, is_expr: bool) -> List[OutputItem]:
        """
        Execute a single Python statement and capture output.

        Args:
            code: The Python code to execute
            is_expr: True if this is an expression (should print result)

        Returns:
            List of OutputItem objects with captured output
        """
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
                    result = eval(compiled, self.namespace)
                    # For expressions, print result if not None
                    if result is not None:
                        print(repr(result))
                else:
                    exec(compiled, self.namespace)

        except Exception as e:
            # Capture full traceback
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

    def execute_script(self, script: str,
                      line_range: Optional[Dict[str, int]] = None) -> List[ExecutionResult]:
        """
        Parse and execute a complete Python script.

        Args:
            script: The Python script to execute
            line_range: Optional dict with 'from' and 'to' keys to filter statements

        Returns:
            List of ExecutionResult objects
        """
        statements = self.parse_script(script)
        return self.execute_statements(statements, line_range)

    def execute_statements(self, statements: List[Statement],
                          line_range: Optional[Dict[str, int]] = None) -> List[ExecutionResult]:
        """
        Execute a list of pre-parsed statements.

        Args:
            statements: List of Statement objects to execute
            line_range: Optional dict with 'from' and 'to' keys to filter statements

        Returns:
            List of ExecutionResult objects
        """
        results: List[ExecutionResult] = []

        for stmt in statements:
            # Filter by line range if specified
            if line_range:
                from_line = line_range.get("from", 0)
                to_line = line_range.get("to", float("inf"))
                if stmt.line_end < from_line or stmt.line_start > to_line:
                    continue

            # Execute statement
            output = self.execute_statement(stmt.code, stmt.is_expr)

            # Determine if output is invisible
            has_visible_output = len(output) > 0

            results.append(ExecutionResult(
                node_index=stmt.node_index,
                line_start=stmt.line_start,
                line_end=stmt.line_end,
                output=output,
                is_invisible=not has_visible_output
            ))

        return results


# Global executor instance for stateful execution
_global_executor: Optional[PythonExecutor] = None


def get_executor() -> PythonExecutor:
    """Get or create the global executor instance."""
    global _global_executor
    if _global_executor is None:
        _global_executor = PythonExecutor()
    return _global_executor


def reset_executor() -> None:
    """Reset the global executor."""
    executor = get_executor()
    executor.reset()
