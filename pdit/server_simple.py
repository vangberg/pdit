"""
Simplified FastAPI server - clean abstractions.

Architecture:
- KernelSession: Manages kernel lifecycle
- Executor: Handles parsing and execution
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


# Kernel session management
class KernelSession:
    """Manages a single kernel instance."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.km: Optional[KernelManager] = None
        self.kc: Optional[BlockingKernelClient] = None
        self._start_kernel()

    def _start_kernel(self):
        """Start kernel and wait for ready."""
        self.km = KernelManager(kernel_name='python3')
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
                # Get message from kernel
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


# Script parsing and execution
class Executor:
    """Handles script parsing and execution coordination."""

    ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

    @staticmethod
    def parse_statements(code: str):
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

    @staticmethod
    def process_kernel_message(kernel_msg: Dict[str, Any]) -> Optional[Dict[str, str]]:
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
            tb = Executor.ANSI_ESCAPE.sub('', tb)
            return {'type': 'error', 'content': tb}

        return None

    @staticmethod
    async def execute_script(session: KernelSession, script: str, execution_id: str):
        """Execute script and yield results."""
        # Parse statements
        statements = list(Executor.parse_statements(script))

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
            async for kernel_msg in session.execute(stmt['code']):
                output_item = Executor.process_kernel_message(kernel_msg)
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


# Session registry
_sessions: Dict[str, KernelSession] = {}


def get_session(session_id: str) -> KernelSession:
    """Get or create kernel session."""
    if session_id not in _sessions:
        _sessions[session_id] = KernelSession(session_id)
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
    session: Optional[KernelSession] = None
    current_execution: Optional[asyncio.Task] = None

    def cancel_execution():
        """Cancel current execution if running."""
        nonlocal current_execution
        if current_execution and not current_execution.done():
            current_execution.cancel()
            current_execution = None

    async def execute_and_send(script: str, execution_id: str):
        """Execute script and send results (runs in background)."""
        try:
            async for result in Executor.execute_script(session, script, execution_id):
                await websocket.send_json(result)
        except asyncio.CancelledError:
            await websocket.send_json({
                'type': 'execution-cancelled',
                'executionId': execution_id
            })
        except Exception as e:
            await websocket.send_json({
                'type': 'execution-error',
                'executionId': execution_id,
                'error': str(e)
            })

    try:
        # Initialize session
        init_msg = await websocket.receive_json()
        session_id = init_msg.get('sessionId')

        if not session_id:
            await websocket.send_json({'type': 'error', 'error': 'No sessionId'})
            return

        session = get_session(session_id)
        await websocket.send_json({'type': 'init-ack', 'sessionId': session_id})

        # Message loop - can receive messages while executing
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get('type')

            if msg_type == 'execute':
                cancel_execution()
                current_execution = asyncio.create_task(
                    execute_and_send(msg['script'], msg['executionId'])
                )

            elif msg_type == 'interrupt':
                session.interrupt()
                cancel_execution()
                await websocket.send_json({'type': 'interrupt-ack'})

            elif msg_type == 'reset':
                cancel_execution()
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
        cancel_execution()


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
