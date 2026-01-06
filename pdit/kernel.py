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
        """Configure kernel for inline matplotlib output."""
        self._execute_silent("""
import IPython
ip = IPython.get_ipython()
if ip:
    ip.run_line_magic('matplotlib', 'inline')
""")

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
