"""
Shared data structures for pdit executors.

This module provides common data classes used by Python executors.
"""

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

    MIME types: 'text/plain', 'text/html', 'text/markdown', 'image/*', 'application/json'
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
