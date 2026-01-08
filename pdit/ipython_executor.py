"""
IPython kernel executor using jupyter_client.

Uses IPython kernel with jupyter_client for reliable messaging.
Yields event dicts directly for minimal server overhead.
"""

import ast
import io
import json
import logging
import re
import time
import traceback
from typing import Any, Generator

from jupyter_client import KernelManager
from jupyter_client.blocking import BlockingKernelClient


logger = logging.getLogger(__name__)


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

    def _parse_script(self, script: str) -> list[dict]:
        """Parse Python script into statement dicts using AST."""
        tree = ast.parse(script)
        statements = []
        lines = script.split('\n')

        for node in tree.body:
            line_start = node.lineno
            line_end = node.end_lineno or node.lineno

            # Extract source
            source_lines = lines[line_start - 1:line_end]
            source = '\n'.join(source_lines)

            is_expr = isinstance(node, ast.Expr)
            is_markdown_cell = is_expr and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)

            statements.append({
                "lineStart": line_start,
                "lineEnd": line_end,
                "source": source,
                "isMarkdownCell": is_markdown_cell
            })

        return statements

    def _strip_ansi(self, text: str) -> str:
        """Strip ANSI escape codes from text."""
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)

    def _process_mime_data(self, data: dict) -> list[dict]:
        """Process MIME bundle data into output dicts.

        Passes through MIME types directly instead of translating to custom types.
        Uses priority order: image > html > json > plain text.
        """
        output: list[dict] = []

        # Priority order for MIME types - pass through directly
        # Check for any image type
        image_types = [k for k in data.keys() if k.startswith('image/')]
        if image_types:
            # Use first image type found (they're usually in priority order)
            mime_type = image_types[0]
            output.append({"type": mime_type, "content": data[mime_type]})
        elif 'text/html' in data:
            output.append({"type": "text/html", "content": data['text/html']})
        elif 'application/json' in data:
            json_data = data['application/json']
            output.append({"type": "application/json", "content": json.dumps(json_data)})
        elif 'text/plain' in data:
            output.append({"type": "text/plain", "content": data['text/plain']})

        return output

    def _execute_code(self, code: str) -> list[dict]:
        """Execute code in kernel and collect output."""
        if self.kc is None:
            return [{"type": "error", "content": "Kernel not started"}]

        output: list[dict] = []

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
                if output and output[-1]["type"] == stream_name:
                    output[-1] = {"type": stream_name, "content": output[-1]["content"] + text}
                else:
                    output.append({"type": stream_name, "content": text})
            elif msg_type == 'execute_result':
                # Expression result
                data = content['data']
                output.extend(self._process_mime_data(data))
            elif msg_type == 'display_data':
                # Display output (plots, etc.)
                data = content['data']
                output.extend(self._process_mime_data(data))
            elif msg_type == 'error':
                # Exception - strip ANSI codes from traceback
                tb = '\n'.join(content['traceback'])
                tb = self._strip_ansi(tb)
                output.append({"type": "error", "content": tb})

        return output

    def _has_error(self, output: list[dict]) -> bool:
        """Check whether output contains an error."""
        return any(item["type"] == "error" for item in output)

    def execute_script(
        self,
        script: str,
        line_range: tuple[int, int] | None = None,
        script_name: str | None = None
    ) -> Generator[dict, None, None]:
        """Execute Python script, yielding event dicts as each statement completes.

        Yields:
            First: {"type": "expressions", "expressions": [{"lineStart": N, "lineEnd": N}, ...]}
            Then for each statement: {"lineStart": N, "lineEnd": N, "output": [...], "isInvisible": bool}
            On error during execution, the final result dict will have output with type="error"
        """
        # Parse script
        try:
            statements = self._parse_script(script)
        except SyntaxError as e:
            error_line = e.lineno or 1
            error_buffer = io.StringIO()
            traceback.print_exc(file=error_buffer)
            # Yield expressions first (just the error location)
            yield {
                "type": "expressions",
                "expressions": [{"lineStart": error_line, "lineEnd": error_line}]
            }
            # Then yield the error result
            yield {
                "lineStart": error_line,
                "lineEnd": error_line,
                "output": [{"type": "error", "content": error_buffer.getvalue()}],
                "isInvisible": False
            }
            return

        # Filter by line range
        if line_range:
            from_line, to_line = line_range
            statements = [
                stmt for stmt in statements
                if not (stmt["lineEnd"] < from_line or stmt["lineStart"] > to_line)
            ]

        # Yield expression info
        yield {
            "type": "expressions",
            "expressions": [
                {"lineStart": stmt["lineStart"], "lineEnd": stmt["lineEnd"]}
                for stmt in statements
            ]
        }

        # Execute each statement
        for stmt in statements:
            if stmt["isMarkdownCell"]:
                # For markdown cells, just return the string content
                try:
                    value = ast.literal_eval(stmt["source"])
                    output = [{"type": "text/markdown", "content": str(value).strip()}]
                except (ValueError, SyntaxError):
                    output = self._execute_code(stmt["source"])
            else:
                output = self._execute_code(stmt["source"])

            yield {
                "lineStart": stmt["lineStart"],
                "lineEnd": stmt["lineEnd"],
                "output": output,
                "isInvisible": len(output) == 0
            }

            if self._has_error(output):
                break

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
