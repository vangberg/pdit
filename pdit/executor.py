"""
Core Python execution logic for pdit.

This module provides the PythonExecutor class which handles:
- Parsing Python scripts into statements using AST
- Executing statements with output capture
- Maintaining execution namespace (like Jupyter kernels)
"""

import ast
import base64
import io
import re
import sys
import traceback
from contextlib import redirect_stdout, redirect_stderr
from dataclasses import dataclass
from types import CodeType
from typing import Any, Dict, Generator, List, Optional


# Module-level verbose mode flag
_verbose_mode = False
_current_script_name = None


def set_verbose_mode(verbose: bool) -> None:
    """Set verbose mode for printing execution details to stdout/stderr."""
    global _verbose_mode
    _verbose_mode = verbose


def set_script_name(script_name: Optional[str]) -> None:
    """Set the current script name for verbose output."""
    global _current_script_name
    _current_script_name = script_name


@dataclass
class OutputItem:
    """Single output item (stdout, stderr, error, markdown, dataframe, or image)."""
    type: str  # 'stdout', 'stderr', 'error', 'markdown', 'dataframe', or 'image'
    content: str


def _is_dataframe(obj: Any) -> bool:
    """Check if object is a pandas or polars DataFrame."""
    type_name = type(obj).__name__
    module = type(obj).__module__

    # Check for pandas DataFrame (e.g., pandas.core.frame.DataFrame)
    if type_name == 'DataFrame' and 'pandas' in module.split('.'):
        return True

    # Check for polars DataFrame (e.g., polars.dataframe.frame.DataFrame)
    if type_name == 'DataFrame' and 'polars' in module.split('.'):
        return True

    return False


def _is_matplotlib_axes_or_figure(obj: Any) -> bool:
    """Check if object is a matplotlib Axes or Figure.

    Returns True if obj is a matplotlib Axes or Figure object.
    """
    type_name = type(obj).__name__
    module = type(obj).__module__

    # Check for matplotlib Axes (e.g., matplotlib.axes._axes.Axes)
    if type_name == 'Axes' and 'matplotlib' in module.split('.'):
        return True

    # Check for matplotlib Figure (e.g., matplotlib.figure.Figure)
    if type_name == 'Figure' and 'matplotlib' in module.split('.'):
        return True

    # Check for Axes subclasses (Axes3D, etc.)
    if 'Axes' in type_name and 'matplotlib' in module.split('.'):
        return True

    return False


def _serialize_dataframe(df: Any) -> str:
    """Serialize a pandas or polars DataFrame to JSON.

    Returns JSON with structure: { "columns": [...], "data": [[...], ...] }
    Handles datetime, categorical, and missing values appropriately.
    """
    import json

    module = type(df).__module__
    module_parts = module.split('.')

    if 'pandas' in module_parts:
        return _serialize_pandas_dataframe(df)
    elif 'polars' in module_parts:
        return _serialize_polars_dataframe(df)
    else:
        raise ValueError(f"Unknown dataframe type: {module}")


