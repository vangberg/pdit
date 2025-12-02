"""
Core Python execution logic for rdit.

This module provides the PythonExecutor class which handles:
- Parsing Python scripts into statements using AST
- Executing statements with output capture
- Maintaining execution namespace (like Jupyter kernels)
"""

import ast
import io
import re
import traceback
from contextlib import redirect_stdout, redirect_stderr
from dataclasses import dataclass
from types import CodeType
from typing import Any, Dict, Generator, List, Optional


@dataclass
class OutputItem:
    """Single output item (stdout, stderr, error, markdown, or dataframe)."""
    type: str  # 'stdout', 'stderr', 'error', 'markdown', or 'dataframe'
    text: str


def _is_dataframe(obj: Any) -> bool:
    """Check if object is a pandas or polars DataFrame."""
    type_name = type(obj).__name__
    module = type(obj).__module__

    # Check for pandas DataFrame
    if type_name == 'DataFrame' and module.startswith('pandas'):
        return True

    # Check for polars DataFrame
    if type_name == 'DataFrame' and module.startswith('polars'):
        return True

    return False


def _serialize_dataframe(df: Any) -> str:
    """Serialize a pandas or polars DataFrame to JSON.

    Returns JSON with structure: { "columns": [...], "data": [[...], ...] }
    Handles datetime, categorical, and missing values appropriately.
    """
    import json

    module = type(df).__module__

    if module.startswith('pandas'):
        return _serialize_pandas_dataframe(df)
    elif module.startswith('polars'):
        return _serialize_polars_dataframe(df)
    else:
        raise ValueError(f"Unknown dataframe type: {module}")


def _serialize_pandas_dataframe(df: Any) -> str:
    """Serialize a pandas DataFrame to JSON."""
    import json

    columns = df.columns.tolist()
    data = []

    for _, row in df.iterrows():
        row_data = []
        for val in row:
            row_data.append(_serialize_value(val))
        data.append(row_data)

    return json.dumps({"columns": columns, "data": data})


def _serialize_polars_dataframe(df: Any) -> str:
    """Serialize a polars DataFrame to JSON."""
    import json

    columns = df.columns
    data = []

    # Convert to rows
    for row in df.iter_rows():
        row_data = [_serialize_value(val) for val in row]
        data.append(row_data)

    return json.dumps({"columns": columns, "data": data})


def _serialize_value(val: Any) -> Any:
    """Serialize a single value, handling special types."""
    import math

    # Handle None/null
    if val is None:
        return None

    # Handle pandas NA types
    try:
        import pandas as pd
        if pd.isna(val):
            return None
    except (ImportError, TypeError, ValueError):
        pass

    # Handle float NaN/Inf
    if isinstance(val, float):
        if math.isnan(val):
            return None
        if math.isinf(val):
            return str(val)  # "inf" or "-inf"

    # Handle datetime types
    type_name = type(val).__name__
    if type_name in ('datetime', 'Timestamp', 'datetime64'):
        return str(val)
    if type_name == 'date':
        return str(val)
    if type_name == 'time':
        return str(val)
    if type_name == 'timedelta':
        return str(val)

    # Handle numpy types
    if hasattr(val, 'item'):  # numpy scalar
        return val.item()

    # Handle categorical - convert to string
    if type_name == 'Categorical':
        return str(val)

    # Basic types pass through
    if isinstance(val, (str, int, bool)):
        return val

    # Fallback: convert to string
    return str(val)


