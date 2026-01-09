"""
Markdown executor for rendering markdown files.

Treats the entire markdown file as a single expression and renders it to HTML.
"""

from typing import AsyncGenerator

import markdown

from .executor import BaseExecutor


class MarkdownExecutor(BaseExecutor):
    """Executor that renders Markdown to HTML.

    The entire markdown file is treated as a single expression.
    Rendering is synchronous and instant (no kernel needed).
    """

    def __init__(self) -> None:
        """Initialize the Markdown renderer."""
        self._md = markdown.Markdown(
            extensions=[
                'fenced_code',
                'tables',
                'toc',
                'nl2br',
            ]
        )

    async def execute_script(
        self,
        script: str,
        line_range: tuple[int, int] | None = None,
        script_name: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """Render markdown to HTML.

        The entire script is treated as a single expression spanning all lines.
        line_range is ignored since markdown is always rendered as a whole.

        Yields:
            First: {"type": "expressions", "expressions": [{"lineStart": 1, "lineEnd": N}]}
            Then: {"lineStart": 1, "lineEnd": N, "output": [{"type": "text/html", "content": "..."}], "isInvisible": false}
        """
        # Count lines in the script
        lines = script.split('\n')
        line_count = len(lines)

        # Handle empty script
        if not script.strip():
            yield {
                "type": "expressions",
                "expressions": [{"lineStart": 1, "lineEnd": 1}]
            }
            yield {
                "lineStart": 1,
                "lineEnd": 1,
                "output": [],
                "isInvisible": True
            }
            return

        # Yield the single expression covering all lines
        yield {
            "type": "expressions",
            "expressions": [{"lineStart": 1, "lineEnd": line_count}]
        }

        # Render markdown to HTML
        try:
            # Reset the markdown instance (needed for toc extension)
            self._md.reset()
            html = self._md.convert(script)

            # Wrap in a div for styling
            styled_html = f'<div class="markdown-body">{html}</div>'

            yield {
                "lineStart": 1,
                "lineEnd": line_count,
                "output": [{"type": "text/html", "content": styled_html}],
                "isInvisible": False
            }
        except Exception as e:
            yield {
                "lineStart": 1,
                "lineEnd": line_count,
                "output": [{"type": "error", "content": str(e)}],
                "isInvisible": False
            }
