"""Tests for the FastAPI server."""

import json
import os
import uuid

try:
    import pytest
except ImportError:
    pytest = None

try:
    from fastapi.testclient import TestClient
    from pdit.server import app, delete_session
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False


if HAS_FASTAPI:
    client = TestClient(app)


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_check(self):
        """Test that health endpoint returns OK."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.get("/api/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestResetEndpoint:
    """Tests for /reset endpoint."""

    # Class-level session - shared across all tests, cleaned up once at end
    session_id = str(uuid.uuid4())

    @classmethod
    def teardown_class(cls):
        """Clean up the session after all tests in class."""
        if HAS_FASTAPI:
            delete_session(cls.session_id)

    def _parse_sse_response(self, response):
        """Parse SSE response into list of results."""
        results = []
        lines = response.text.split('\n')
        for line in lines:
            if line.startswith('data: '):
                data_str = line[6:]  # Remove 'data: ' prefix
                if data_str.strip():
                    try:
                        data = json.loads(data_str)
                        if 'type' not in data or data.get('type') != 'complete':
                            results.append(data)
                    except json.JSONDecodeError:
                        pass
        return results

    def test_reset_endpoint(self):
        """Test that reset endpoint works."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        # Set a variable first
        client.post("/api/execute-script", json={"script": "x = 42", "sessionId": self.session_id})

        # Reset
        response = client.post("/api/reset", json={"sessionId": self.session_id})

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

        # Try to use the variable - should fail
        response = client.post("/api/execute-script", json={
            "script": "try:\n    x\nexcept NameError:\n    print('cleared')",
            "sessionId": self.session_id
        })

        assert response.status_code == 200
        results = self._parse_sse_response(response)
        assert len(results) > 0
        # Should have error or print output indicating variable is cleared
        has_cleared = any("cleared" in str(out) for r in results for out in r.get("output", []))
        assert has_cleared


class TestInterruptEndpoint:
    """Tests for /interrupt endpoint."""

    # Class-level session - shared across all tests, cleaned up once at end
    session_id = str(uuid.uuid4())

    @classmethod
    def teardown_class(cls):
        """Clean up the session after all tests in class."""
        if HAS_FASTAPI:
            delete_session(cls.session_id)

    def _parse_sse_response(self, response):
        """Parse SSE response into list of results."""
        results = []
        lines = response.text.split('\n')
        for line in lines:
            if line.startswith('data: '):
                data_str = line[6:]  # Remove 'data: ' prefix
                if data_str.strip():
                    try:
                        data = json.loads(data_str)
                        if data.get('type') not in ('expressions', 'complete'):
                            results.append(data)
                    except json.JSONDecodeError:
                        pass
        return results

    def test_interrupt_endpoint(self):
        """Test that interrupt endpoint returns OK."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        # Initialize the session first
        client.post("/api/init-session", json={"sessionId": self.session_id})

        # Send interrupt (even with nothing running, should return OK)
        response = client.post("/api/interrupt", json={
            "sessionId": self.session_id
        })

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_interrupt_stops_execution(self):
        """Test that interrupt actually stops running code."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        import concurrent.futures
        import time

        # Use ThreadPoolExecutor to run execution and interrupt concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            # Start long-running execution
            def run_execution():
                return client.post("/api/execute-script", json={
                    "script": "import time\nfor i in range(100):\n    time.sleep(0.1)",
                    "sessionId": self.session_id
                })

            execution_future = executor.submit(run_execution)

            # Wait for execution to start, then interrupt
            time.sleep(0.3)
            client.post("/api/interrupt", json={"sessionId": self.session_id})

            # Get execution result (should complete quickly due to interrupt)
            try:
                response = execution_future.result(timeout=5)
                results = self._parse_sse_response(response)

                # Should have KeyboardInterrupt error
                has_interrupt = any(
                    "KeyboardInterrupt" in str(out.get("content", ""))
                    for r in results
                    for out in r.get("output", [])
                )
                assert has_interrupt, f"Expected KeyboardInterrupt in output, got: {results}"
            except concurrent.futures.TimeoutError:
                pytest.fail("Execution did not complete after interrupt")


