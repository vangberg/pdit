"""
IPython kernel executor using jupyter_client.

Uses IPython kernel with jupyter_client for reliable messaging.
Yields event dicts directly for minimal server overhead.
"""

import ast
import asyncio
import io
import json
import logging
import re
import traceback
from typing import Any, AsyncGenerator, Awaitable, Callable, Optional

from jupyter_client import AsyncKernelManager


logger = logging.getLogger(__name__)


class IPythonExecutor:
    """Python executor using IPython kernel."""

    def __init__(self):
        """Initialize executor. Call start() to begin kernel startup."""
        self.km: Optional[AsyncKernelManager] = None
        self.kc = None  # AsyncKernelClient
        self._startup_task: Optional[asyncio.Task] = None
        self._runtime_hooks_registered = False

    def start(self) -> None:
        """Start IPython kernel in the background.

        This is non-blocking - it creates a background task to start the kernel.
        Use wait_ready() to wait for the kernel to be ready before executing code.
        """
        if self._startup_task is None:
            self._startup_task = asyncio.create_task(self._do_start())

    async def wait_ready(self) -> None:
        """Wait for the kernel to be ready. Starts the kernel if not already started."""
        if self._startup_task is None:
            self._startup_task = asyncio.create_task(self._do_start())
        await self._startup_task

    async def _do_start(self) -> None:
        """Internal: Actually start the IPython kernel."""
        # Use python3 (IPython) kernel
        self.km = AsyncKernelManager(kernel_name='python3')
        await self.km.start_kernel()
        self.kc = self.km.client()
        self.kc.start_channels()
        # Wait for kernel to be ready
        await self.kc.wait_for_ready(timeout=30)
        # Drain any startup messages
        await self._drain_iopub()
        # Register display formatters
        await self._register_display_formatters()


    async def _execute_silent(self, code: str) -> None:
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
        loop = asyncio.get_running_loop()
        start_time = loop.time()
        while loop.time() - start_time < timeout_total:
            try:
                msg = await asyncio.wait_for(self.kc.get_iopub_msg(), timeout=1)
                if msg['parent_header'].get('msg_id') == msg_id:
                    if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                        return
                    elif msg['msg_type'] == 'error':
                        raise RuntimeError(f"Silent execution failed: {msg['content']['ename']}: {msg['content']['evalue']}")
            except asyncio.TimeoutError:
                # Queue empty, keep waiting
                continue
        raise RuntimeError("Silent execution timed out")

    async def _register_display_formatters(self) -> None:
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
        await self._execute_silent(formatter_code)

    async def _register_runtime_hooks(self) -> None:
        """Register runtime hooks for kernel behavior."""
        if self._runtime_hooks_registered:
            return
        hook_code = """
def _register_pdit_runtime_hooks():
    import sys
    import IPython

    def _pdit_disable_matplotlib_interactive():
        mpl = sys.modules.get("matplotlib")
        if mpl is None:
            return
        try:
            mpl.interactive(False)
        except Exception:
            pass
        plt = sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            try:
                plt.ioff()
            except Exception:
                pass

    ip = IPython.get_ipython()
    if not ip:
        _pdit_disable_matplotlib_interactive()
        return

    if not getattr(ip, "_pdit_mpl_guard_installed", False):
        def _pdit_post_run_cell(result):
            _pdit_disable_matplotlib_interactive()

        try:
            ip.events.register("post_run_cell", _pdit_post_run_cell)
            ip._pdit_mpl_guard_installed = True
        except Exception:
            _pdit_disable_matplotlib_interactive()
            return
        _pdit_disable_matplotlib_interactive()

_register_pdit_runtime_hooks()
del _register_pdit_runtime_hooks
"""
        await self._execute_silent(hook_code)
        self._runtime_hooks_registered = True

    def _parse_script(self, script: str) -> list[dict]:
        """Parse Python script into statement dicts using AST."""
        tree = ast.parse(script)
        statements = []
        lines = script.split('\n')

        for node in tree.body:
            line_start = node.lineno
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                if node.decorator_list:
                    line_start = min(dec.lineno for dec in node.decorator_list)
            line_end = node.end_lineno or node.lineno

            # Extract source
            source_lines = lines[line_start - 1:line_end]
            source = '\n'.join(source_lines)

            is_expr = isinstance(node, ast.Expr)
            is_string_literal = is_expr and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)
            is_fstring = is_expr and isinstance(node.value, ast.JoinedStr)

            statements.append({
                "lineStart": line_start,
                "lineEnd": line_end,
                "source": source,
                "isMarkdownCell": is_string_literal,
                "isFStringMarkdown": is_fstring
            })

        return statements

    def _strip_ansi(self, text: str) -> str:
        """Strip ANSI escape codes from text."""
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)

    def _process_mime_data(self, data: dict, metadata: dict | None = None) -> list[dict]:
        """Process MIME bundle data into output dicts.

        Passes through MIME types directly instead of translating to custom types.
        Uses priority order: image > html > markdown > json > plain text.

        Args:
            data: MIME bundle data dict
            metadata: Optional metadata dict (keyed by MIME type, contains width/height for images)
        """
        output: list[dict] = []
        metadata = metadata or {}

        # Priority order for MIME types - pass through directly
        # Check for any image type
        image_types = [k for k in data.keys() if k.startswith('image/')]
        if image_types:
            # Use first image type found (they're usually in priority order)
            mime_type = image_types[0]
            item: dict[str, Any] = {"type": mime_type, "content": data[mime_type]}
            # Include width/height from metadata if present
            mime_metadata = metadata.get(mime_type, {})
            if 'width' in mime_metadata:
                item['width'] = mime_metadata['width']
            if 'height' in mime_metadata:
                item['height'] = mime_metadata['height']
            output.append(item)
        elif 'text/html' in data:
            output.append({"type": "text/html", "content": data['text/html']})
        elif 'text/markdown' in data:
            output.append({"type": "text/markdown", "content": data['text/markdown']})
        elif 'application/json' in data:
            json_data = data['application/json']
            output.append({"type": "application/json", "content": json.dumps(json_data)})
        elif 'text/plain' in data:
            output.append({"type": "text/plain", "content": data['text/plain']})

        return output

    async def _execute_code(
        self,
        code: str,
        on_stream: Callable[[list[dict]], Awaitable[None]] | None = None,
    ) -> list[dict]:
        """Execute code in kernel and collect output.

        Args:
            code: Python source to execute in the kernel.
            on_stream: Optional callback invoked when stdout/stderr updates arrive.
        """
        if self.kc is None:
            return [{"type": "error", "content": "Kernel not started"}]

        output: list[dict] = []

        msg_id = self.kc.execute(code)

        # Collect output messages (no timeout - code can run indefinitely)
        while True:
            msg = await self.kc.get_iopub_msg()

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
                if on_stream:
                    await on_stream(output)
            elif msg_type == 'execute_result':
                # Expression result
                data = content['data']
                metadata = content.get('metadata', {})
                output.extend(self._process_mime_data(data, metadata))
            elif msg_type == 'display_data':
                # Display output (plots, etc.)
                data = content['data']
                metadata = content.get('metadata', {})
                output.extend(self._process_mime_data(data, metadata))
            elif msg_type == 'error':
                # Exception - strip ANSI codes from traceback
                tb = '\n'.join(content['traceback'])
                tb = self._strip_ansi(tb)
                output.append({"type": "error", "content": tb})

        return output

    def _has_error(self, output: list[dict]) -> bool:
        """Check whether output contains an error."""
        return any(item["type"] == "error" for item in output)

    async def execute_script(
        self,
        script: str,
        line_range: tuple[int, int] | None = None,
        script_name: str | None = None,
        on_stream: Callable[[int, int, list[dict]], Awaitable[None]] | None = None,
    ) -> AsyncGenerator[dict, None]:
        """Execute Python script, yielding event dicts as each statement completes.

        Yields:
            First: {"type": "expressions", "expressions": [{"lineStart": N, "lineEnd": N}, ...]}
            Then for each statement: {"lineStart": N, "lineEnd": N, "output": [...], "isInvisible": bool}
            On error during execution, the final result dict will have output with type="error"
            If on_stream is provided, it is invoked on stdout/stderr updates with the current output list.
        """
        # Wait for kernel to be ready
        await self.wait_ready()
        await self._register_runtime_hooks()

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
            stream_cb = None
            if on_stream is not None:
                line_start = stmt["lineStart"]
                line_end = stmt["lineEnd"]

                async def stream_cb(updated_output: list[dict]) -> None:
                    await on_stream(line_start, line_end, updated_output)

            if stmt["isMarkdownCell"]:
                # For markdown cells, just return the string content
                try:
                    value = ast.literal_eval(stmt["source"])
                    output = [{"type": "text/markdown", "content": str(value).strip()}]
                except (ValueError, SyntaxError):
                    output = await self._execute_code(stmt["source"], on_stream=stream_cb)
            elif stmt["isFStringMarkdown"]:
                # Wrap f-string in Markdown() so it returns text/markdown directly
                wrapper_code = f"__import__('IPython').display.Markdown({stmt['source']})"
                output = await self._execute_code(wrapper_code, on_stream=stream_cb)
            else:
                output = await self._execute_code(stmt["source"], on_stream=stream_cb)

            yield {
                "lineStart": stmt["lineStart"],
                "lineEnd": stmt["lineEnd"],
                "output": output,
                "isInvisible": len(output) == 0
            }

            if self._has_error(output):
                break

    async def reset(self) -> None:
        """Reset the kernel (restart it)."""
        # Wait for startup to complete first
        await self.wait_ready()
        if self.km:
            if self.kc:
                self.kc.stop_channels()
            await self.km.restart_kernel()
            self.kc = self.km.client()
            self.kc.start_channels()
            await self.kc.wait_for_ready(timeout=30)
            await self._drain_iopub()
            await self._register_display_formatters()
            self._runtime_hooks_registered = False

    async def _drain_iopub(self) -> None:
        """Drain any pending messages from iopub channel."""
        if self.kc is None:
            return
        while True:
            try:
                await asyncio.wait_for(self.kc.get_iopub_msg(), timeout=0.1)
            except asyncio.TimeoutError:
                break

    async def interrupt(self) -> None:
        """Send an interrupt signal to the kernel."""
        if self.km:
            await self.km.interrupt_kernel()

    async def shutdown(self) -> None:
        """Shutdown the kernel."""
        # Cancel startup if still in progress
        if self._startup_task and not self._startup_task.done():
            self._startup_task.cancel()
            try:
                await self._startup_task
            except asyncio.CancelledError:
                pass
        self._startup_task = None
        self._runtime_hooks_registered = False

        if self.kc:
            self.kc.stop_channels()
            self.kc = None
        if self.km:
            try:
                # shutdown_kernel can hang with async client, so add timeout
                await asyncio.wait_for(self.km.shutdown_kernel(now=True), timeout=5)
            except asyncio.TimeoutError:
                # Force kill the kernel process if shutdown hangs
                if self.km.has_kernel:
                    self.km.kernel.kill()
            except Exception:
                pass
            self.km = None
