"""
Base executor protocol for multi-language support.

Executors handle parsing and executing code for a specific language.
They yield execution events that the server forwards to the frontend.
"""

from abc import ABC, abstractmethod
from typing import AsyncGenerator, Protocol, runtime_checkable


@runtime_checkable
class Executor(Protocol):
    """Protocol defining the executor interface.

    All language executors must implement these methods.
    """

    def start(self) -> None:
        """Start the executor in the background (non-blocking).

        For executors with heavy initialization (like IPython kernels),
        this starts the process without blocking. For simple executors
        (like Markdown), this can be a no-op.
        """
        ...

    async def wait_ready(self) -> None:
        """Wait for the executor to be ready.

        Called before executing code. For executors with async startup,
        this waits for initialization to complete.
        """
        ...

    async def execute_script(
        self,
        script: str,
        line_range: tuple[int, int] | None = None,
        script_name: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """Execute a script, yielding events as execution progresses.

        Args:
            script: The full script content to execute
            line_range: Optional (from_line, to_line) to limit execution
            script_name: Optional name of the script file (for error messages)

        Yields:
            First: {"type": "expressions", "expressions": [{"lineStart": N, "lineEnd": N}, ...]}
            Then for each expression: {"lineStart": N, "lineEnd": N, "output": [...], "isInvisible": bool}

            output items have format: {"type": "mime/type", "content": "..."}
            Common types: text/plain, text/html, text/markdown, image/png, stdout, stderr, error
        """
        ...
        # Need yield to make this a generator
        yield {}  # type: ignore

    async def reset(self) -> None:
        """Reset the executor state.

        For stateful executors (like IPython), this clears variables.
        For stateless executors (like Markdown), this is a no-op.
        """
        ...

    async def interrupt(self) -> None:
        """Interrupt any running execution.

        For long-running executors, this stops the current execution.
        For instant executors (like Markdown), this is a no-op.
        """
        ...

    async def shutdown(self) -> None:
        """Shutdown the executor and release resources.

        Called when the session is closed.
        """
        ...


class BaseExecutor(ABC):
    """Abstract base class for executors.

    Provides default no-op implementations for optional methods.
    Subclasses must implement execute_script().
    """

    def start(self) -> None:
        """Start the executor (default: no-op)."""
        pass

    async def wait_ready(self) -> None:
        """Wait for ready (default: no-op, always ready)."""
        pass

    @abstractmethod
    async def execute_script(
        self,
        script: str,
        line_range: tuple[int, int] | None = None,
        script_name: str | None = None
    ) -> AsyncGenerator[dict, None]:
        """Execute a script. Must be implemented by subclasses."""
        ...
        yield {}  # type: ignore

    async def reset(self) -> None:
        """Reset state (default: no-op)."""
        pass

    async def interrupt(self) -> None:
        """Interrupt execution (default: no-op)."""
        pass

    async def shutdown(self) -> None:
        """Shutdown (default: no-op)."""
        pass
