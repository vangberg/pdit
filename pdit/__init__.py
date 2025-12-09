"""
pdit - Interactive Python code editor with inline execution results.
"""

from .executor import (
    ExecutionResult,
    OutputItem,
    PythonExecutor,
    Statement,
)

__version__ = "0.1.0"

__all__ = [
    "ExecutionResult",
    "OutputItem",
    "PythonExecutor",
    "Statement",
]
