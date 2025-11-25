"""
File watching functionality using watchdog.

Provides a FileWatcher class that monitors a single file for changes
and streams events through an async queue.
"""

import asyncio
from pathlib import Path
from typing import Optional, Dict
from watchdog.observers.polling import PollingObserver
from watchdog.events import FileSystemEventHandler


# Shared observer instance to avoid duplicate watch errors
_observer: Optional[PollingObserver] = None
_observer_lock = asyncio.Lock()


def _get_observer() -> PollingObserver:
    """Get or create the shared observer instance."""
    global _observer
    if _observer is None:
        _observer = PollingObserver()
        _observer.start()
    return _observer


class FileChangeHandler(FileSystemEventHandler):
    """Handler for file system events."""

    def __init__(self, file_path: Path, queue: asyncio.Queue, loop):
        self.file_path = file_path.resolve()
        self.queue = queue
        self._loop = loop

    def on_modified(self, event):
        """Handle file modification events."""
        if event.is_directory:
            return

        event_path = Path(event.src_path).resolve()
        if event_path == self.file_path:
            # Schedule queue put in the event loop
            asyncio.run_coroutine_threadsafe(
                self.queue.put({"type": "modified", "path": str(self.file_path)}),
                self._loop
            )

    def on_created(self, event):
        """Handle file creation events.

        Some editors delete and recreate files on save, so we treat
        creation of our watched file as a modification.
        """
        if event.is_directory:
            return

        event_path = Path(event.src_path).resolve()
        if event_path == self.file_path:
            # Treat creation as modification (editors often delete+recreate on save)
            asyncio.run_coroutine_threadsafe(
                self.queue.put({"type": "modified", "path": str(self.file_path)}),
                self._loop
            )

    def on_deleted(self, event):
        """Handle file deletion events."""
        if event.is_directory:
            return

        event_path = Path(event.src_path).resolve()
        if event_path == self.file_path:
            # Check if file still exists (might be delete+recreate pattern)
            # Give it a moment to be recreated
            import time
            time.sleep(0.1)
            if not self.file_path.exists():
                # File truly deleted
                asyncio.run_coroutine_threadsafe(
                    self.queue.put({"type": "deleted", "path": str(self.file_path)}),
                    self._loop
                )


class FileWatcher:
    """Watch a single file for changes and stream events."""

    def __init__(self, file_path: str):
        """Initialize file watcher.

        Args:
            file_path: Absolute path to file to watch
        """
        self.file_path = Path(file_path).resolve()
        self.queue: asyncio.Queue = asyncio.Queue()
        self.handler: Optional[FileChangeHandler] = None
        self.watch = None

    def start(self):
        """Start watching the file."""
        if not self.file_path.exists():
            raise FileNotFoundError(f"File not found: {self.file_path}")

        # Watch the parent directory
        watch_dir = self.file_path.parent

        # Get current event loop
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        # Create handler
        self.handler = FileChangeHandler(self.file_path, self.queue, loop)

        # Use shared observer
        observer = _get_observer()
        self.watch = observer.schedule(self.handler, str(watch_dir), recursive=False)

    def stop(self):
        """Stop watching the file."""
        if self.watch:
            try:
                observer = _get_observer()
                observer.unschedule(self.watch)
            except (KeyError, RuntimeError):
                # Watch already unscheduled or observer stopped
                pass
            finally:
                self.watch = None
        self.handler = None

    async def get_events(self):
        """Get file change events as async generator.

        Yields:
            Dict with event type and path
        """
        while True:
            try:
                # Wait for events with timeout to allow for cancellation
                event = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                yield event
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    def __del__(self):
        """Cleanup on deletion."""
        self.stop()