@dataclass
class Statement:
    """Parsed and compiled Python statement."""
    compiled: CodeType
    node_index: int
    line_start: int
    line_end: int
    is_expr: bool
    is_markdown_cell: bool = False


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

        Args:
            script: Python source code to parse

        Returns:
            List of compiled statements with metadata

        Raises:
            SyntaxError: If the script has syntax errors
        """
        tree = ast.parse(script)
        statements = []
        lines = script.split('\n')

        for i, node in enumerate(tree.body):
            # Get line range for UI display
            line_start = node.lineno
            line_end = node.end_lineno or node.lineno

            # Compile AST node directly
            is_expr = isinstance(node, ast.Expr)
            is_markdown_cell = False

            # Check if this is a string expression preceded by markdown cell marker
            if is_expr and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                # Look for # %% [markdown] marker within 3 lines before the expression
                is_markdown_cell = self._has_markdown_marker(lines, line_start)

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
                is_expr=is_expr,
                is_markdown_cell=is_markdown_cell
            ))

        return statements

    def _has_markdown_marker(self, lines: List[str], expr_line: int) -> bool:
        """Check if there's a markdown cell marker within 3 lines before the expression.

        Looks for '# %% [markdown]' pattern in comments.

        Args:
            lines: List of source code lines (0-indexed)
            expr_line: 1-based line number of the expression

        Returns:
            True if a markdown marker is found
        """
        # Pattern matches: # %% [markdown] with optional whitespace
        marker_pattern = re.compile(r'^\s*#\s*%%\s*\[markdown\]', re.IGNORECASE)

        # Check up to 3 lines before (lines is 0-indexed, expr_line is 1-indexed)
        start_idx = max(0, expr_line - 4)  # -4 because expr_line is 1-indexed
        end_idx = expr_line - 1  # Line before the expression

        for idx in range(start_idx, end_idx):
            if idx < len(lines) and marker_pattern.match(lines[idx]):
                return True

        return False

    def execute_statement(
        self, compiled: CodeType, is_expr: bool, is_markdown_cell: bool = False
    ) -> List[OutputItem]:
        """Execute pre-compiled statement with output capture.

        Args:
            compiled: Pre-compiled code object
            is_expr: Whether this is an expression (for result printing)
            is_markdown_cell: Whether this is a markdown cell (output as markdown, not repr)

        Returns:
            List of output items (stdout, stderr, errors, markdown)
        """
        output = []
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()

        try:
            with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
                # Always use eval() - works for both exec and eval compiled code
                result = eval(compiled, self.namespace)

                # For markdown cells, output the string content as markdown
                if is_markdown_cell and result is not None:
                    # Strip the string and output as markdown
                    markdown_text = str(result).strip()
                    output.append(OutputItem(type="markdown", text=markdown_text))
                # For DataFrames, output as serialized JSON
                elif is_expr and result is not None and _is_dataframe(result):
                    json_data = _serialize_dataframe(result)
                    output.append(OutputItem(type="dataframe", text=json_data))
                # For regular expressions, print result if not None
                elif is_expr and result is not None:
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
    ) -> Generator[ExecutionResult, None, None]:
        """Execute Python script, yielding results as each statement completes.

        Args:
            script: Python source code to execute
            line_range: Optional (from, to) line range (1-based, inclusive)

        Yields:
            ExecutionResult for each statement as it completes.
            If there's a syntax error, yields a single result with the error.
        """
        # Parse script into statements
        try:
            statements = self.parse_script(script)
        except SyntaxError as e:
            # Yield syntax error as an execution result
            error_line = e.lineno or 1
            error_buffer = io.StringIO()
            traceback.print_exc(file=error_buffer)

            yield ExecutionResult(
                node_index=0,
                line_start=error_line,
                line_end=error_line,
                output=[OutputItem(type="error", text=error_buffer.getvalue())],
                is_invisible=False
            )
            return

        # Unpack line range once if specified
        from_line = to_line = None
        if line_range:
            from_line, to_line = line_range

        for stmt in statements:
            # Filter by line range if specified
            if line_range:
                # Skip statements that don't overlap with requested range
                if stmt.line_end < from_line or stmt.line_start > to_line:
                    continue

            # Execute statement
            output = self.execute_statement(stmt.compiled, stmt.is_expr, stmt.is_markdown_cell)

            # Determine if output is invisible (no stdout/stderr/errors)
            is_invisible = len(output) == 0

            # Yield result immediately after execution
            yield ExecutionResult(
                node_index=stmt.node_index,
                line_start=stmt.line_start,
                line_end=stmt.line_end,
                output=output,
                is_invisible=is_invisible
            )

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
