"""
xeus-python kernel executor using jupyter_client.

Uses xeus-python kernel with jupyter_client for reliable messaging.
"""

import ast
import io
import json
import re
import traceback
from dataclasses import dataclass
from typing import Any, Dict, Generator, List, Optional, Union

from jupyter_client import KernelManager
from jupyter_client.blocking import BlockingKernelClient

from .executor import (
    ExpressionInfo,
    ExecutionResult,
    OutputItem,
    _has_trailing_semicolon,
)

# Custom DataTables styling to match pdit design
DATATABLE_STYLES = """
/* pdit custom styling for DataTables */
body {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  background: #ffffff;
  margin: 20px;
}

/* Table styling */
table.dataTable {
  border-collapse: collapse !important;
  font-size: 13px !important;
  font-family: 'Fira Code', Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
  border: 1px solid #e5e7eb !important;
}

/* Header styling */
table.dataTable thead th {
  background: #f9fafb !important;
  font-weight: 600 !important;
  color: #374151 !important;
  border: 1px solid #e5e7eb !important;
  padding: 6px 8px !important;
  font-size: 12px !important;
  text-align: left !important;
}

/* Cell styling */
table.dataTable tbody td {
  padding: 4px 8px !important;
  border: 1px solid #e5e7eb !important;
  color: #4b5563 !important;
  background: #ffffff !important;
}

/* Row hover */
table.dataTable tbody tr:hover td {
  background: #f3f4f6 !important;
}

/* Striped rows - remove default striping */
table.dataTable.stripe tbody tr.odd,
table.dataTable.display tbody tr.odd {
  background: #ffffff !important;
}

table.dataTable.stripe tbody tr.odd:hover,
table.dataTable.display tbody tr.odd:hover {
  background: #f3f4f6 !important;
}

/* DataTables controls wrapper */
div.dt-container {
  font-family: 'Fira Code', Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
  font-size: 11px !important;
}

/* Search input */
div.dt-search input {
  background: transparent !important;
  border: 1px solid #d1d5db !important;
  border-radius: 2px !important;
  padding: 2px 6px !important;
  font-size: 11px !important;
  font-family: 'Fira Code', Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
  color: #4b5563 !important;
  height: 22px !important;
}

div.dt-search input:hover {
  border-color: #9ca3af !important;
}

div.dt-search input:focus {
  outline: none !important;
  border-color: #3b82f6 !important;
  background: #f0f9ff !important;
}

/* Page length select */
div.dt-length select {
  background: transparent !important;
  border: 1px solid #d1d5db !important;
  border-radius: 2px !important;
  padding: 2px 6px !important;
  font-size: 11px !important;
  font-family: 'Fira Code', Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
  color: #4b5563 !important;
  height: 22px !important;
}

div.dt-length select:hover {
  border-color: #9ca3af !important;
}

div.dt-length select:focus {
  outline: none !important;
  border-color: #3b82f6 !important;
  background: #f0f9ff !important;
}

/* Pagination buttons */
div.dt-paging button {
  background: transparent !important;
  border: 1px solid #d1d5db !important;
  border-radius: 2px !important;
  padding: 2px 8px !important;
  font-size: 11px !important;
  cursor: pointer !important;
  color: #4b5563 !important;
  font-family: 'Fira Code', Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
  transition: all 0.15s !important;
  height: 22px !important;
  margin: 0 1px !important;
}

div.dt-paging button:hover:not(.disabled) {
  background: #e5e7eb !important;
  border-color: #9ca3af !important;
  color: #374151 !important;
}

div.dt-paging button.disabled {
  cursor: not-allowed !important;
  color: #d1d5db !important;
  border-color: #e5e7eb !important;
  opacity: 0.6 !important;
}

div.dt-paging button.current {
  background: #3b82f6 !important;
  border-color: #3b82f6 !important;
  color: #ffffff !important;
}

/* Info text */
div.dt-info {
  color: #6b7280 !important;
  font-size: 11px !important;
  font-family: 'Fira Code', Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
}

/* Layout adjustments */
div.dt-layout-row {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  padding: 4px 0 !important;
}

div.dt-layout-cell {
  padding: 2px !important;
}

/* Remove default table styles that might conflict */
table.dataTable.no-footer {
  border-bottom: 1px solid #e5e7eb !important;
}

/* Sort icons */
table.dataTable thead th.dt-orderable-asc,
table.dataTable thead th.dt-orderable-desc,
table.dataTable thead th.dt-ordering-asc,
table.dataTable thead th.dt-ordering-desc {
  background: #f3f4f6 !important;
}

/* Small type labels under headers */
small.itables-dtype {
  color: #9ca3af !important;
  font-size: 10px !important;
}

/* Loading message styling */
table tbody td {
  vertical-align: middle !important;
}

table tbody td a {
  color: #2563eb !important;
  text-decoration: none !important;
}

table tbody td a:hover {
  text-decoration: underline !important;
}
"""


