"""Server-Sent Events (SSE) utilities."""
import json
from typing import Any, Dict


def format_sse(data: Dict[str, Any]) -> str:
    """Format data as Server-Sent Event.

    Args:
        data: Dictionary to send as SSE event

    Returns:
        Formatted SSE string: "data: <json>\\n\\n"
    """
    return f"data: {json.dumps(data)}\n\n"
