"""Low-level Jupyter kernel process management."""

import asyncio
from typing import Optional, AsyncGenerator, Dict, Any

from jupyter_client import KernelManager
from jupyter_client.blocking import BlockingKernelClient


class Kernel:
    """Low-level Jupyter kernel process management."""

    def __init__(self, kernel_name: str = 'python3'):
        self.kernel_name = kernel_name
        self.km: Optional[KernelManager] = None
        self.kc: Optional[BlockingKernelClient] = None
        self.start()

    def start(self):
        """Start kernel and wait for ready."""
        self.km = KernelManager(kernel_name=self.kernel_name)
        self.km.start_kernel()
        self.kc = self.km.client()
        self.kc.start_channels()
        self.kc.wait_for_ready(timeout=30)
        self._setup_kernel()

    def _execute_silent(self, code: str) -> None:
        """Execute code without capturing output (for setup)."""
        if not self.kc:
            return
        msg_id = self.kc.execute(code, silent=True)
        while True:
            msg = self.kc.get_iopub_msg(timeout=10)
            if msg['parent_header'].get('msg_id') == msg_id:
                if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                    break

    def _setup_kernel(self) -> None:
        """Configure kernel for inline matplotlib output and DataFrame display."""
        self._execute_silent("""
import IPython
ip = IPython.get_ipython()
if ip:
    ip.run_line_magic('matplotlib', 'inline')
""")
        self._register_display_formatters()

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

    def restart(self):
        """Restart the kernel."""
        if self.km:
            self.km.restart_kernel()
            if self.kc:
                self.kc.wait_for_ready(timeout=30)
            self._setup_kernel()

    def interrupt(self):
        """Interrupt the kernel (send SIGINT)."""
        if self.km:
            self.km.interrupt_kernel()

    def shutdown(self):
        """Shutdown the kernel."""
        if self.kc:
            self.kc.stop_channels()
        if self.km:
            self.km.shutdown_kernel(now=True)

    async def execute(self, code: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute code and yield kernel messages."""
        if not self.kc:
            raise RuntimeError("Kernel not initialized")

        msg_id = self.kc.execute(code)

        while True:
            try:
                kernel_msg = await asyncio.to_thread(
                    self.kc.get_iopub_msg, timeout=30
                )
            except Exception:
                break

            # Only process messages for this execution
            if kernel_msg['parent_header'].get('msg_id') != msg_id:
                continue

            yield kernel_msg

            # Done when kernel goes idle
            if (kernel_msg['msg_type'] == 'status' and
                kernel_msg['content']['execution_state'] == 'idle'):
                break

    def execute_sync(self, code: str):
        """Execute code synchronously and yield kernel messages."""
        if not self.kc:
            raise RuntimeError("Kernel not initialized")

        msg_id = self.kc.execute(code)

        while True:
            try:
                kernel_msg = self.kc.get_iopub_msg(timeout=30)
            except Exception:
                break

            if kernel_msg['parent_header'].get('msg_id') != msg_id:
                continue

            yield kernel_msg

            if (kernel_msg['msg_type'] == 'status' and
                kernel_msg['content']['execution_state'] == 'idle'):
                break
