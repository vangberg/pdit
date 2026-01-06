"""Session management for script execution."""

import ast
import asyncio
import re
from typing import Optional, Dict, Any

from .kernel import Kernel


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
                # Detect markdown cells: top-level string literals
                is_markdown = (
                    isinstance(node, ast.Expr) and
                    isinstance(node.value, ast.Constant) and
                    isinstance(node.value.value, str)
                )
                yield {
                    'node_index': i,
                    'line_start': node.lineno,
                    'line_end': node.end_lineno,
                    'code': source,
                    'is_markdown': is_markdown
                }
        except SyntaxError as e:
            yield {
                'node_index': 0,
                'line_start': e.lineno or 1,
                'line_end': e.lineno or 1,
                'code': code,
                'syntax_error': str(e)
            }

    def _process_mime_data(self, data: Dict[str, Any]) -> Optional[Dict[str, str]]:
        """Process MIME bundle data into output item.

        Priority order: image > html > json > plain text.
        """
        # Check for any image type first
        image_types = [k for k in data.keys() if k.startswith('image/')]
        if image_types:
            mime_type = image_types[0]
            return {'type': mime_type, 'content': data[mime_type]}
        elif 'text/html' in data:
            return {'type': 'text/html', 'content': data['text/html']}
        elif 'application/json' in data:
            import json
            return {'type': 'application/json', 'content': json.dumps(data['application/json'])}
        elif 'text/plain' in data:
            return {'type': 'text/plain', 'content': data['text/plain']}
        return None

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
            return self._process_mime_data(content['data'])
        elif msg_type == 'display_data':
            return self._process_mime_data(content['data'])
        elif msg_type == 'error':
            tb = '\n'.join(content['traceback'])
            tb = self.ANSI_ESCAPE.sub('', tb)
            return {'type': 'error', 'content': tb}

        return None

    async def _execute_script_impl(self, script: str, execution_id: str, line_range: Optional[tuple[int, int]] = None):
        """Execute script and yield results."""
        # Parse statements
        all_statements = list(self._parse_statements(script))

        # Filter by line range if specified (include any statement that overlaps)
        if line_range:
            from_line, to_line = line_range
            statements = [
                s for s in all_statements
                if not (s['line_end'] < from_line or s['line_start'] > to_line)
            ]
        else:
            statements = all_statements

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

            # Handle markdown cells: return string content as markdown
            if stmt.get('is_markdown'):
                try:
                    value = ast.literal_eval(stmt['code'])
                    output = [{'type': 'text/markdown', 'content': str(value).strip()}]
                except (ValueError, SyntaxError):
                    output = []
                yield {
                    'type': 'expression-done',
                    'executionId': execution_id,
                    'nodeIndex': stmt['node_index'],
                    'lineStart': stmt['line_start'],
                    'lineEnd': stmt['line_end'],
                    'output': output,
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

    async def execute_script(self, script: str, execution_id: str, send_fn, line_range: Optional[tuple[int, int]] = None):
        """Execute script in background, managing task lifecycle."""
        self.cancel_execution()

        async def run():
            try:
                async for result in self._execute_script_impl(script, execution_id, line_range):
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

    def execute_script_sync(self, script: str, line_range: Optional[tuple[int, int]] = None):
        """Execute script synchronously, yielding results.

        For use in CLI export where we don't need async.
        """
        # Parse statements
        all_statements = list(self._parse_statements(script))

        # Filter by line range if specified
        if line_range:
            from_line, to_line = line_range
            statements = [
                s for s in all_statements
                if not (s['line_end'] < from_line or s['line_start'] > to_line)
            ]
        else:
            statements = all_statements

        # Yield statement list
        yield {
            'type': 'execution-started',
            'expressions': [
                {
                    'nodeIndex': s['node_index'],
                    'lineStart': s['line_start'],
                    'lineEnd': s['line_end']
                }
                for s in statements if 'syntax_error' not in s
            ]
        }

        # Execute each statement synchronously
        for stmt in statements:
            if 'syntax_error' in stmt:
                yield {
                    'type': 'expression-done',
                    'nodeIndex': stmt['node_index'],
                    'lineStart': stmt['line_start'],
                    'lineEnd': stmt['line_end'],
                    'output': [{'type': 'error', 'content': stmt['syntax_error']}],
                    'isInvisible': False
                }
                continue

            # Handle markdown cells
            if stmt.get('is_markdown'):
                try:
                    value = ast.literal_eval(stmt['code'])
                    output = [{'type': 'text/markdown', 'content': str(value).strip()}]
                except (ValueError, SyntaxError):
                    output = []
                yield {
                    'type': 'expression-done',
                    'nodeIndex': stmt['node_index'],
                    'lineStart': stmt['line_start'],
                    'lineEnd': stmt['line_end'],
                    'output': output,
                    'isInvisible': False
                }
                continue

            # Execute synchronously using kernel
            output = []
            for kernel_msg in self.kernel.execute_sync(stmt['code']):
                output_item = self._process_kernel_message(kernel_msg)
                if output_item:
                    output.append(output_item)

            yield {
                'type': 'expression-done',
                'nodeIndex': stmt['node_index'],
                'lineStart': stmt['line_start'],
                'lineEnd': stmt['line_end'],
                'output': output,
                'isInvisible': len(output) == 0
            }


# Session registry
_sessions: Dict[str, Session] = {}


def get_session(session_id: str) -> Session:
    """Get or create session."""
    if session_id not in _sessions:
        _sessions[session_id] = Session(session_id)
    return _sessions[session_id]
