#!/usr/bin/env python3
"""Simple test to verify frontend can communicate with backend."""

import requests
import json

BACKEND_URL = "http://127.0.0.1:8888"

def test_health():
    """Test health endpoint."""
    response = requests.get(f"{BACKEND_URL}/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    print("✓ Health check passed")

def test_simple_expression():
    """Test simple expression execution."""
    payload = {"script": "2 + 2"}
    response = requests.post(
        f"{BACKEND_URL}/execute-script",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["output"][0]["text"] == "4\n"
    print("✓ Simple expression test passed")

def test_multi_statement():
    """Test multi-statement execution."""
    payload = {"script": "x = 10\ny = 20\nx + y"}
    response = requests.post(
        f"{BACKEND_URL}/execute-script",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 3
    # First two are assignments (invisible)
    assert data["results"][0]["isInvisible"] == True
    assert data["results"][1]["isInvisible"] == True
    # Last is expression (visible)
    assert data["results"][2]["output"][0]["text"] == "30\n"
    print("✓ Multi-statement test passed")

def test_function_definition():
    """Test function definition and call."""
    payload = {"script": "def greet(name):\n    return f'Hello, {name}!'\n\ngreet('rdit')"}
    response = requests.post(
        f"{BACKEND_URL}/execute-script",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 2
    # Function definition is invisible
    assert data["results"][0]["isInvisible"] == True
    # Function call returns result
    assert "'Hello, rdit!'" in data["results"][1]["output"][0]["text"]
    print("✓ Function definition test passed")

def test_error_handling():
    """Test error handling."""
    payload = {"script": "1 / 0"}
    response = requests.post(
        f"{BACKEND_URL}/execute-script",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) == 1
    assert data["results"][0]["output"][0]["type"] == "error"
    assert "ZeroDivisionError" in data["results"][0]["output"][0]["text"]
    print("✓ Error handling test passed")

def test_namespace_persistence():
    """Test that namespace persists across requests."""
    # Define variable
    response1 = requests.post(
        f"{BACKEND_URL}/execute-script",
        json={"script": "test_var = 42"},
        headers={"Content-Type": "application/json"}
    )
    assert response1.status_code == 200

    # Use variable
    response2 = requests.post(
        f"{BACKEND_URL}/execute-script",
        json={"script": "test_var"},
        headers={"Content-Type": "application/json"}
    )
    assert response2.status_code == 200
    data = response2.json()
    assert data["results"][0]["output"][0]["text"] == "42\n"
    print("✓ Namespace persistence test passed")

def test_reset():
    """Test reset endpoint."""
    # Define variable
    requests.post(
        f"{BACKEND_URL}/execute-script",
        json={"script": "reset_test = 123"},
        headers={"Content-Type": "application/json"}
    )

    # Reset
    response = requests.post(f"{BACKEND_URL}/reset")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    # Variable should be gone
    response = requests.post(
        f"{BACKEND_URL}/execute-script",
        json={"script": "reset_test"},
        headers={"Content-Type": "application/json"}
    )
    data = response.json()
    assert data["results"][0]["output"][0]["type"] == "error"
    assert "NameError" in data["results"][0]["output"][0]["text"]
    print("✓ Reset test passed")

if __name__ == "__main__":
    print("Testing Python backend API...")
    print()

    try:
        test_health()
        test_simple_expression()
        test_multi_statement()
        test_function_definition()
        test_error_handling()
        test_namespace_persistence()
        test_reset()

        print()
        print("=" * 50)
        print("All tests passed! ✓")
        print("=" * 50)

    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
