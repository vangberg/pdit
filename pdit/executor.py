"""
Shared data structures for pdit executors.

This module provides common data classes used by both the xeus-python
and legacy executors.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Dict, List, Literal, Optional, Tuple

if TYPE_CHECKING:
    from fastapi import WebSocket
    from .xeus_executor import XeusPythonExecutor


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


@dataclass
class ExecutionState:
    """State for a single execution (one execute-script call)."""
    execution_id: str
    session_id: str
    script: str
    line_range: Optional[Tuple[int, int]]

    # Expression tracking
    expressions: List[ExpressionInfo] = field(default_factory=list)
    results: Dict[int, ExecutionResult] = field(default_factory=dict)

    # Progress tracking
    status: Literal['pending', 'running', 'completed', 'cancelled', 'error'] = 'pending'
    current_index: Optional[int] = None
    error_message: Optional[str] = None

    # Timing
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    # Execution control
    task: Optional[asyncio.Task] = None


@dataclass
class Session:
    """A session represents a persistent Python kernel + connection."""
    session_id: str
    executor: 'XeusPythonExecutor'
    websocket: Optional['WebSocket'] = None
    current_execution: Optional[ExecutionState] = None
    execution_history: Dict[str, ExecutionState] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    last_active: datetime = field(default_factory=datetime.now)

    # Execution queue for queued executions
    execution_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
