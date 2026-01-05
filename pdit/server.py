"""
Simplified FastAPI server - clean abstractions.

Architecture:
- Kernel: Low-level kernel process management
- Session: High-level execution coordination
- WebSocket handler: Just message routing
"""

import asyncio
import ast
import fnmatch
import os
import re
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Optional, AsyncGenerator, Dict, Any, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from jupyter_client import KernelManager
from jupyter_client.blocking import BlockingKernelClient
from pydantic import BaseModel

from .file_watcher import FileWatcher
from .sse import format_sse

# Global shutdown event for SSE connections
shutdown_event = threading.Event()


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


# Pydantic models for file operations
class SaveFileRequest(BaseModel):
    path: str
    content: str


class ReadFileResponse(BaseModel):
    content: str


class ListFilesResponse(BaseModel):
    files: List[str]


@app.get("/api/watch-file")
async def watch_file(path: str, sessionId: str):
    """Watch a file and stream initial content + changes via SSE."""
    watcher_stop_event = threading.Event()

    async def generate_events():
        watcher = FileWatcher(path, stop_event=watcher_stop_event)
        try:
            async for event in watcher.watch_with_initial():
                if shutdown_event.is_set():
                    break
                yield format_sse(asdict(event))
                if event.type in ("fileDeleted", "error"):
                    break
        finally:
            watcher_stop_event.set()

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.get("/api/read-file", response_model=ReadFileResponse)
async def read_file(path: str):
    """Read a file from the filesystem."""
    try:
        file_path = Path(path)
        content = file_path.read_text()
        return ReadFileResponse(content=content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


@app.get("/api/list-files", response_model=ListFilesResponse)
async def list_files():
    """List all Python files in the current working directory."""
    cwd = Path.cwd()
    py_files: list[str] = []
    skip_dirs = {".git", ".venv", "venv", "__pycache__", "node_modules", ".tox", ".mypy_cache", ".pytest_cache", "dist", "build", "*.egg-info"}

    for root, dirs, files in os.walk(cwd):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in skip_dirs and not any(fnmatch.fnmatch(d, pattern) for pattern in skip_dirs)]
        for file in files:
            if file.endswith('.py'):
                full_path = Path(root) / file
                relative_path = full_path.relative_to(cwd)
                py_files.append(str(relative_path))

    py_files.sort(key=lambda p: Path(p).name.lower())
    return ListFilesResponse(files=py_files)


@app.post("/api/save-file")
async def save_file(request: SaveFileRequest):
    """Save a file to the filesystem."""
    try:
        file_path = Path(request.path)
        file_path.write_text(request.content)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")


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
