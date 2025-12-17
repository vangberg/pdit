"""
Shared data structures for pdit executors.

This module provides common data classes used by both the xeus-python
and legacy executors.
"""

import ast
from dataclasses import dataclass
from typing import List


@dataclass
class ExpressionInfo:
    """Metadata about an expression to be executed."""
    node_index: int
    line_start: int
    line_end: int


@dataclass
class OutputItem:
    """Single output item with MIME type or stream type.

    MIME types: 'text/plain', 'text/html', 'text/markdown', 'image/png', 'application/json'
    Stream types: 'stdout', 'stderr', 'error'
    """
    type: str
    content: str


@dataclass
class ExecutionResult:
    """Result of executing a single statement."""
    node_index: int
    line_start: int
    line_end: int
    output: List[OutputItem]
    is_invisible: bool


def _has_trailing_semicolon(lines: List[str], node: ast.AST) -> bool:
    """Check if statement has trailing semicolon (iPython output suppression).

    Uses AST node end position to look at what comes after the statement.
    Any # after the statement is definitely a comment (not inside a string).

    Args:
        lines: Source code split into lines
        node: AST node to check

    Returns:
        True if there's a semicolon after the statement (before any comment)
    """
    end_line_text = lines[node.end_lineno - 1]
    rest_after_stmt = end_line_text[node.end_col_offset:]
    before_comment = rest_after_stmt.split('#')[0]
    return ';' in before_comment
