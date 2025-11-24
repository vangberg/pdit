"""Tests for the FastAPI server."""

try:
    import pytest
except ImportError:
    pytest = None

try:
    from fastapi.testclient import TestClient
    from rdit.server import app
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

from rdit.executor import reset_executor


if HAS_FASTAPI:
    client = TestClient(app)


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def setup_method(self):
        """Reset executor before each test."""
        if HAS_FASTAPI:
            reset_executor()

    def test_health_check(self):
        """Test that health endpoint returns OK."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.get("/api/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestResetEndpoint:
    """Tests for /reset endpoint."""

    def setup_method(self):
        """Reset executor before each test."""
        if HAS_FASTAPI:
            reset_executor()

    def test_reset_endpoint(self):
        """Test that reset endpoint works."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        # Set a variable first
        client.post("/api/execute-script", json={"script": "x = 42"})

        # Reset
        response = client.post("/api/reset")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

        # Try to use the variable - should fail
        response = client.post("/api/execute-script", json={
            "script": "try:\n    x\nexcept NameError:\n    print('cleared')"
        })

        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) > 0
        # Should have error or print output indicating variable is cleared
        has_cleared = any("cleared" in str(out) for r in results for out in r["output"])
        assert has_cleared


class TestExecuteScriptEndpoint:
    """Tests for /execute-script endpoint."""

    def setup_method(self):
        """Reset executor before each test."""
        if HAS_FASTAPI:
            reset_executor()

    def test_execute_simple_expression(self):
        """Test executing a simple expression."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "2 + 2"
        })

        assert response.status_code == 200
        data = response.json()

        assert "results" in data
        assert len(data["results"]) == 1

        result = data["results"][0]
        assert result["lineStart"] == 1
        assert result["lineEnd"] == 1
        assert result["isInvisible"] is False
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "stdout"
        assert "4" in result["output"][0]["text"]

    def test_execute_statement(self):
        """Test executing a statement (no output)."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "x = 10"
        })

        assert response.status_code == 200
        data = response.json()

        assert len(data["results"]) == 1
        result = data["results"][0]
        assert result["isInvisible"] is True
        assert len(result["output"]) == 0

    def test_execute_multiple_statements(self):
        """Test executing multiple statements."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "a = 1\nb = 2\na + b"
        })

        assert response.status_code == 200
        data = response.json()

        assert len(data["results"]) == 3
        assert data["results"][0]["isInvisible"] is True
        assert data["results"][1]["isInvisible"] is True
        assert data["results"][2]["isInvisible"] is False
        assert "3" in data["results"][2]["output"][0]["text"]

    def test_execute_with_error(self):
        """Test that errors are captured."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "1 / 0"
        })

        assert response.status_code == 200
        data = response.json()

        assert len(data["results"]) == 1
        result = data["results"][0]
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "error"
        assert "ZeroDivisionError" in result["output"][0]["text"]

    def test_namespace_persistence(self):
        """Test that namespace persists across requests."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        # Set a variable
        response1 = client.post("/api/execute-script", json={
            "script": "persistent_var = 99"
        })
        assert response1.status_code == 200

        # Use it in next request
        response2 = client.post("/api/execute-script", json={
            "script": "persistent_var"
        })

        assert response2.status_code == 200
        data = response2.json()
        assert "99" in data["results"][0]["output"][0]["text"]

    def test_line_range_filtering(self):
        """Test executing with line range filter."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "a = 1\nb = 2\nc = 3",
            "lineRange": {"from": 2, "to": 2}
        })

        assert response.status_code == 200
        data = response.json()

        # Should only execute line 2
        assert len(data["results"]) == 1
        assert data["results"][0]["lineStart"] == 2

    def test_invalid_syntax(self):
        """Test that syntax errors are returned as execution results."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": "def invalid syntax"
        })

        # Should return 200 with syntax error in results
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 1
        result = data["results"][0]
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "error"
        assert "SyntaxError" in result["output"][0]["text"]

    def test_print_output(self):
        """Test that print output is captured."""
        if not HAS_FASTAPI:
            return  # Skip if FastAPI not installed

        response = client.post("/api/execute-script", json={
            "script": 'print("Hello, World!")'
        })

        assert response.status_code == 200
        data = response.json()

        result = data["results"][0]
        assert len(result["output"]) == 1
        assert result["output"][0]["type"] == "stdout"
        assert "Hello, World!" in result["output"][0]["text"]


class TestReadFileEndpoint:
    """Tests for /read-file endpoint."""

    def setup_method(self):
        """Reset executor before each test."""
        if HAS_FASTAPI:
            reset_executor()

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
