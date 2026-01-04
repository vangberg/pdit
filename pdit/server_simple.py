"""
Simplified FastAPI server - kernel message forwarding only.

Radically simpler approach:
- Forward kernel messages directly (no wrapping)
- No ExecutionState, Session, or custom queue
- Trust the kernel protocol
- 90% less code
"""

import asyncio
import ast
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from jupyter_client import KernelManager
from jupyter_client.blocking import BlockingKernelClient


# Kernel registry: session_id -> KernelManager
_kernels: dict[str, tuple[KernelManager, BlockingKernelClient]] = {}


def parse_statements(code: str):
    """Split code into statements. Only unavoidable complexity."""
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
        # Return syntax error as a statement
        yield {
            'node_index': 0,
            'line_start': e.lineno or 1,
            'line_end': e.lineno or 1,
            'code': code,
            'syntax_error': str(e)
        }


def get_or_create_kernel(session_id: str) -> tuple[KernelManager, BlockingKernelClient]:
    """Get or create kernel for session."""
    if session_id not in _kernels:
        km = KernelManager(kernel_name='xpython')
        km.start_kernel()
        kc = km.client()
        kc.start_channels()
        kc.wait_for_ready(timeout=30)
        _kernels[session_id] = (km, kc)
    return _kernels[session_id]


def cleanup_kernel(session_id: str):
    """Clean up kernel for session."""
    if session_id in _kernels:
        km, kc = _kernels.pop(session_id)
        kc.stop_channels()
        km.shutdown_kernel(now=True)


# FastAPI app
app = FastAPI(title="pdit (simplified)", version="0.2.0")

# CORS
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
    """WebSocket endpoint - just forward kernel messages."""
    await websocket.accept()
    session_id: Optional[str] = None

    try:
        # Get init message
        init_msg = await websocket.receive_json()
        session_id = init_msg.get('sessionId')

        if not session_id:
            await websocket.send_json({'type': 'error', 'error': 'No sessionId'})
            return

        # Get or create kernel
        km, kc = get_or_create_kernel(session_id)

        # Acknowledge
        await websocket.send_json({'type': 'init-ack', 'sessionId': session_id})

        # Message loop
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get('type')

            if msg_type == 'execute':
                # Parse into statements
                statements = list(parse_statements(msg['script']))

                # Send statement list
                await websocket.send_json({
                    'type': 'execution-started',
                    'executionId': msg['executionId'],
                    'expressions': [
                        {
                            'nodeIndex': s['node_index'],
                            'lineStart': s['line_start'],
                            'lineEnd': s['line_end']
                        }
                        for s in statements if 'syntax_error' not in s
                    ]
                })

                # Execute each statement
                for stmt in statements:
                    # Check for syntax error
                    if 'syntax_error' in stmt:
                        await websocket.send_json({
                            'type': 'expression-done',
                            'executionId': msg['executionId'],
                            'nodeIndex': stmt['node_index'],
                            'lineStart': stmt['line_start'],
                            'lineEnd': stmt['line_end'],
                            'output': [{
                                'type': 'error',
                                'content': stmt['syntax_error']
                            }],
                            'isInvisible': False
                        })
                        continue

                    # Execute code in kernel
                    msg_id = kc.execute(stmt['code'])

                    # Collect all output for this statement
                    output = []
                    while True:
                        try:
                            kernel_msg = await asyncio.to_thread(
                                kc.get_iopub_msg, timeout=30
                            )
                        except Exception:
                            break

                        # Only process messages for this execution
                        if kernel_msg['parent_header'].get('msg_id') != msg_id:
                            continue

                        msg_type = kernel_msg['msg_type']
                        content = kernel_msg['content']

                        # Done when kernel goes idle
                        if msg_type == 'status' and content['execution_state'] == 'idle':
                            break

                        # Collect output
                        elif msg_type == 'stream':
                            output.append({
                                'type': content['name'],  # stdout/stderr
                                'content': content['text']
                            })
                        elif msg_type == 'execute_result':
                            # Get best representation
                            data = content['data']
                            if 'text/html' in data:
                                output.append({'type': 'text/html', 'content': data['text/html']})
                            elif 'text/plain' in data:
                                output.append({'type': 'text/plain', 'content': data['text/plain']})
                        elif msg_type == 'display_data':
                            data = content['data']
                            if 'text/html' in data:
                                output.append({'type': 'text/html', 'content': data['text/html']})
                            elif 'text/plain' in data:
                                output.append({'type': 'text/plain', 'content': data['text/plain']})
                        elif msg_type == 'error':
                            tb = '\n'.join(content['traceback'])
                            # Strip ANSI codes
                            import re
                            ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
                            tb = ansi_escape.sub('', tb)
                            output.append({'type': 'error', 'content': tb})

                    # Send result
                    await websocket.send_json({
                        'type': 'expression-done',
                        'executionId': msg['executionId'],
                        'nodeIndex': stmt['node_index'],
                        'lineStart': stmt['line_start'],
                        'lineEnd': stmt['line_end'],
                        'output': output,
                        'isInvisible': len(output) == 0
                    })

                # Send completion
                await websocket.send_json({
                    'type': 'execution-complete',
                    'executionId': msg['executionId']
                })

            elif msg_type == 'reset':
                # Restart kernel
                km.restart_kernel()
                kc.wait_for_ready(timeout=30)

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


# Static file serving
STATIC_DIR = Path(__file__).parent / "_static"

if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes."""
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return ""
