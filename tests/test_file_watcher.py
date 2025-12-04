"""Tests for FileWatcher class."""
import pytest
import asyncio
import tempfile
from pathlib import Path

from pdit.file_watcher import (
    FileWatcher,
    InitialFileEvent,
    FileChangedEvent,
    FileDeletedEvent,
    FileErrorEvent,
)


@pytest.mark.asyncio
async def test_watch_with_initial_returns_initial_event():
    """Test that watch_with_initial yields initial file content."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("initial content")
        temp_path = f.name

    try:
        watcher = FileWatcher(temp_path)

        events = []
        async for event in watcher.watch_with_initial():
            events.append(event)
            break  # Just get first event

        assert len(events) == 1
        assert isinstance(events[0], InitialFileEvent)
        assert events[0].content == "initial content"
        assert events[0].path == str(Path(temp_path).resolve())
        assert events[0].timestamp > 0
    finally:
        Path(temp_path).unlink()


@pytest.mark.asyncio
async def test_watch_with_initial_detects_file_modification():
    """Test that file modifications are detected and yield FileChangedEvent."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("original")
        temp_path = f.name

    try:
        watcher = FileWatcher(temp_path)

        events = []
        watch_task = asyncio.create_task(_collect_events(watcher, events, max_events=2))

        # Wait a bit for watcher to start
        await asyncio.sleep(0.1)

        # Modify file
        Path(temp_path).write_text("modified")

        # Wait for events
        await asyncio.wait_for(watch_task, timeout=3.0)

        assert len(events) == 2
        assert isinstance(events[0], InitialFileEvent)
        assert events[0].content == "original"

        assert isinstance(events[1], FileChangedEvent)
        assert events[1].content == "modified"

    finally:
        Path(temp_path).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_watch_with_initial_detects_file_deletion():
    """Test that file deletion is detected and yields FileDeletedEvent or FileErrorEvent.

    Note: On some systems, file deletion may be reported as a modification event,
    which causes a read error. Both are acceptable terminal events.
    """
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("content")
        temp_path = f.name

    watcher = FileWatcher(temp_path)

    events = []
    watch_task = asyncio.create_task(_collect_events(watcher, events, max_events=2))

    # Wait for watcher to start
    await asyncio.sleep(0.1)

    # Delete file
    Path(temp_path).unlink()

    # Wait for events
    await asyncio.wait_for(watch_task, timeout=3.0)

    assert len(events) == 2
    assert isinstance(events[0], InitialFileEvent)
    # File deletion can be reported as either:
    # - FileDeletedEvent (ideal case)
    # - FileErrorEvent with "No such file or directory" (modification event after deletion)
    assert isinstance(events[1], (FileDeletedEvent, FileErrorEvent))
    if isinstance(events[1], FileErrorEvent):
        assert "No such file or directory" in events[1].message


@pytest.mark.asyncio
async def test_watch_with_initial_handles_nonexistent_file():
    """Test that watching nonexistent file yields FileErrorEvent."""
    watcher = FileWatcher("/nonexistent/file.py")

    events = []
    async for event in watcher.watch_with_initial():
        events.append(event)
        break

    assert len(events) == 1
    assert isinstance(events[0], FileErrorEvent)
    assert "File not found" in events[0].message


@pytest.mark.asyncio
async def test_watch_with_initial_handles_read_error():
    """Test that read errors yield FileErrorEvent."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("content")
        temp_path = f.name

    try:
        # Make file unreadable
        Path(temp_path).chmod(0o000)

        watcher = FileWatcher(temp_path)

        events = []
        async for event in watcher.watch_with_initial():
            events.append(event)
            break

        assert len(events) == 1
        assert isinstance(events[0], FileErrorEvent)
        assert "Error reading file" in events[0].message

    finally:
        # Restore permissions and delete
        Path(temp_path).chmod(0o644)
        Path(temp_path).unlink()


@pytest.mark.asyncio
async def test_event_has_correct_fields():
    """Test that events have all required fields."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("test content")
        temp_path = f.name

    try:
        watcher = FileWatcher(temp_path)

        async for event in watcher.watch_with_initial():
            # All events should have these fields
            assert hasattr(event, 'type')
            assert hasattr(event, 'path')
            assert hasattr(event, 'timestamp')

            # InitialFileEvent should have content
            if isinstance(event, InitialFileEvent):
                assert hasattr(event, 'content')
                assert event.type == "initial"

            break
    finally:
        Path(temp_path).unlink()


async def _collect_events(watcher, events_list, max_events=10):
    """Helper to collect events from watcher."""
    async for event in watcher.watch_with_initial():
        events_list.append(event)
        if len(events_list) >= max_events:
            break
