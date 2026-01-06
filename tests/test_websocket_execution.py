"""Tests for WebSocket execution endpoint."""

import uuid
from typing import List, Dict, Any

import pytest
from fastapi.testclient import TestClient

from pdit.server import app
from pdit.session import delete_session


client = TestClient(app)


class TestWebSocketExecution:
    """Tests for /ws/execute WebSocket endpoint."""

    def setup_method(self):
        """Create a fresh session ID for each test."""
        self.session_id = f"test-ws-{uuid.uuid4()}"

    def teardown_method(self):
        """Clean up the session after each test."""
        delete_session(self.session_id)

    def _collect_messages(self, ws, until_type: str = "execution-complete") -> List[Dict[str, Any]]:
        """Collect WebSocket messages until specified type."""
        messages = []
        while True:
            msg = ws.receive_json()
            messages.append(msg)
            if msg.get("type") == until_type:
                break
        return messages

    def _get_expression_results(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter to only expression-done messages."""
        return [m for m in messages if m.get("type") == "expression-done"]

    def test_execute_single_line(self):
        """Test executing a single line of code."""
        with client.websocket_connect("/ws/execute") as ws:
            # Initialize session
            ws.send_json({"type": "init", "sessionId": self.session_id})
            init_ack = ws.receive_json()
            assert init_ack["type"] == "init-ack"
            assert init_ack["sessionId"] == self.session_id

            # Execute single expression
            ws.send_json({
                "type": "execute",
                "executionId": "exec-1",
                "script": "2 + 2"
            })

            messages = self._collect_messages(ws)
            results = self._get_expression_results(messages)

            assert len(results) == 1
            result = results[0]
            assert result["lineStart"] == 1
            assert result["lineEnd"] == 1
            assert result["isInvisible"] is False
            assert len(result["output"]) == 1
            assert result["output"][0]["type"] == "text/plain"
            assert "4" in result["output"][0]["content"]

    def test_execute_second_line_state_persistence(self):
        """Test that state persists across executions within the same session."""
        with client.websocket_connect("/ws/execute") as ws:
            # Initialize session
            ws.send_json({"type": "init", "sessionId": self.session_id})
            ws.receive_json()  # init-ack

            # First execution: define a variable
            ws.send_json({
                "type": "execute",
                "executionId": "exec-1",
                "script": "x = 42"
            })
            self._collect_messages(ws)

            # Second execution: use the variable
            ws.send_json({
                "type": "execute",
                "executionId": "exec-2",
                "script": "x * 2"
            })

            messages = self._collect_messages(ws)
            results = self._get_expression_results(messages)

            assert len(results) == 1
            result = results[0]
            assert result["isInvisible"] is False
            assert len(result["output"]) == 1
            assert "84" in result["output"][0]["content"]

    def test_execute_multiple_lines(self):
        """Test executing multiple lines of code."""
        with client.websocket_connect("/ws/execute") as ws:
            # Initialize session
            ws.send_json({"type": "init", "sessionId": self.session_id})
            ws.receive_json()  # init-ack

            # Execute multiple statements
            ws.send_json({
                "type": "execute",
                "executionId": "exec-1",
                "script": "a = 1\nb = 2\na + b"
            })

            messages = self._collect_messages(ws)
            results = self._get_expression_results(messages)

            # Should have 3 expression results
            assert len(results) == 3

            # First two are assignments (invisible)
            assert results[0]["lineStart"] == 1
            assert results[0]["isInvisible"] is True
            assert results[1]["lineStart"] == 2
            assert results[1]["isInvisible"] is True

            # Third is expression with output
            assert results[2]["lineStart"] == 3
            assert results[2]["isInvisible"] is False
            assert "3" in results[2]["output"][0]["content"]

    def test_execute_plot(self):
        """Test executing code that produces a plot."""
        with client.websocket_connect("/ws/execute") as ws:
            # Initialize session
            ws.send_json({"type": "init", "sessionId": self.session_id})
            ws.receive_json()  # init-ack

            # Execute matplotlib plot with plt.show()
            ws.send_json({
                "type": "execute",
                "executionId": "exec-1",
                "script": """import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [1, 4, 9])
plt.show()"""
            })

            messages = self._collect_messages(ws)
            results = self._get_expression_results(messages)

            # No errors should have occurred
            errors = [
                output
                for result in results
                for output in result.get("output", [])
                if output["type"] == "error"
            ]
            assert len(errors) == 0, f"Expected no errors, got: {errors}"

            # Should have image/png output from plt.show()
            image_outputs = [
                output
                for result in results
                for output in result.get("output", [])
                if output["type"] == "image/png"
            ]
            assert len(image_outputs) > 0, f"Expected image/png output, got: {results}"

    def test_execute_markdown_string(self):
        """Test that top-level strings are rendered as markdown."""
        with client.websocket_connect("/ws/execute") as ws:
            # Initialize session
            ws.send_json({"type": "init", "sessionId": self.session_id})
            ws.receive_json()  # init-ack

            # Execute a top-level string (should be treated as markdown)
            ws.send_json({
                "type": "execute",
                "executionId": "exec-1",
                "script": '''"# Hello World\\n\\nThis is **markdown**."'''
            })

            messages = self._collect_messages(ws)
            results = self._get_expression_results(messages)

            assert len(results) == 1
            result = results[0]

            # Should have text/markdown output
            assert len(result["output"]) == 1
            assert result["output"][0]["type"] == "text/markdown"
            assert "Hello World" in result["output"][0]["content"]
            assert "**markdown**" in result["output"][0]["content"]
            assert result["isInvisible"] is False

    def test_execute_multiline_markdown_string(self):
        """Test that triple-quoted strings are rendered as markdown."""
        with client.websocket_connect("/ws/execute") as ws:
            # Initialize session
            ws.send_json({"type": "init", "sessionId": self.session_id})
            ws.receive_json()  # init-ack

            # Execute a triple-quoted string
            ws.send_json({
                "type": "execute",
                "executionId": "exec-1",
                "script": '''"""
# Documentation

This is a *multiline* markdown cell.

- Item 1
- Item 2
"""'''
            })

            messages = self._collect_messages(ws)
            results = self._get_expression_results(messages)

            assert len(results) == 1
            result = results[0]

            # Should have text/markdown output
            assert len(result["output"]) == 1
            assert result["output"][0]["type"] == "text/markdown"
            assert "Documentation" in result["output"][0]["content"]
            assert "*multiline*" in result["output"][0]["content"]
            assert "- Item 1" in result["output"][0]["content"]

    def test_execute_markdown_with_line_range(self):
        """Test that selecting a line within a multiline string executes the whole string."""
        with client.websocket_connect("/ws/execute") as ws:
            # Initialize session
            ws.send_json({"type": "init", "sessionId": self.session_id})
            ws.receive_json()  # init-ack

            # Script with multiline string on lines 2-5
            script = '''x = 1
"""
# Markdown Header
Some content
"""
y = 2'''

            # Execute only line 3 (middle of the string)
            ws.send_json({
                "type": "execute",
                "executionId": "exec-1",
                "script": script,
                "lineRange": {"from": 3, "to": 3}
            })

            messages = self._collect_messages(ws)
            results = self._get_expression_results(messages)

            # Should execute the whole string (lines 2-5)
            assert len(results) == 1
            result = results[0]
            assert result["lineStart"] == 2
            assert result["lineEnd"] == 5
            assert result["output"][0]["type"] == "text/markdown"
            assert "Markdown Header" in result["output"][0]["content"]