def _serialize_pandas_dataframe(df: Any) -> str:
    """Serialize a pandas DataFrame to JSON."""
    import json

    # Handle MultiIndex columns (e.g., from groupby().describe())
    if hasattr(df.columns, 'levels'):
        # MultiIndex: convert tuples to strings like "Axis_count"
        columns = ['_'.join(str(level) for level in col) if isinstance(col, tuple) else str(col)
                   for col in df.columns]
    else:
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

    # Handle None/null first (cheapest check)
    if val is None:
        return None

    # Basic types pass through (fast path for common cases)
    if isinstance(val, (str, int, bool)):
        return val

    # Handle float NaN/Inf (before expensive pandas check)
    if isinstance(val, float):
        if math.isnan(val):
            return None
        if math.isinf(val):
            return str(val)  # "inf" or "-inf"
        return val

    # Handle numpy scalars (common in DataFrames)
    if hasattr(val, 'item'):  # numpy scalar
        return val.item()

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

    # Handle categorical - convert to string
    if type_name == 'Categorical':
        return str(val)

    # Handle pandas NA types (expensive, only if needed)
    try:
        import pandas as pd
        if pd.isna(val):
            return None
    except (ImportError, TypeError, ValueError):
        pass

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
    source: str  # Original source code for this statement
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

        # Set matplotlib to use non-interactive Agg backend to avoid display/segfault issues
        # This must be done before any user code imports matplotlib
        try:
            import matplotlib
            matplotlib.use('Agg')
        except ImportError:
            # matplotlib not installed, no problem
            pass

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

            # Extract source code for this statement (lines are 1-indexed)
            source_lines = lines[line_start - 1:line_end]
            source = '\n'.join(source_lines)

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
                    '<pdit>',
                    'eval'
                )
            else:
                # Statement: compile for exec()
                compiled = compile(
                    ast.Module(body=[node], type_ignores=[]),
                    '<pdit>',
                    'exec'
                )

            statements.append(Statement(
                compiled=compiled,
                node_index=i,
                line_start=line_start,
                line_end=line_end,
                is_expr=is_expr,
                source=source,
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

    def capture_matplotlib_figures(self, mpl_object: Any) -> List[OutputItem]:
        """Capture the matplotlib figure associated with an Axes or Figure object.

        Args:
            mpl_object: A matplotlib Axes or Figure object

        Returns:
            List containing one OutputItem with type='image' and base64-encoded PNG content
        """
        images = []

        try:
            import matplotlib
            import sys
            # Set Agg backend if pyplot hasn't been imported yet
            # (handles case where matplotlib was installed after executor initialization)
            if 'matplotlib.pyplot' not in sys.modules:
                matplotlib.use('Agg')
            import matplotlib.pyplot as plt
        except ImportError:
            # matplotlib not installed, no images to capture
            return images

        # Get the figure from the matplotlib object
        type_name = type(mpl_object).__name__
        if type_name == 'Figure' or 'Figure' in type_name:
            fig = mpl_object
        else:
            # It's an Axes object, get its figure
            fig = mpl_object.figure

        # Check if figure has any axes with content
        if fig.get_axes():
            # Save figure to bytes buffer
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight')
            buf.seek(0)

            # Encode as base64 data URL
            img_base64 = base64.b64encode(buf.read()).decode('utf-8')
            img_data_url = f"data:image/png;base64,{img_base64}"
            images.append(OutputItem(type="image", content=img_data_url))

            buf.close()

        # Close the figure to free memory
        plt.close(fig)

        return images

    def execute_statement(
        self,
        compiled: CodeType,
        is_expr: bool,
        source: str,
        line_start: int,
        line_end: int,
        is_markdown_cell: bool = False
    ) -> List[OutputItem]:
        """Execute pre-compiled statement with output capture.

        Args:
            compiled: Pre-compiled code object
            is_expr: Whether this is an expression (for result printing)
            source: Original source code for this statement
            line_start: Starting line number (1-based)
            line_end: Ending line number (1-based)
            is_markdown_cell: Whether this is a markdown cell (output as markdown, not repr)

        Returns:
            List of output items (stdout, stderr, errors, markdown, dataframes, images)
        """
        # Print statement info in verbose mode
        if _verbose_mode:
            script_info = f"[{_current_script_name}] " if _current_script_name else ""
            # Print each line with >>> prefix (like Python REPL)
            source_lines = source.split('\n')
            for line in source_lines:
                print(f"{script_info}>>> {line}", file=sys.stderr)

        output = []
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()

        # Save and replace sys.argv to hide CLI arguments from executed code
        # (notebook environment should not expose script filename as argv)
        original_argv = sys.argv
        sys.argv = ['']

        try:
            with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
                # Always use eval() - works for both exec and eval compiled code
                result = eval(compiled, self.namespace)

                # For markdown cells, output the string content as markdown
                if is_markdown_cell and result is not None:
                    # Strip the string and output as markdown
                    markdown_text = str(result).strip()
                    output.append(OutputItem(type="markdown", content=markdown_text))
                # For DataFrames, output as serialized JSON
                elif is_expr and result is not None and _is_dataframe(result):
                    json_data = _serialize_dataframe(result)
                    output.append(OutputItem(type="dataframe", content=json_data))
                # For matplotlib Axes/Figure, capture the plot immediately
                elif is_expr and result is not None and _is_matplotlib_axes_or_figure(result):
                    # Capture happens here, inside the try block
                    # Note: We do this INSIDE the with redirect block, but capture_matplotlib_figures
                    # doesn't produce stdout/stderr, so this is fine
                    output.extend(self.capture_matplotlib_figures(result))
                # For regular expressions, print result if not None
                elif is_expr and result is not None:
                    print(repr(result))

        except Exception:
            # Capture full traceback
            error_buffer = io.StringIO()
            traceback.print_exc(file=error_buffer)
            error_content = error_buffer.getvalue()
            output.append(OutputItem(type="error", content=error_content))

            # Print error to stderr in verbose mode
            if _verbose_mode:
                print(error_content, file=sys.stderr, end='')

        finally:
            # Restore original sys.argv
            sys.argv = original_argv

        # Capture stdout output
        stdout_content = stdout_buffer.getvalue()
        if stdout_content:
            output.append(OutputItem(type="stdout", content=stdout_content))
            # Print to actual stdout in verbose mode
            if _verbose_mode:
                print(stdout_content, end='')

        # Capture stderr output
        stderr_content = stderr_buffer.getvalue()
        if stderr_content:
            output.append(OutputItem(type="stderr", content=stderr_content))
            # Print to actual stderr in verbose mode
            if _verbose_mode:
                print(stderr_content, file=sys.stderr, end='')

        return output

    def execute_script(
        self,
        script: str,
        line_range: Optional[tuple[int, int]] = None,
        script_name: Optional[str] = None
    ) -> Generator[ExecutionResult, None, None]:
        """Execute Python script, yielding results as each statement completes.

        Args:
            script: Python source code to execute
            line_range: Optional (from, to) line range (1-based, inclusive)
            script_name: Optional script name for verbose output

        Yields:
            ExecutionResult for each statement as it completes.
            If there's a syntax error, yields a single result with the error.
        """
        # Set script name for verbose output
        set_script_name(script_name)
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
                output=[OutputItem(type="error", content=error_buffer.getvalue())],
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
            output = self.execute_statement(
                stmt.compiled,
                stmt.is_expr,
                stmt.source,
                stmt.line_start,
                stmt.line_end,
                stmt.is_markdown_cell
            )

            # Determine if output is invisible (no output items at all)
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
