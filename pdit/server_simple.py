"""
Simplified FastAPI server - clean abstractions.

Architecture:
- Kernel: Low-level kernel process management
- Session: High-level execution coordination
- WebSocket handler: Just message routing
"""

import asyncio
import ast
import re
from pathlib import Path
from typing import Optional, AsyncGenerator, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from jupyter_client import KernelManager
from jupyter_client.blocking import BlockingKernelClient


# Kernel process management
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

    def restart(self):
        """Restart the kernel."""
        if self.km:
            self.km.restart_kernel()
            if self.kc:
                self.kc.wait_for_ready(timeout=30)

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


# Session: high-level execution coordination
class Session:
    """Manages script execution using a Kernel."""

    ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.kernel = Kernel()
        self.current_task: Optional[asyncio.Task] = None

    def cancel_execution(self):
        """Cancel current execution if running."""
        if self.current_task and not self.current_task.done():
            self.current_task.cancel()
            self.current_task = None

    def _parse_statements(self, code: str):
        """Parse script into statements."""
        try:
            tree = ast.parse(code)
            lines = code.split('\n')
            for i, node in enumerate(tree.body):
                source = '\n'.join(lines[node.lineno - 1:node.end_lineno])
                yield {
                    'node_index': i,
                    'line_start': node.lineno,
                    'line_end': node.end_lineno,
                    'code': source
                }
        except SyntaxError as e:
            yield {
                'node_index': 0,
                'line_start': e.lineno or 1,
                'line_end': e.lineno or 1,
                'code': code,
                'syntax_error': str(e)
            }

    def _process_kernel_message(self, kernel_msg: Dict[str, Any]) -> Optional[Dict[str, str]]:
        """Convert kernel message to output item."""
        msg_type = kernel_msg['msg_type']
        content = kernel_msg['content']

        if msg_type == 'stream':
            return {
                'type': content['name'],  # stdout/stderr
                'content': content['text']
            }
        elif msg_type == 'execute_result':
            data = content['data']
            if 'text/html' in data:
                return {'type': 'text/html', 'content': data['text/html']}
            elif 'text/plain' in data:
                return {'type': 'text/plain', 'content': data['text/plain']}
        elif msg_type == 'display_data':
            data = content['data']
            if 'text/html' in data:
                return {'type': 'text/html', 'content': data['text/html']}
            elif 'text/plain' in data:
                return {'type': 'text/plain', 'content': data['text/plain']}
        elif msg_type == 'error':
            tb = '\n'.join(content['traceback'])
            tb = self.ANSI_ESCAPE.sub('', tb)
            return {'type': 'error', 'content': tb}

        return None

    async def _execute_script_impl(self, script: str, execution_id: str):
        """Execute script and yield results."""
        # Parse statements
        statements = list(self._parse_statements(script))

        # Send statement list
        yield {
            'type': 'execution-started',
            'executionId': execution_id,
            'expressions': [
                {
                    'nodeIndex': s['node_index'],
                    'lineStart': s['line_start'],
                    'lineEnd': s['line_end']
                }
                for s in statements if 'syntax_error' not in s
            ]
        }

        # Execute each statement
        for stmt in statements:
            # Check for syntax error
            if 'syntax_error' in stmt:
                yield {
                    'type': 'expression-done',
                    'executionId': execution_id,
                    'nodeIndex': stmt['node_index'],
                    'lineStart': stmt['line_start'],
                    'lineEnd': stmt['line_end'],
                    'output': [{
                        'type': 'error',
                        'content': stmt['syntax_error']
                    }],
                    'isInvisible': False
                }
                continue

            # Execute and collect output
            output = []
            async for kernel_msg in self.kernel.execute(stmt['code']):
                output_item = self._process_kernel_message(kernel_msg)
                if output_item:
                    output.append(output_item)

            # Send result
            yield {
                'type': 'expression-done',
                'executionId': execution_id,
                'nodeIndex': stmt['node_index'],
                'lineStart': stmt['line_start'],
                'lineEnd': stmt['line_end'],
                'output': output,
                'isInvisible': len(output) == 0
            }

        # Send completion
        yield {
            'type': 'execution-complete',
            'executionId': execution_id
        }

    async def execute_script(self, script: str, execution_id: str, send_fn):
        """Execute script in background, managing task lifecycle."""
        self.cancel_execution()

        async def run():
            try:
                async for result in self._execute_script_impl(script, execution_id):
                    await send_fn(result)
            except asyncio.CancelledError:
                await send_fn({'type': 'execution-cancelled', 'executionId': execution_id})
            except Exception as e:
                await send_fn({'type': 'execution-error', 'executionId': execution_id, 'error': str(e)})

        self.current_task = asyncio.create_task(run())

    def interrupt(self):
        """Interrupt current execution (send SIGINT to kernel)."""
        self.kernel.interrupt()
        # Don't cancel task - let kernel send KeyboardInterrupt error

    def restart(self):
        """Restart the kernel."""
        self.cancel_execution()
        self.kernel.restart()

    def shutdown(self):
        """Shutdown the kernel."""
        self.cancel_execution()
        self.kernel.shutdown()


# Session registry
_sessions: Dict[str, Session] = {}


def get_session(session_id: str) -> Session:
    """Get or create session."""
    if session_id not in _sessions:
        _sessions[session_id] = Session(session_id)
    return _sessions[session_id]


# FastAPI app
app = FastAPI(title="pdit (simplified)", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    """Health check."""
    return {"status": "ok"}


@app.websocket("/ws/execute")
async def execute_websocket(websocket: WebSocket):
    """WebSocket endpoint - thin message router."""
    await websocket.accept()
    session: Optional[Session] = None

    try:
        # Initialize session
        init_msg = await websocket.receive_json()
        session_id = init_msg.get('sessionId')

        if not session_id:
            await websocket.send_json({'type': 'error', 'error': 'No sessionId'})
            return

        session = get_session(session_id)
        await websocket.send_json({'type': 'init-ack', 'sessionId': session_id})

        # Message loop
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get('type')

            if msg_type == 'execute':
                await session.execute_script(msg['script'], msg['executionId'], websocket.send_json)

            elif msg_type == 'interrupt':
                session.interrupt()

            elif msg_type == 'reset':
                session.restart()

            elif msg_type == 'ping':
                await websocket.send_json({'type': 'pong'})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({'type': 'error', 'error': str(e)})
        except:
            pass
    finally:
        if session:
            session.cancel_execution()


# Static file serving
STATIC_DIR = Path(__file__).parent / "_static"

if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return ""
