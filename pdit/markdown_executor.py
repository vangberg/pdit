"""
Markdown executor for rendering markdown files.

Splits markdown into block-based chunks and renders each chunk to HTML.
"""

from typing import AsyncGenerator

import markdown
from markdown_it import MarkdownIt

from .executor import BaseExecutor


class MarkdownExecutor(BaseExecutor):
    """Executor that renders Markdown to HTML.

    The markdown file is chunked on block boundaries.
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
        self._parser = MarkdownIt("commonmark", {"breaks": True, "html": True})

    async def execute_script(
        self,
        script: str,
        line_range: tuple[int, int] | None = None,
        script_name: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """Render markdown to HTML.

        The script is split into block-based chunks to keep output aligned with
        editor line groups. line_range filters which chunks are executed.

        Yields:
            First: {"type": "expressions", "expressions": [{"lineStart": N, "lineEnd": N}, ...]}
            Then: {"lineStart": N, "lineEnd": N, "output": [{"type": "text/html", "content": "..."}], "isInvisible": false}
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

        block_ranges = self._block_ranges(script)
        chunk_ranges = self._chunk_ranges(block_ranges, line_count)
        if line_range:
            from_line, to_line = line_range
            chunk_ranges = [
                (line_start, line_end)
                for line_start, line_end in chunk_ranges
                if not (line_end < from_line or line_start > to_line)
            ]

        yield {
            "type": "expressions",
            "expressions": [
                {"lineStart": line_start, "lineEnd": line_end}
                for line_start, line_end in chunk_ranges
            ]
        }

        for line_start, line_end in chunk_ranges:
            chunk_text = "\n".join(lines[line_start - 1:line_end])
            if not chunk_text.strip():
                yield {
                    "lineStart": line_start,
                    "lineEnd": line_end,
                    "output": [],
                    "isInvisible": True
                }
                continue

            try:
                # Reset the markdown instance (needed for toc extension)
                self._md.reset()
                html = self._md.convert(chunk_text)

                # Wrap in a div for styling
                styled_html = f'<div class="markdown-body">{html}</div>'

                yield {
                    "lineStart": line_start,
                    "lineEnd": line_end,
                    "output": [{"type": "text/html", "content": styled_html}],
                    "isInvisible": False
                }
            except Exception as e:
                yield {
                    "lineStart": line_start,
                    "lineEnd": line_end,
                    "output": [{"type": "error", "content": str(e)}],
                    "isInvisible": False
                }

    def _block_ranges(self, script: str) -> list[tuple[int, int]]:
        tokens = self._parser.parse(script)
        ranges: list[tuple[int, int]] = []
        for token in tokens:
            if token.level != 0 or token.map is None:
                continue
            if token.nesting not in (0, 1):
                continue
            start = token.map[0] + 1
            end = token.map[1]
            if end < start:
                continue
            ranges.append((start, end))
        return ranges

    def _chunk_ranges(
        self,
        block_ranges: list[tuple[int, int]],
        line_count: int
    ) -> list[tuple[int, int]]:
        if line_count <= 0:
            return [(1, 1)]
        if not block_ranges:
            return [(1, line_count)]

        starts = [start for start, _ in block_ranges]
        if starts[0] > 1:
            starts[0] = 1

        chunks: list[tuple[int, int]] = []
        for idx, start in enumerate(starts):
            if idx + 1 < len(starts):
                end = max(start, starts[idx + 1] - 1)
            else:
                end = line_count
            chunks.append((start, end))
        return chunks
