"""
IPython kernel executor using jupyter_client.

Uses IPython kernel with jupyter_client for reliable messaging.
"""

import ast
import io
import json
import logging
import re
import time
import traceback
from dataclasses import dataclass
from typing import Any, Dict, Generator, List, Optional, Union

from jupyter_client import KernelManager
from jupyter_client.blocking import BlockingKernelClient

from .executor import (
    ExpressionInfo,
    ExecutionResult,
    OutputItem,
)


logger = logging.getLogger(__name__)


@dataclass
class Statement:
    """Parsed Python statement."""
    node_index: int
    line_start: int
    line_end: int
    source: str
    is_expr: bool
    is_markdown_cell: bool = False


class IPythonExecutor:
    """Python executor using IPython kernel."""

    def __init__(self):
        """Initialize executor and start IPython kernel."""
        self.km: Optional[KernelManager] = None
        self.kc: Optional[BlockingKernelClient] = None
        self._start_kernel()

    def _start_kernel(self) -> None:
        """Start IPython kernel."""
        # Use python3 (IPython) kernel
        self.km = KernelManager(kernel_name='python3')
        self.km.start_kernel()
        self.kc = self.km.client()
        self.kc.start_channels()
        # Wait for kernel to be ready
        self.kc.wait_for_ready(timeout=30)
        # Register display formatters
        self._register_display_formatters()


    def _execute_silent(self, code: str) -> None:
        """Execute code without capturing output (for setup).

        Raises:
            Exception: If execution fails or times out
        """
        if self.kc is None:
            raise RuntimeError("Kernel client not initialized")
        msg_id = self.kc.execute(code, silent=True)
        # Wait for execution to complete by checking for 'idle' status on iopub
        # We need to handle messages that may not match our msg_id (from kernel startup)
        timeout_total = 30  # Total timeout in seconds
        start_time = time.time()
        while time.time() - start_time < timeout_total:
            try:
                msg = self.kc.get_iopub_msg(timeout=1)
                if msg['parent_header'].get('msg_id') == msg_id:
                    if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                        return
                    elif msg['msg_type'] == 'error':
                        raise RuntimeError(f"Silent execution failed: {msg['content']['ename']}: {msg['content']['evalue']}")
            except Exception:
                # Queue empty, keep waiting
                continue
        raise RuntimeError("Silent execution timed out")

    def _register_display_formatters(self) -> None:
        """Register custom display formatters for DataFrames."""
        formatter_code = """
def _register_pdit_formatter():
    import IPython
    import itables

    # Generate offline bundle
    OFFLINE_INIT = itables.javascript.generate_init_offline_itables_html(itables.options.dt_bundle)

    def format_datatable(df, include=None, exclude=None):
        html = itables.to_html_datatable(df, display_logo_when_loading=False, connected=False, layout={"topStart": None, "topEnd": None, "bottomStart": "search", "bottomEnd": "paging"})
        return f'{OFFLINE_INIT}{html}'

    ip = IPython.get_ipython()
    if ip:
        formatter = ip.display_formatter.formatters['text/html']
        formatter.for_type_by_name('polars.dataframe.frame', 'DataFrame', format_datatable)
        formatter.for_type_by_name('pandas.core.frame', 'DataFrame', format_datatable)

_register_pdit_formatter()
del _register_pdit_formatter
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

            statements.append(Statement(
                node_index=i,
                line_start=line_start,
                line_end=line_end,
                source=source,
                is_expr=is_expr,
                is_markdown_cell=is_markdown_cell
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
        # Check for any image type
        image_types = [k for k in data.keys() if k.startswith('image/')]
        if image_types:
            # Use first image type found (they're usually in priority order)
            mime_type = image_types[0]
            output.append(OutputItem(type=mime_type, content=data[mime_type]))
        elif 'text/html' in data:
            output.append(OutputItem(type="text/html", content=data['text/html']))
        elif 'application/json' in data:
            json_data = data['application/json']
            output.append(OutputItem(type="application/json", content=json.dumps(json_data)))
        elif 'text/plain' in data:
            output.append(OutputItem(type="text/plain", content=data['text/plain']))

        return output

    def _execute_code(self, code: str) -> List[OutputItem]:
        """Execute code in kernel and collect output."""
        if self.kc is None:
            return [OutputItem(type="error", content="Kernel not started")]

        output: List[OutputItem] = []

        msg_id = self.kc.execute(code)

        # Collect output messages (no timeout - code can run indefinitely)
        while True:
            msg = self.kc.get_iopub_msg()

            # Only process messages for our execution
            if msg['parent_header'].get('msg_id') != msg_id:
                continue

            msg_type = msg['msg_type']
            content = msg['content']

            if msg_type == 'status' and content['execution_state'] == 'idle':
                # Execution complete
                break
            elif msg_type == 'stream':
                # stdout/stderr - merge consecutive outputs of same type
                stream_name = content['name']  # 'stdout' or 'stderr'
                text = content['text']
                if output and output[-1].type == stream_name:
                    output[-1] = OutputItem(type=stream_name, content=output[-1].content + text)
                else:
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
                except (ValueError, SyntaxError):
                    # If it's not a valid literal, execute it as code
                    output = self._execute_code(stmt.source)
            else:
                output = self._execute_code(stmt.source)

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

    def interrupt(self) -> None:
        """Send an interrupt signal to the kernel."""
        if self.km:
            self.km.interrupt_kernel()

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
        except Exception as e:
            # Suppress exceptions during cleanup to avoid issues during interpreter shutdown
            logger.debug(f"Exception during executor cleanup: {e}")
