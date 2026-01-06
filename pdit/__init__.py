"""
pdit - Interactive Python code editor with inline execution results.
"""

from .executor import (
    ExecutionResult,
    ExpressionInfo,
    OutputItem,
)

__version__ = "0.1.0"

__all__ = [
    "ExecutionResult",
    "ExpressionInfo",
    "OutputItem",
]