class TestExecuteScriptEndpoint:
    """Tests for /execute-script endpoint."""

    # Class-level session - shared across all tests, cleaned up once at end
    session_id = str(uuid.uuid4())

    @classmethod
    def teardown_class(cls):
        """Clean up the session after all tests in class."""
        if HAS_FASTAPI:
            delete_session(cls.session_id)

    def _parse_sse_response(self, response):
        """Parse SSE response into list of execution results (excluding expressions/complete events)."""
        results = []
        lines = response.text.split('\n')
        for line in lines:
            if line.startswith('data: '):
                data_str = line[6:]  # Remove 'data: ' prefix
                if data_str.strip():
                    try:
                        data = json.loads(data_str)
                        # Skip expressions/cancelled events and complete event
                        if data.get('type') in ('expressions', 'cancelled', 'complete'):
                            continue
                        results.append(data)
                    except json.JSONDecodeError:
                        pass
        return results

    def test_execute_simple_expression(self):
        """Test executing a simple expression."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "2 + 2",
            "sessionId": self.session_id
        })

        assert response.status_code == 200
        results = self._parse_sse_response(response)

        assert len(results) == 1

    def test_execute_statement(self):
        """Test executing a statement (no output)."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "x = 10",
            "sessionId": self.session_id
        })

        assert response.status_code == 200
        results = self._parse_sse_response(response)

        assert len(results) == 1
        result = results[0]
        assert result["isInvisible"] is True
        assert len(result["output"]) == 0

    def test_execute_multiple_statements(self):
        """Test executing multiple statements."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "a = 1\nb = 2\na + b",
            "sessionId": self.session_id
        })

        assert response.status_code == 200
        results = self._parse_sse_response(response)

        assert len(results) == 3
        assert results[0]["isInvisible"] is True
        assert results[1]["isInvisible"] is True
        assert results[2]["isInvisible"] is False
        assert "3" in results[2]["output"][0]["content"]

    def test_execute_with_error(self):
        """Test that errors are captured."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "1 / 0",
            "sessionId": self.session_id
        })

        assert response.status_code == 200
        results = self._parse_sse_response(response)

        assert len(results) == 1
        result = results[0]
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "error"
        assert "ZeroDivisionError" in result["output"][0]["content"]

    def test_namespace_persistence(self):
        """Test that namespace persists across requests within same session."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        # Set a variable
        response1 = client.post("/api/execute-script", json={
            "script": "persistent_var = 99",
            "sessionId": self.session_id
        })
        assert response1.status_code == 200

        # Use it in next request (same session)
        response2 = client.post("/api/execute-script", json={
            "script": "persistent_var",
            "sessionId": self.session_id
        })

        assert response2.status_code == 200
        results = self._parse_sse_response(response2)
        assert "99" in results[0]["output"][0]["content"]

    def test_reset_flag_clears_namespace(self):
        """Test that reset=true clears the namespace before execution."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        # Set a variable
        response1 = client.post("/api/execute-script", json={
            "script": "reset_test_var = 42",
            "sessionId": self.session_id
        })
        assert response1.status_code == 200

        # Execute with reset=true - variable should not exist
        response2 = client.post("/api/execute-script", json={
            "script": "try:\n    reset_test_var\nexcept NameError:\n    print('cleared')",
            "sessionId": self.session_id,
            "reset": True
        })

        assert response2.status_code == 200
        results = self._parse_sse_response(response2)
        # Should have output indicating variable is cleared
        has_cleared = any("cleared" in str(out.get("content", "")) for r in results for out in r.get("output", []))
        assert has_cleared, f"Expected 'cleared' in output, got: {results}"

    def test_line_range_filtering(self):
        """Test executing with line range filter."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "a = 1\nb = 2\nc = 3",
            "lineRange": {"from": 2, "to": 2},
            "sessionId": self.session_id
        })

        assert response.status_code == 200
        results = self._parse_sse_response(response)

        # Should only execute line 2
        assert len(results) == 1
        assert results[0]["lineStart"] == 2

    def test_invalid_syntax(self):
        """Test that syntax errors are returned as execution results."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "def invalid syntax",
            "sessionId": self.session_id
        })

        # Should return 200 with syntax error in results
        assert response.status_code == 200
        results = self._parse_sse_response(response)
        assert len(results) == 1
        result = results[0]
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "error"
        assert "SyntaxError" in result["output"][0]["content"]

    def test_print_output(self):
        """Test that print output is captured."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": 'print("Hello, World!")',
            "sessionId": self.session_id
        })

        assert response.status_code == 200
        results = self._parse_sse_response(response)

        result = results[0]
        # IPython may split output into multiple items
        assert len(result["output"]) >= 1
        stdout_outputs = [o for o in result["output"] if o["type"] == "stdout"]
        assert len(stdout_outputs) >= 1
        combined_output = "".join(o["content"] for o in stdout_outputs)
        assert "Hello, World!" in combined_output


class TestAuthToken:
    """Tests for token authentication when configured."""

    def test_api_requires_token_when_set(self):
        token = "test-token"
        os.environ["PDIT_TOKEN"] = token
        try:
            response = client.get("/api/health")
            assert response.status_code == 401

            response = client.get("/api/health", headers={"X-PDIT-Token": token})
            assert response.status_code == 200
            assert response.json() == {"status": "ok"}
        finally:
            os.environ.pop("PDIT_TOKEN", None)


class TestReadFileEndpoint:
    """Tests for /read-file endpoint."""

    def test_read_existing_file(self):
        """Test reading a file that exists."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        # Read this test file itself
        import os
        test_file = os.path.abspath(__file__)

        response = client.get(f"/api/read-file?path={test_file}")

        assert response.status_code == 200
        data = response.json()
        assert "content" in data
        assert "TestReadFileEndpoint" in data["content"]

    def test_read_nonexistent_file(self):
        """Test reading a file that doesn't exist."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.get("/api/read-file?path=/nonexistent/file.py")

        assert response.status_code == 404
        assert "File not found" in response.json()["detail"]


class TestSaveFileEndpoint:
    """Tests for /save-file endpoint."""

    def test_save_file(self):
        """Test saving a file."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        import tempfile
        import os

        # Create a temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            test_file = f.name
            f.write("# original content")

        try:
            # Save new content
            new_content = "# updated content\nprint('hello')"
            response = client.post("/api/save-file", json={
                "path": test_file,
                "content": new_content
            })

            assert response.status_code == 200
            assert response.json() == {"status": "ok"}

            # Verify content was written
            with open(test_file, 'r') as f:
                saved_content = f.read()
            assert saved_content == new_content

        finally:
            os.unlink(test_file)

    def test_save_file_invalid_path(self):
        """Test saving to an invalid path."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/save-file", json={
            "path": "/nonexistent/directory/file.py",
            "content": "test content"
        })

        assert response.status_code == 500
        assert "Error saving file" in response.json()["detail"]


# Note: /api/watch-file endpoint tests are skipped because TestClient
# doesn't handle long-lived SSE streams well (blocks waiting for stream to close).
# The FileWatcher domain logic is fully tested in test_file_watcher.py.
# Integration testing of the SSE endpoint should be done with a real browser or httpx.


class TestWebSocketEndpoint:
    """Tests for /ws/session WebSocket endpoint."""

    session_id = str(uuid.uuid4())

    @classmethod
    def teardown_class(cls):
        """Clean up the session after all tests in class."""
        if HAS_FASTAPI:
            delete_session(cls.session_id)

    def test_websocket_connect_disconnect(self):
        """Test WebSocket connection and session cleanup."""
        if not HAS_FASTAPI:
            return

        test_session = str(uuid.uuid4())
        with client.websocket_connect(f"/ws/session?sessionId={test_session}") as ws:
            # Connection established - session should exist now
            pass
        # After disconnect, session should be cleaned up
        # (we can't easily verify this without accessing _sessions, but it shouldn't error)

    def test_websocket_execute_simple(self):
        """Test code execution via WebSocket."""
        if not HAS_FASTAPI:
            return

        with client.websocket_connect(f"/ws/session?sessionId={self.session_id}") as ws:
            # Send execute message
            ws.send_json({
                "type": "execute",
                "script": "2 + 2"
            })

            # Should receive expressions event first
            msg = ws.receive_json()
            assert msg["type"] == "expressions"
            assert len(msg["expressions"]) == 1

            # Then result
            msg = ws.receive_json()
            assert "lineStart" in msg
            assert "output" in msg
            assert "4" in msg["output"][0]["content"]

            # Then complete
            msg = ws.receive_json()
            assert msg["type"] == "complete"

    def test_websocket_execute_multiple_statements(self):
        """Test executing multiple statements via WebSocket."""
        if not HAS_FASTAPI:
            return

        with client.websocket_connect(f"/ws/session?sessionId={self.session_id}") as ws:
            ws.send_json({
                "type": "execute",
                "script": "a = 1\nb = 2\na + b"
            })

            # Expressions event
            msg = ws.receive_json()
            assert msg["type"] == "expressions"
            assert len(msg["expressions"]) == 3

            # Three results
            results = []
            for _ in range(3):
                msg = ws.receive_json()
                results.append(msg)

            # Complete
            msg = ws.receive_json()
            assert msg["type"] == "complete"

            # Verify results
            assert results[0]["isInvisible"] is True
            assert results[1]["isInvisible"] is True
            assert results[2]["isInvisible"] is False
            assert "3" in results[2]["output"][0]["content"]

    def test_websocket_execute_with_error(self):
        """Test that errors are captured via WebSocket."""
        if not HAS_FASTAPI:
            return

        test_session = str(uuid.uuid4())
        try:
            with client.websocket_connect(f"/ws/session?sessionId={test_session}") as ws:
                ws.send_json({
                    "type": "execute",
                    "script": "1 / 0"
                })

                # Expressions
                msg = ws.receive_json()
                assert msg["type"] == "expressions"

                # Result with error
                msg = ws.receive_json()
                assert len(msg["output"]) == 1
                assert msg["output"][0]["type"] == "error"
                assert "ZeroDivisionError" in msg["output"][0]["content"]

                # Complete
                msg = ws.receive_json()
                assert msg["type"] == "complete"
        finally:
            delete_session(test_session)

    def test_websocket_busy_rejection(self):
        """Test that concurrent executions are rejected with busy."""
        if not HAS_FASTAPI:
            return

        import time
        import threading

        test_session = str(uuid.uuid4())
        received_busy = threading.Event()
        test_passed = [False]

        try:
            with client.websocket_connect(f"/ws/session?sessionId={test_session}") as ws:
                # Use exec to avoid multi-statement which sends results immediately
                ws.send_json({
                    "type": "execute",
                    "script": "exec('import time\\ntime.sleep(10)')"
                })

                # Wait for execution to start
                msg = ws.receive_json()
                assert msg.get("type") == "expressions"

                # Now try to send another execution while the first is running
                # We need to send it quickly before exec completes
                ws.send_json({
                    "type": "execute",
                    "script": "1 + 1"
                })

                # Collect messages - we should get busy for the second request
                messages = []
                interrupt_sent = False
                for _ in range(10):  # Limit iterations
                    msg = ws.receive_json()
                    messages.append(msg)
                    if msg.get("type") == "busy":
                        test_passed[0] = True
                        if not interrupt_sent:
                            ws.send_json({"type": "interrupt"})
                            interrupt_sent = True
                    if msg.get("type") == "complete":
                        break

                assert test_passed[0], f"Expected busy message, got: {messages}"
        finally:
            delete_session(test_session)

    def test_websocket_interrupt(self):
        """Test interrupt via WebSocket."""
        if not HAS_FASTAPI:
            return

        import time
        import threading

        test_session = str(uuid.uuid4())
        try:
            with client.websocket_connect(f"/ws/session?sessionId={test_session}") as ws:
                # Use exec to make it a single statement that sleeps
                ws.send_json({
                    "type": "execute",
                    "script": "exec('import time\\ntime.sleep(30)')"
                })

                # Receive expressions
                msg = ws.receive_json()
                assert msg.get("type") == "expressions"

                # Wait a bit then interrupt
                time.sleep(0.5)
                ws.send_json({"type": "interrupt"})

                # Collect all messages until complete
                messages = []
                while True:
                    msg = ws.receive_json()
                    messages.append(msg)
                    if msg.get("type") == "complete":
                        break

                # Should have KeyboardInterrupt in one of the result messages
                has_interrupt = any(
                    "KeyboardInterrupt" in str(out.get("content", ""))
                    for m in messages
                    for out in m.get("output", [])
                )
                assert has_interrupt, f"Expected KeyboardInterrupt, got: {messages}"
        finally:
            delete_session(test_session)

    def test_websocket_reset(self):
        """Test reset via WebSocket."""
        if not HAS_FASTAPI:
            return

        test_session = str(uuid.uuid4())
        try:
            with client.websocket_connect(f"/ws/session?sessionId={test_session}") as ws:
                # Set a variable
                ws.send_json({
                    "type": "execute",
                    "script": "ws_test_var = 42"
                })
                # Drain events until complete
                while True:
                    msg = ws.receive_json()
                    if msg.get("type") == "complete":
                        break

                # Reset
                ws.send_json({"type": "reset"})

                # Try to use the variable - should fail
                ws.send_json({
                    "type": "execute",
                    "script": "try:\n    ws_test_var\nexcept NameError:\n    print('cleared')"
                })

                # Drain to complete and check output
                messages = []
                while True:
                    msg = ws.receive_json()
                    messages.append(msg)
                    if msg.get("type") == "complete":
                        break

                has_cleared = any(
                    "cleared" in str(out.get("content", ""))
                    for m in messages
                    for out in m.get("output", [])
                )
                assert has_cleared, f"Expected 'cleared' in output, got: {messages}"
        finally:
            delete_session(test_session)

    def test_websocket_auth(self):
        """Test token authentication for WebSocket."""
        if not HAS_FASTAPI:
            return

        token = "ws-test-token"
        os.environ["PDIT_TOKEN"] = token
        try:
            # Without token - should fail
            try:
                with client.websocket_connect(f"/ws/session?sessionId=auth-test") as ws:
                    # If we get here, auth didn't work
                    pass
                assert False, "Expected WebSocket to reject without token"
            except Exception:
                pass  # Expected - connection should fail

            # With token - should work
            with client.websocket_connect(f"/ws/session?sessionId=auth-test&token={token}") as ws:
                ws.send_json({"type": "execute", "script": "1 + 1"})
                msg = ws.receive_json()
                assert msg["type"] == "expressions"
        finally:
            os.environ.pop("PDIT_TOKEN", None)
            delete_session("auth-test")


if __name__ == "__main__":
    """Run tests without pytest for development."""
    import sys

    if not HAS_FASTAPI:
        print("FastAPI not installed - skipping server tests")
        sys.exit(0)

    if pytest is not None:
        # Use pytest if available
        sys.exit(pytest.main([__file__, "-v"]))
    else:
        # Simple manual test runner
        print("Running server tests without pytest...\n")

        test_classes = [
            TestHealthEndpoint,
            TestResetEndpoint,
            TestExecuteScriptEndpoint,
            TestReadFileEndpoint,
            TestSaveFileEndpoint,
        ]

        total = 0
        passed = 0
        failed = []

        for test_class in test_classes:
            print(f"\n{test_class.__name__}:")
            test_instance = test_class()

            # Get all test methods
            test_methods = [
                m for m in dir(test_instance)
                if m.startswith("test_") and callable(getattr(test_instance, m))
            ]

            for method_name in test_methods:
                total += 1
                try:
                    # Run setup if it exists
                    if hasattr(test_instance, "setup_method"):
                        test_instance.setup_method()

                    # Run test
                    method = getattr(test_instance, method_name)
                    method()

                    print(f"  ✅ {method_name}")
                    passed += 1
                except AssertionError as e:
                    print(f"  ❌ {method_name}: {e}")
                    failed.append(f"{test_class.__name__}.{method_name}")
                except Exception as e:
                    print(f"  ❌ {method_name}: {type(e).__name__}: {e}")
                    failed.append(f"{test_class.__name__}.{method_name}")

        print(f"\n{'=' * 60}")
        print(f"Results: {passed}/{total} tests passed")

        if failed:
            print(f"\nFailed tests:")
            for test in failed:
                print(f"  - {test}")
            sys.exit(1)
        else:
            print("\n✅ All tests passed!")
            sys.exit(0)