@dataclass
class Statement:
    """Parsed Python statement."""
    node_index: int
    line_start: int
    line_end: int
    source: str
    is_expr: bool
    is_markdown_cell: bool = False
    suppress_output: bool = False


class XeusPythonExecutor:
    """Python executor using xeus-python kernel."""

    def __init__(self):
        """Initialize executor and start xeus-python kernel."""
        self.km: Optional[KernelManager] = None
        self.kc: Optional[BlockingKernelClient] = None
        self._start_kernel()

    def _start_kernel(self) -> None:
        """Start xeus-python kernel."""
        # Use xpython kernel
        self.km = KernelManager(kernel_name='xpython')
        self.km.start_kernel()
        self.kc = self.km.client()
        self.kc.start_channels()
        # Wait for kernel to be ready
        self.kc.wait_for_ready(timeout=30)
        # Register display formatters
        self._register_display_formatters()


    def _execute_silent(self, code: str) -> None:
        """Execute code without capturing output (for setup)."""
        if self.kc is None:
            return
        msg_id = self.kc.execute(code, silent=True)
        # Wait for execution to complete
        while True:
            try:
                msg = self.kc.get_iopub_msg(timeout=5)
                if msg['parent_header'].get('msg_id') == msg_id:
                    if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                        break
            except Exception:
                break

    def _register_display_formatters(self) -> None:
        """Register custom display formatters for DataFrames."""
        # Escape the CSS for safe embedding in Python code
        css_escaped = DATATABLE_STYLES.replace('\\', '\\\\').replace("'", "\\'")

        formatter_code = f"""
import IPython
import itables

STYLES = '''{css_escaped}'''

def format_with_styles(df, include=None, exclude=None):
    html = itables.to_html_datatable(df, display_logo_when_loading=False)
    return f'<style>{{STYLES}}</style>{{html}}'

IPython.get_ipython().display_formatter.formatters['text/html'].for_type_by_name('polars.dataframe.frame', 'DataFrame', format_with_styles)
IPython.get_ipython().display_formatter.formatters['text/html'].for_type_by_name('pandas.core.frame', 'DataFrame', format_with_styles)
"""
        self._execute_silent(formatter_code)

    def _parse_script(self, script: str) -> List[Statement]:
        """Parse Python script into statements using AST."""
        tree = ast.parse(script)
        statements = []
        lines = script.split('\n')

        for i, node in enumerate(tree.body):
            line_start = node.lineno
            line_end = node.end_lineno or node.lineno

            # Extract source
            source_lines = lines[line_start - 1:line_end]
            source = '\n'.join(source_lines)

            is_expr = isinstance(node, ast.Expr)
            is_markdown_cell = is_expr and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)
            suppress_output = _has_trailing_semicolon(lines, node)

            statements.append(Statement(
                node_index=i,
                line_start=line_start,
                line_end=line_end,
                source=source,
                is_expr=is_expr,
                is_markdown_cell=is_markdown_cell,
                suppress_output=suppress_output
            ))

        return statements

    def _strip_ansi(self, text: str) -> str:
        """Strip ANSI escape codes from text."""
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)

    def _process_mime_data(self, data: Dict) -> List[OutputItem]:
        """Process MIME bundle data into OutputItems.

        Passes through MIME types directly instead of translating to custom types.
        Uses priority order: image > html > json > plain text.
        """
        output: List[OutputItem] = []

        # Priority order for MIME types - pass through directly
        if 'image/png' in data:
            output.append(OutputItem(type="image/png", content=data['image/png']))
        elif 'text/html' in data:
            output.append(OutputItem(type="text/html", content=data['text/html']))
        elif 'application/json' in data:
            json_data = data['application/json']
            output.append(OutputItem(type="application/json", content=json.dumps(json_data)))
        elif 'text/plain' in data:
            output.append(OutputItem(type="text/plain", content=data['text/plain']))

        return output

    def _execute_code(self, code: str, suppress_output: bool = False) -> List[OutputItem]:
        """Execute code in kernel and collect output."""
        if self.kc is None:
            return [OutputItem(type="error", content="Kernel not started")]

        output: List[OutputItem] = []

        # Add semicolon to suppress output if needed (IPython convention)
        if suppress_output and not code.rstrip().endswith(';'):
            code = code.rstrip() + ';'

        msg_id = self.kc.execute(code)

        # Collect output messages
        while True:
            try:
                msg = self.kc.get_iopub_msg(timeout=30)
            except Exception as e:
                output.append(OutputItem(type="error", content=f"Timeout waiting for kernel: {e}"))
                break

            # Only process messages for our execution
            if msg['parent_header'].get('msg_id') != msg_id:
                continue

            msg_type = msg['msg_type']
            content = msg['content']

            if msg_type == 'status' and content['execution_state'] == 'idle':
                # Execution complete
                break
            elif msg_type == 'stream':
                # stdout/stderr
                stream_name = content['name']  # 'stdout' or 'stderr'
                text = content['text']
                output.append(OutputItem(type=stream_name, content=text))
            elif msg_type == 'execute_result':
                # Expression result
                data = content['data']
                output.extend(self._process_mime_data(data))
            elif msg_type == 'display_data':
                # Display output (plots, etc.)
                data = content['data']
                output.extend(self._process_mime_data(data))
            elif msg_type == 'error':
                # Exception
                ename = content['ename']
                evalue = content['evalue']
                tb = '\n'.join(content['traceback'])
                # Strip ANSI codes from traceback
                tb = self._strip_ansi(tb)
                output.append(OutputItem(type="error", content=f"{tb}"))

        return output

    def execute_script(
        self,
        script: str,
        line_range: Optional[tuple[int, int]] = None,
        script_name: Optional[str] = None
    ) -> Generator[Union[List[ExpressionInfo], ExecutionResult], None, None]:
        """Execute Python script, yielding results as each statement completes."""
        # Parse script
        try:
            statements = self._parse_script(script)
        except SyntaxError as e:
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

        # Filter by line range
        from_line = to_line = None
        if line_range:
            from_line, to_line = line_range

        filtered = []
        for stmt in statements:
            if line_range:
                if stmt.line_end < from_line or stmt.line_start > to_line:
                    continue
            filtered.append(stmt)

        # Yield expression info
        yield [
            ExpressionInfo(
                node_index=stmt.node_index,
                line_start=stmt.line_start,
                line_end=stmt.line_end
            )
            for stmt in filtered
        ]

        # Execute each statement
        for stmt in filtered:
            if stmt.is_markdown_cell:
                # For markdown cells, just return the string content
                # Strip quotes and output as markdown
                try:
                    # Evaluate the string literal to get its value
                    value = ast.literal_eval(stmt.source)
                    output = [OutputItem(type="text/markdown", content=str(value).strip())]
                except:
                    output = self._execute_code(stmt.source, stmt.suppress_output)
            else:
                output = self._execute_code(stmt.source, stmt.suppress_output)

            yield ExecutionResult(
                node_index=stmt.node_index,
                line_start=stmt.line_start,
                line_end=stmt.line_end,
                output=output,
                is_invisible=len(output) == 0
            )

    def reset(self) -> None:
        """Reset the kernel (restart it)."""
        if self.km:
            self.km.restart_kernel()
            if self.kc:
                self.kc.stop_channels()
            self.kc = self.km.client()
            self.kc.start_channels()
            self.kc.wait_for_ready(timeout=30)
            # Re-register display formatters after restart
            self._register_display_formatters()

    def shutdown(self) -> None:
        """Shutdown the kernel."""
        if self.kc:
            self.kc.stop_channels()
        if self.km:
            self.km.shutdown_kernel(now=True)

    def __del__(self):
        """Cleanup on deletion."""
        try:
            self.shutdown()
        except:
            pass
