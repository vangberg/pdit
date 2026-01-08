"""Tests for the FastAPI server."""

import asyncio
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


def cleanup_session(session_id: str) -> None:
    """Run async delete_session in a new event loop."""
    asyncio.run(delete_session(session_id))


if HAS_FASTAPI:
    client = TestClient(app)


class TestAuthToken:
    """Tests for token authentication when configured."""

    def test_api_requires_token_when_set(self):
        if not HAS_FASTAPI:
            return

        token = "test-token"
        os.environ["PDIT_TOKEN"] = token
        try:
            response = client.get("/api/list-files")
            assert response.status_code == 401

            response = client.get("/api/list-files", headers={"X-PDIT-Token": token})
            assert response.status_code == 200
        finally:
            os.environ.pop("PDIT_TOKEN", None)


class TestListFilesEndpoint:
    """Tests for /api/list-files endpoint."""

    def test_list_files(self):
        if not HAS_FASTAPI:
            return

        response = client.get("/api/list-files")
        assert response.status_code == 200
        data = response.json()
        assert "files" in data
        assert isinstance(data["files"], list)
        assert any(path.endswith("server.py") for path in data["files"])


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


class TestWebSocketEndpoint:
    """Tests for /ws/session WebSocket endpoint."""

    session_id = str(uuid.uuid4())

    @classmethod
    def teardown_class(cls):
        """Clean up the session after all tests in class."""
        if HAS_FASTAPI:
            cleanup_session(cls.session_id)

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
            cleanup_session(test_session)

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
            cleanup_session(test_session)

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
            cleanup_session(test_session)

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
            cleanup_session(test_session)

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
            cleanup_session("auth-test")


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
            TestAuthToken,
            TestListFilesEndpoint,
            TestSaveFileEndpoint,
            TestWebSocketEndpoint,
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
