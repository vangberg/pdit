"""
File watching functionality using watchfiles.

Provides a FileWatcher class that monitors a single file for changes
and streams events through an async queue.
"""

from pathlib import Path
from typing import Any, Dict
from watchfiles import awatch


class FileWatcher:
    """Watch a single file for changes and stream events.

    Uses watchfiles (Rust-based) for fast, async file watching.

    Usage:
        watcher = FileWatcher("/path/to/file.py")

        async for event in watcher.watch():
            if event["type"] == "modified":
                content = Path(event["path"]).read_text()
                print(f"File changed: {content}")
    """

    def __init__(self, file_path: str):
        """Initialize file watcher.

        Args:
            file_path: Absolute path to file to watch
        """
        self.file_path = Path(file_path).resolve()

    async def watch(self):
        """Watch for file changes and yield events.

        Yields:
            Dict with event type and path
            - {"type": "modified", "path": "/path/to/file"}
            - {"type": "deleted", "path": "/path/to/file"}
        """
        if not self.file_path.exists():
            raise FileNotFoundError(f"File not found: {self.file_path}")

        # Watch the parent directory to detect deletion
        watch_path = self.file_path.parent

        async for changes in awatch(watch_path):
            # changes is a set of (Change, path) tuples
            for change_type, changed_path in changes:
                changed_path = Path(changed_path).resolve()

                # Only yield events for our specific file
                if changed_path == self.file_path:
                    # Map watchfiles change types to our event types
                    # Change.added -> modified (editor recreate pattern)
                    # Change.modified -> modified
                    # Change.deleted -> deleted
                    from watchfiles import Change

                    if change_type in (Change.added, Change.modified):
                        yield {"type": "modified", "path": str(self.file_path)}
                    elif change_type == Change.deleted:
                        yield {"type": "deleted", "path": str(self.file_path)}
                        break  # Stop watching after deletion


def create_file_changed_event(path: str, content: str, timestamp: int) -> Dict[str, Any]:
    """Create fileChanged event data.

    Args:
        path: File path that changed
        content: New file content
        timestamp: Unix timestamp of change

    Returns:
        Event data dict
    """
    return {
        "type": "fileChanged",
        "path": path,
        "content": content,
        "timestamp": timestamp
    }


def create_file_deleted_event(path: str) -> Dict[str, Any]:
    """Create fileDeleted event data.

    Args:
        path: File path that was deleted

    Returns:
        Event data dict
    """
    return {
        "type": "fileDeleted",
        "path": path
    }


def create_error_event(message: str) -> Dict[str, Any]:
    """Create error event data.

    Args:
        message: Error message

    Returns:
        Event data dict
    """
    return {
        "type": "error",
        "message": message
    }
