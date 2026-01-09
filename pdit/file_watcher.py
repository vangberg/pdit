"""
File watching functionality using watchfiles.

Provides a FileWatcher class that monitors a single file for changes
and streams events through an async queue.
"""

import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import AsyncGenerator, Optional, Union
from watchfiles import awatch
import time


@dataclass
class FileEvent:
    """Base class for file watcher events."""
    path: str
    timestamp: int
    type: str = field(init=False)


@dataclass
class InitialFileEvent(FileEvent):
    """Initial file content event."""
    content: str
    type: str = field(default="initial", init=False)


@dataclass
class FileChangedEvent(FileEvent):
    """File modification event."""
    content: str
    type: str = field(default="fileChanged", init=False)


@dataclass
class FileDeletedEvent(FileEvent):
    """File deletion event."""
    type: str = field(default="fileDeleted", init=False)


@dataclass
class FileErrorEvent(FileEvent):
    """File error event."""
    message: str
    type: str = field(default="error", init=False)


class FileWatcher:
    """Watch a single file for changes and stream events.

    Uses watchfiles (Rust-based) for fast, async file watching.

    Usage:
        watcher = FileWatcher("/path/to/file.py")

        async for event in watcher.watch_with_initial():
            if isinstance(event, InitialFileEvent):
                print(f"Initial: {event.content}")
            elif isinstance(event, FileChangedEvent):
                print(f"Changed: {event.content}")
            elif isinstance(event, FileDeletedEvent):
                print("Deleted")
    """

    def __init__(self, file_path: str, stop_event: Optional[threading.Event] = None):
        """Initialize file watcher.

        Args:
            file_path: Absolute path to file to watch
            stop_event: Optional threading.Event to signal watcher to stop
        """
        self.file_path = Path(file_path).resolve()
        self.stop_event = stop_event

    async def watch_with_initial(
        self
    ) -> AsyncGenerator[Union[InitialFileEvent, FileChangedEvent, FileDeletedEvent, FileErrorEvent], None]:
        """Watch file with initial content event.

        Encapsulates all domain logic: file validation, reading, timestamps, error handling.

        Yields:
            FileEvent subclasses with all domain data

        Example:
            watcher = FileWatcher("/path/to/file.py")
            async for event in watcher.watch_with_initial():
                if isinstance(event, InitialFileEvent):
                    print(f"Initial: {event.content}")
                elif isinstance(event, FileChangedEvent):
                    print(f"Changed: {event.content}")
        """
        # Validate file exists
        if not self.file_path.exists():
            yield FileErrorEvent(
                path=str(self.file_path),
                message=f"File not found: {self.file_path}",
                timestamp=int(time.time())
            )
            return

        # Read and yield initial content
        try:
            content = self.file_path.read_text()
            timestamp = int(time.time())

            yield InitialFileEvent(
                path=str(self.file_path),
                content=content,
                timestamp=timestamp
            )
        except Exception as e:
            yield FileErrorEvent(
                path=str(self.file_path),
                message=f"Error reading file: {str(e)}",
                timestamp=int(time.time())
            )
            return

        # Watch for changes in parent directory to detect deletion
        watch_path = self.file_path.parent

        # Use rust_timeout to make awatch check stop_event frequently (100ms)
        # This ensures quick response to server shutdown
        async for changes in awatch(watch_path, stop_event=self.stop_event, rust_timeout=100):
            for change_type, changed_path in changes:
                changed_path = Path(changed_path).resolve()

                # Skip events for other files
                if changed_path != self.file_path:
                    continue

                from watchfiles import Change

                # Handle file deletion
                if change_type == Change.deleted:
                    yield FileDeletedEvent(
                        path=str(self.file_path),
                        timestamp=int(time.time())
                    )
                    return

                # Handle file modification (Change.added or Change.modified)
                try:
                    content = self.file_path.read_text()
                    timestamp = int(time.time())

                    yield FileChangedEvent(
                        path=str(self.file_path),
                        content=content,
                        timestamp=timestamp
                    )
                except Exception as e:
                    yield FileErrorEvent(
                        path=str(self.file_path),
                        message=f"Error reading file: {str(e)}",
                        timestamp=int(time.time())
                    )
                    return
