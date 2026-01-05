"""Export functionality for pdit scripts."""

import json
from pathlib import Path
from typing import Any

from .executor import ExecutionResult
from .python_executor import PythonExecutor


def execute_script(script_content: str, script_name: str) -> list[dict[str, Any]]:
    """Execute a script and return expressions in frontend format.

    Args:
        script_content: The Python source code to execute
        script_name: Name of the script (for error messages)

    Returns:
        List of expression dicts ready for frontend consumption
    """
    executor = PythonExecutor()
    expressions = []
    expression_id = 0

    try:
        for result in executor.execute_script(script_content, script_name=script_name):
            if isinstance(result, list):
                # First yield is list of ExpressionInfo - skip
                continue
            elif isinstance(result, ExecutionResult):
                expressions.append({
                    "id": expression_id,
                    "lineStart": result.line_start,
                    "lineEnd": result.line_end,
                    "state": "done",
                    "result": {
                        "output": [{"type": item.type, "content": item.content} for item in result.output],
                        "isInvisible": result.is_invisible
                    }
                })
                expression_id += 1
    finally:
        executor.shutdown()

    return expressions


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
