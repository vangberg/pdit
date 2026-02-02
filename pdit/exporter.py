"""Export functionality for pdit scripts."""

import asyncio
import json
from pathlib import Path
from threading import Thread
from typing import Any, Callable, Coroutine

from .ipython_executor import IPythonExecutor


async def _execute_script_async(script_content: str, script_name: str) -> list[dict[str, Any]]:
    """Execute a script and return expressions in frontend format.

    Args:
        script_content: The Python source code to execute
        script_name: Name of the script (for error messages)

    Returns:
        List of expression dicts ready for frontend consumption
    """
    executor = IPythonExecutor()
    expressions = []
    expression_id = 0

    try:
        async for event in executor.execute_script(script_content, script_name=script_name):
            # Skip the expressions list event
            if event.get("type") == "expressions":
                continue
            # Result events have output field
            if "output" in event:
                expressions.append({
                    "id": expression_id,
                    "lineStart": event["lineStart"],
                    "lineEnd": event["lineEnd"],
                    "state": "done",
                    "result": {
                        "output": event["output"],
                        "isInvisible": event["isInvisible"]
                    }
                })
                expression_id += 1
    finally:
        await executor.shutdown()

    return expressions


def _run_async(
    async_fn: Callable[..., Coroutine[Any, Any, Any]],
    *args: Any,
    **kwargs: Any,
) -> Any:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(async_fn(*args, **kwargs))

    result: dict[str, Any] = {}
    error: dict[str, BaseException] = {}

    def runner() -> None:
        try:
            result["value"] = asyncio.run(async_fn(*args, **kwargs))
        except BaseException as exc:
            error["value"] = exc

    thread = Thread(target=runner, daemon=True)
    thread.start()
    thread.join()

    if "value" in error:
        raise error["value"]
    return result["value"]


def execute_script(script_content: str, script_name: str) -> list[dict[str, Any]]:
    """Execute a script and return expressions in frontend format."""
    return _run_async(_execute_script_async, script_content, script_name)


def generate_html(script_content: str, expressions: list[dict[str, Any]]) -> str:
    """Generate self-contained HTML from script and execution results.

    Args:
        script_content: The original Python source code
        expressions: List of expression results from execute_script()

    Returns:
        Complete HTML string ready to write to file

    Raises:
        FileNotFoundError: If export.html template is missing
    """
    static_dir = Path(__file__).parent / "_static"
    export_html_path = static_dir / "export.html"

    if not export_html_path.exists():
        raise FileNotFoundError("export.html not found. Run './scripts/build-frontend.sh' first.")

    template = export_html_path.read_text()

    response_data = {
        "code": script_content,
        "expressions": expressions
    }
    json_data = json.dumps(response_data).replace("<", "\\u003c")
    injection_script = f'<script>window.__pdit_response__ = {json_data};</script>'

    return template.replace('</head>', f'{injection_script}\n</head>')


def export_script(script_path: Path) -> str:
    """Execute a script and generate HTML export.

    Args:
        script_path: Path to the Python script

    Returns:
        Complete HTML string
    """
    script_content = script_path.read_text()
    expressions = execute_script(script_content, script_path.name)
    return generate_html(script_content, expressions)
