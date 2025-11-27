# Building a Real-Time File Watcher: From Scratch Tutorial

> **Note:** This tutorial reflects the **improved unified endpoint approach** where `/api/watch-file` sends initial file content immediately via SSE, eliminating the need for a separate `/api/read-file` endpoint. This reduces file I/O by 50% and simplifies frontend code significantly.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Decisions](#architecture-decisions)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [Integration & Testing](#integration--testing)
6. [Production Considerations](#production-considerations)

---

## Overview

### What We're Building

A real-time file synchronization system that:
- Detects when files change on disk (external edits)
- Streams changes to a web frontend via Server-Sent Events (SSE)
- Handles conflict resolution when users have unsaved changes
- Gracefully manages file deletion and connection cleanup

### Use Case

When a user opens a Python file in your web-based editor, they might also edit it in their IDE. Without file watching, these changes would go unnoticed until a manual refresh. With file watching, the web editor stays in sync automatically.

### Technology Stack

- **Backend**: Python with FastAPI and watchfiles library
- **Frontend**: React with EventSource API (native SSE support)
- **Protocol**: Server-Sent Events (SSE) for unidirectional server→client streaming

---

## Architecture Decisions

### Decision 1: File Watching Library

**Options:**
1. **Manual polling** - Check file modification time every N seconds
2. **OS-level events** - Use inotify (Linux), FSEvents (macOS), ReadDirectoryChangesW (Windows)
3. **watchdog** - Python-based cross-platform library
4. **watchfiles** - Rust-based async-first library

**Choice: watchfiles**

**Rationale:**
- ✅ **Native async support** - Built for asyncio from the ground up
- ✅ **Much faster** - Rust-based using the Notify library
- ✅ **Simpler API** - Cleaner than watchdog, async generators
- ✅ **Cross-platform** - Works on Linux, macOS, Windows
- ✅ **Used by uvicorn** - Already common in FastAPI ecosystem
- ✅ **Automatic edge case handling** - Handles editor save patterns
- ❌ Adds a dependency (acceptable trade-off)

**Comparison to watchdog:**
```python
# watchdog: Sync-first, requires threading bridge
# watchfiles: Async-first, direct integration with FastAPI

# Code reduction: ~270 lines → ~117 lines
# No manual observer management, thread-safety concerns, or event loop bridging
```

### Decision 2: Communication Protocol

**Options:**
1. **Polling** - Frontend requests `/api/file-status` every N seconds
2. **WebSockets** - Bidirectional, persistent connection
3. **Server-Sent Events (SSE)** - Unidirectional, server→client streaming

**Choice: Server-Sent Events (SSE)**

**Rationale:**
- ✅ **Unidirectional fit**: File watching is server→client only (no client→server commands needed)
- ✅ **Native browser support**: `EventSource` API built into all modern browsers
- ✅ **Auto-reconnect**: Browsers automatically reconnect on connection loss
- ✅ **Simpler than WebSockets**: No handshake protocol, no message framing
- ✅ **HTTP-friendly**: Works through proxies, load balancers (unlike WebSockets in some configs)
- ❌ One direction only (but we don't need bidirectional)

**When to use WebSockets instead:**
- You need client→server commands (e.g., pause/resume watching)
- You need server→client AND client→server streaming
- You need binary data transfer

**SSE vs Polling comparison:**
```
Polling (every 2 seconds):
- 30 requests/minute × 60 minutes = 1,800 requests/hour
- Latency: 0-2 seconds (average 1 second)
- Overhead: ~1,800 HTTP handshakes

SSE:
- 1 long-lived connection
- Latency: ~50-200ms (near real-time)
- Overhead: 1 HTTP handshake + keep-alive
```

### Decision 3: Unified Read + Watch Endpoint

**Problem:** Original design had two separate endpoints:
- `/api/read-file` - Returns JSON with initial file content
- `/api/watch-file` - SSE stream for file changes

**Issues with two endpoints:**
- File read **twice** (once for initial load, once when watcher starts)
- More complex frontend code (two separate fetch operations)
- Two separate useEffect hooks to manage
- Unnecessary API surface complexity

**Choice: Unified SSE endpoint**

**Rationale:**
- ✅ **Eliminates redundant file read** (50% reduction in I/O)
- ✅ **Simpler frontend** (single EventSource connection)
- ✅ **Faster initial load** (no separate HTTP round-trip)
- ✅ **Cleaner API** (one endpoint instead of two)
- ✅ **Better developer experience** (one pattern to learn)

**New approach:**
```python
# /api/watch-file now sends initial content FIRST
# Then streams changes

# Event sequence:
# 1. {"type": "initial", "content": "...", "timestamp": 123}
# 2. {"type": "fileChanged", "content": "...", "timestamp": 124}
# 3. {"type": "fileDeleted"}
```

**For read-only use cases:**
- Client can close EventSource immediately after receiving `initial` event
- Still more efficient than old approach (1 read vs 2)

### Decision 4: Connection Lifecycle

**Options:**
1. **Session-based**: `/api/watch-file` returns watchId, separate endpoint to stream events
2. **Connection-per-watch**: Open SSE connection = start watching, close = stop watching

**Choice: Connection-per-watch**

**Rationale:**
- ✅ **Simpler**: No need to manage watchId tokens
- ✅ **Auto-cleanup**: Connection close = automatic cleanup (browser refresh, tab close)
- ✅ **No stale watchers**: Can't forget to unwatch (common bug in session-based)
- ✅ **Idempotent**: Reconnecting just opens new watch (old one auto-cleaned)
- ❌ Slightly higher overhead if rapidly reconnecting (rare in practice)

**Session-based alternative:**
```python
# POST /api/watch-file → {"watchId": "abc123"}
# GET /api/watch-events?watchId=abc123 → SSE stream
# DELETE /api/watch-file?watchId=abc123 → cleanup

# Problem: What if DELETE never called? (user closes browser)
# Need timeout logic, heartbeats, etc. → complexity
```

### Decision 5: Async-First Architecture

**watchfiles advantage**: Native async support eliminates complexity

**No need for:**
- ❌ Shared observer management
- ❌ Thread-safety locks
- ❌ Event loop bridging with `run_coroutine_threadsafe()`
- ❌ Manual start/stop lifecycle

**Simple async generator pattern:**
```python
# watchfiles: Direct async iteration
async for changes in awatch(path):
    for change_type, changed_path in changes:
        # Already in async context, just yield
        yield {"type": "modified", "path": str(changed_path)}
```

**Rationale:**
- ✅ **Much simpler code** - No threading complexity
- ✅ **Better performance** - No cross-thread communication overhead
- ✅ **Easier to reason about** - Pure async flow
- ✅ **Automatic cleanup** - When generator exits, watching stops

---

## Backend Implementation

### Step 1: Install Dependencies

```bash
# Add to pyproject.toml
[project]
dependencies = [
    "fastapi>=0.104.0",
    "watchfiles>=0.20.0",
]
```

**Why watchfiles 0.20+?**
- Rust-based for maximum performance
- Native async support (no threading)
- Simpler API than watchdog
- Used by uvicorn and other modern Python tools

### Step 2: Create FileWatcher Class

**File: `rdit/file_watcher.py`**

```python
"""
File watching functionality using watchfiles.

Provides a FileWatcher class that monitors a single file for changes
and streams events through an async generator.
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
```

**Architecture note:**
- **No global state** = Each watcher is independent
- **Native async** = Direct integration with asyncio
- **Auto-cleanup** = When async generator exits, watching stops
- **Rust-based** = Much faster than Python-based solutions

### Step 3: Implement Watch Method

```python
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
                    from watchfiles import Change

                    if change_type in (Change.added, Change.modified):
                        yield {"type": "modified", "path": str(self.file_path)}
                    elif change_type == Change.deleted:
                        yield {"type": "deleted", "path": str(self.file_path)}
                        break  # Stop watching after deletion
```

**Key improvements over watchdog:**

1. **Native async** - No thread bridging needed
   ```python
   # watchfiles: Direct async iteration
   async for changes in awatch(path):
       yield event  # Already in async context

   # watchdog: Complex threading
   asyncio.run_coroutine_threadsafe(queue.put(...), loop)
   ```

2. **Automatic edge case handling**
   - `Change.added` handles editor delete+recreate patterns (Vim, etc.)
   - No manual grace period needed
   - watchfiles coalesces rapid changes automatically

3. **Simpler cleanup**
   - When async generator exits, watching stops
   - No manual `start()`, `stop()`, `__del__()` methods needed
   - No observer unscheduling

4. **Path normalization**
   - `resolve()` handles symlinks, relative paths automatically
   - Ensures consistent path comparison

### Step 4: Create SSE Utility Module

First, let's create a utility module to eliminate SSE formatting duplication:

**File: `rdit/sse.py`**

```python
"""Server-Sent Events (SSE) utilities."""
import json
from typing import Any, Dict


def format_sse(data: Dict[str, Any]) -> str:
    """Format data as Server-Sent Event.

    Args:
        data: Dictionary to send as SSE event

    Returns:
        Formatted SSE string: "data: <json>\\n\\n"
    """
    return f"data: {json.dumps(data)}\n\n"
```

**Why this matters:**
- Both `/api/watch-file` and `/api/execute-script` use SSE
- Without this utility, the format string `f"data: {json.dumps(data)}\n\n"` is duplicated
- Centralizing SSE formatting makes it easier to maintain and modify

### Step 5: Add Event Creator Functions

Add these functions to the end of `rdit/file_watcher.py` to make event structures explicit:

```python
from typing import Any, Dict


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
```

**Benefits:**
- Event schemas are explicit and discoverable
- Easier to test (pure functions with no side effects)
- Reduces inline dict construction repetition
- Keeps event structure close to FileWatcher (domain logic)

### Step 6: FastAPI Unified Endpoint with Clean Organization

Now let's create the unified `/api/watch-file` endpoint using our utilities:

```python
from .sse import format_sse
from .file_watcher import (
    FileWatcher,
    create_file_changed_event,
    create_file_deleted_event,
    create_error_event
)


@app.get("/api/watch-file")
async def watch_file(path: str):
    """Watch a file and stream initial content + changes via SSE.

    This unified endpoint eliminates the need for separate /api/read-file.
    It sends an initial event with file content, then streams change events.

    Args:
        path: Absolute path to the file to watch

    Returns:
        StreamingResponse with text/event-stream media type

    SSE Events:
        - initial: Initial file content (sent first)
        - fileChanged: File was modified (includes new content)
        - fileDeleted: File was deleted (closes connection)
        - error: Error occurred (closes connection)
    """
    async def generate_events():
        try:
            # Validate file exists early
            file_path = Path(path)
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {path}")

            # STEP 1: Read and send initial content FIRST
            # This eliminates the redundant read from old /api/read-file
            try:
                content = file_path.read_text()
                timestamp = int(time.time())

                initial_data = {
                    "type": "initial",
                    "path": path,
                    "content": content,
                    "timestamp": timestamp
                }
                yield format_sse(initial_data)

            except Exception as e:
                # Error reading initial content
                data = create_error_event(f"Error reading file: {str(e)}")
                yield format_sse(data)
                return

            # STEP 2: Now start watching for changes
            watcher = FileWatcher(path)

            # STEP 3: Stream subsequent events
            async for event in watcher.watch():
                if event["type"] == "modified":
                    try:
                        content = file_path.read_text()
                        timestamp = int(time.time())

                        data = create_file_changed_event(path, content, timestamp)
                        yield format_sse(data)

                    except Exception as e:
                        data = create_error_event(f"Error reading file: {str(e)}")
                        yield format_sse(data)
                        break

                elif event["type"] == "deleted":
                    data = create_file_deleted_event(path)
                    yield format_sse(data)
                    break

        except FileNotFoundError:
            data = create_error_event(f"File not found: {path}")
            yield format_sse(data)

        except Exception as e:
            data = create_error_event(str(e))
            yield format_sse(data)

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
```

**Key improvements over original approach:**

1. **Better code organization:**
   - SSE formatting centralized in `format_sse()` utility (no duplication)
   - Event structures explicit via `create_*_event()` functions
   - Separation of concerns: event structure (file_watcher.py) vs transport (sse.py) vs endpoint logic (server.py)

2. **Unified endpoint benefits:**
   - Single HTTP request - Client opens one EventSource, gets everything
   - No race condition - File read happens before watcher starts
   - Client flexibility - Can close after `initial` event if just reading once
   - Simpler error handling - All errors flow through SSE events

3. **watchfiles simplifications:**
   - No `watcher.start()` or `watcher.stop()` needed
   - No `finally` block for cleanup - async generator handles it
   - Direct `async for` iteration over `watcher.watch()`
   - Much cleaner than watchdog's queue-based approach

**Compare the code clarity:**

```python
# ❌ Old: Inline dict construction and SSE formatting (messy)
error_data = {
    "type": "error",
    "message": f"Error reading file: {str(e)}"
}
yield f"data: {json.dumps(error_data)}\n\n"

# ✅ New: Clean separation using utilities
data = create_error_event(f"Error reading file: {str(e)}")
yield format_sse(data)
```

---

## Frontend Implementation

### Step 1: Create React Hook

**File: `web/src/use-script-file.ts`**

```typescript
import { useEffect, useState, useRef } from "react";

interface UseScriptFileOptions {
  watchForChanges?: boolean;  // Enable file watching
  onFileChange?: (newContent: string) => void;  // Callback when file changes
}

interface UseScriptFileResult {
  code: string | null;           // Initial code (from load)
  diskContent: string | null;    // Latest content from disk
  isLoading: boolean;            // Loading initial file
  isWatching: boolean;           // SSE connection active
  error: Error | null;           // Any errors
}
```

**Architecture: Separation of concerns**
- `code`: What user loaded initially (immutable after load)
- `diskContent`: Live updates from disk (changes via SSE)
- Parent component decides how to handle conflicts

### Step 2: Unified Load + Watch Implementation

**Key insight:** With the unified endpoint, we only need **ONE useEffect** instead of two!

```typescript
export function useScriptFile(
  scriptPath: string | null,
  defaultCode: string,
  options: UseScriptFileOptions = {}
): UseScriptFileResult {
  const { watchForChanges = false, onFileChange } = options;

  const [code, setCode] = useState<string | null>(null);
  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const hasReceivedInitialContent = useRef(false);

  // Single effect for both loading AND watching
  useEffect(() => {
    // No script path → use default
    if (!scriptPath) {
      setCode(defaultCode);
      setDiskContent(defaultCode);
      setIsLoading(false);
      return;
    }

    // Reset state for new path
    hasReceivedInitialContent.current = false;
    setIsLoading(true);
    setError(null);

    try {
      // Create EventSource - handles both initial load AND watching!
      const eventSource = new EventSource(
        `/api/watch-file?path=${encodeURIComponent(scriptPath)}`
      );

      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "initial") {
          // First event - initial file content
          console.log("Received initial file content");
          setCode(data.content);
          setDiskContent(data.content);
          setIsLoading(false);
          hasReceivedInitialContent.current = true;

          // If not watching, close connection after initial load
          if (!watchForChanges) {
            eventSource.close();
          }

        } else if (data.type === "fileChanged") {
          // Subsequent events - file was modified
          console.log("File changed on disk");
          setDiskContent(data.content);
          if (onFileChange) {
            onFileChange(data.content);
          }

        } else if (data.type === "fileDeleted") {
          setError(new Error("File was deleted"));
          eventSource.close();

        } else if (data.type === "error") {
          setError(new Error(data.message));
          setIsLoading(false);
          eventSource.close();
        }
      };

      eventSource.onerror = (err) => {
        console.error("EventSource error:", err);

        // Only set error if we haven't received initial content yet
        if (!hasReceivedInitialContent.current) {
          setError(new Error("Failed to load file"));
          setIsLoading(false);
        } else {
          setError(new Error("Connection to file watcher lost"));
        }
        setIsWatching(false);
      };

      eventSource.onopen = () => {
        console.log("EventSource connection opened");
        setIsWatching(watchForChanges);
      };

    } catch (err) {
      console.error("Error setting up file watcher:", err);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false);
      setIsWatching(false);
    }

    // Cleanup: close EventSource on unmount or path change
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setIsWatching(false);
      }
    };
  }, [scriptPath, defaultCode, watchForChanges, onFileChange]);

  return { code, diskContent, isLoading, isWatching, error };
}
```

**Key improvements over old two-effect approach:**

1. **Single useEffect** - Simpler, fewer race conditions
2. **No redundant fetch** - Eliminates separate `/api/read-file` call
3. **Smart connection management** - Closes after `initial` if not watching
4. **Better error handling** - Distinguishes between load errors and connection errors

**Old approach (deprecated):**
```typescript
// ❌ Old: Two separate effects
useEffect(() => {
  // Effect 1: Load with /api/read-file
  fetch(`/api/read-file?path=${path}`)...
}, [scriptPath]);

useEffect(() => {
  // Effect 2: Watch with /api/watch-file
  new EventSource(`/api/watch-file?path=${path}`)...
}, [scriptPath, watchForChanges]);

// Problems:
// - File read twice
// - Complex state coordination between effects
// - Race conditions possible
```

**Why two states (code + diskContent)?**

```typescript
// Scenario: User loads file, makes edits, file changes on disk
code: "print('original')"         // What user loaded
editorContent: "print('edited')"  // User's unsaved changes
diskContent: "print('changed')"   // External edit

// Now we can detect:
hasConflict = editorContent !== code && diskContent !== code
```

### Step 3: EventSource Benefits

**Why EventSource API is perfect for this:**

1. **Auto-reconnect**: Browser automatically reconnects if connection drops
2. **Event parsing**: Handles SSE format (`data: {...}\n\n`) automatically
3. **Standard API**: No custom parsing needed
4. **Built-in browser support**: No libraries required

**EventSource vs fetch() comparison:**

```typescript
// ❌ Manual SSE parsing with fetch
const response = await fetch("/api/watch-file");
const reader = response.body.getReader();
let buffer = "";
while (true) {
  const {value, done} = await reader.read();
  buffer += new TextDecoder().decode(value);
  // Parse SSE format manually... complex!
}

// ✅ EventSource (automatic)
const eventSource = new EventSource("/api/watch-file");
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);  // Already parsed!
};
```

**Connection lifecycle with unified endpoint:**

```
Client                          Server
  │                               │
  ├─ new EventSource(watch-file)─→│
  │                               ├─ Read file
  │                               ├─ Send "initial" event
  │←────────── initial ───────────┤
  │ (setCode, setIsLoading=false) │
  │                               ├─ Start FileWatcher
  │                               │
  │                               ├─ File modified
  │←──────── fileChanged ─────────┤
  │ (setDiskContent)              │
  │                               │
  │ close() if !watchForChanges   │
  └─────────────────────────────→ │
                                  └─ cleanup watcher
```

### Step 4: Integrate with App Component

**File: `web/src/App.tsx`**

```typescript
function App() {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const editorRef = useRef<EditorHandles>(null);

  // Get script path from URL
  const scriptPath = new URLSearchParams(window.location.search).get("path");

  // Load file with watching enabled
  const { code, diskContent, isLoading, isWatching, error } = useScriptFile(
    scriptPath,
    DEFAULT_CODE,
    {
      watchForChanges: true,
      onFileChange: (newContent) => {
        if (hasUnsavedChanges) {
          // User has local edits → show conflict banner
          setHasConflict(true);
        } else {
          // No local edits → safe to auto-reload
          editorRef.current?.setContent(newContent);
          setDoc(newContent);
        }
      },
    }
  );

  // Handle conflict resolution
  const handleReloadFromDisk = () => {
    if (diskContent) {
      editorRef.current?.setContent(diskContent);
      setDoc(diskContent);
      setHasUnsavedChanges(false);
      setHasConflict(false);
    }
  };

  const handleKeepLocalChanges = () => {
    // Just dismiss banner, keep editing
    setHasConflict(false);
  };

  return (
    <div>
      {hasConflict && (
        <ConflictBanner
          onReload={handleReloadFromDisk}
          onKeep={handleKeepLocalChanges}
        />
      )}

      {isWatching && <WatchingIndicator />}

      <Editor
        ref={editorRef}
        initialContent={code}
        onChange={() => setHasUnsavedChanges(true)}
      />
    </div>
  );
}
```

**Conflict resolution logic:**

```
State machine:

┌─────────────────┐
│   File Loaded   │
│ clean = disk    │
└────────┬────────┘
         │
         ├──[user edits]──→ dirty = true
         │                   conflict = false
         │
         ├──[disk changes, clean]──→ auto-reload
         │
         └──[disk changes, dirty]──→ conflict = true
                                      show banner
```

### Step 5: Create Conflict Banner Component

```typescript
interface ConflictBannerProps {
  onReload: () => void;
  onKeep: () => void;
}

function ConflictBanner({ onReload, onKeep }: ConflictBannerProps) {
  return (
    <div style={{
      background: "#fff3cd",
      border: "1px solid #ffc107",
      padding: "12px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
    }}>
      <span>⚠️ File changed on disk</span>
      <button onClick={onReload}>Reload from disk</button>
      <button onClick={onKeep}>Keep my changes</button>
    </div>
  );
}
```

**UX considerations:**

- **Yellow warning color** (not red error): Situation is recoverable
- **Two clear actions**: User understands their options
- **Non-modal**: Doesn't block editing (user can keep typing)

**Alternative UI patterns:**

```typescript
// Pattern 1: Three-way merge (complex, later enhancement)
<ConflictBanner>
  <DiffView left={diskContent} right={editorContent} />
  <button>Accept theirs</button>
  <button>Accept mine</button>
  <button>Manual merge</button>
</ConflictBanner>

// Pattern 2: Auto-reload with undo (simpler)
// Reload immediately, show toast: "Reloaded. [Undo]"
// Click undo = restore user's edits from memory

// Pattern 3: Stash local changes (git-like)
<ConflictBanner>
  <button>Reload (your changes saved to clipboard)</button>
  <button>Keep editing</button>
</ConflictBanner>
```

---

## Integration & Testing

### Backend Testing Strategy

**File: `tests/test_file_watcher.py`**

```python
import pytest
import asyncio
from pathlib import Path
import tempfile
import time

from rdit.file_watcher import FileWatcher


@pytest.mark.asyncio
async def test_file_modification():
    """Test that file modifications are detected."""
    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("initial content")
        temp_path = f.name

    try:
        # Start watching
        watcher = FileWatcher(temp_path)
        watcher.start()

        # Modify file
        Path(temp_path).write_text("modified content")

        # Wait for event
        event = await asyncio.wait_for(
            watcher.queue.get(),
            timeout=2.0  # Watchdog polling interval
        )

        assert event["type"] == "modified"
        assert event["path"] == str(Path(temp_path).resolve())

    finally:
        watcher.stop()
        Path(temp_path).unlink()


@pytest.mark.asyncio
async def test_file_deletion():
    """Test that file deletion is detected."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("content")
        temp_path = f.name

    watcher = FileWatcher(temp_path)
    watcher.start()

    try:
        # Delete file
        Path(temp_path).unlink()

        # Wait for deletion event (includes 100ms grace period)
        event = await asyncio.wait_for(watcher.queue.get(), timeout=3.0)

        assert event["type"] == "deleted"

    finally:
        watcher.stop()


@pytest.mark.asyncio
async def test_vim_save_pattern():
    """Test Vim-style delete+recreate save pattern."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("original")
        temp_path = f.name

    watcher = FileWatcher(temp_path)
    watcher.start()

    try:
        # Simulate Vim save: delete + recreate
        Path(temp_path).unlink()
        time.sleep(0.05)  # Within 100ms grace period
        Path(temp_path).write_text("new content")

        # Should get "modified" event, NOT "deleted"
        event = await asyncio.wait_for(watcher.queue.get(), timeout=3.0)

        assert event["type"] == "modified"  # Not "deleted"!

    finally:
        watcher.stop()
        Path(temp_path).unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_cleanup_on_stop():
    """Test that watcher cleans up properly."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        temp_path = f.name

    watcher = FileWatcher(temp_path)
    watcher.start()

    # Stop watching
    watcher.stop()

    # Modify file - should NOT get event
    Path(temp_path).write_text("changed")

    # Queue should be empty
    try:
        await asyncio.wait_for(watcher.queue.get(), timeout=1.0)
        assert False, "Should not receive event after stop()"
    except asyncio.TimeoutError:
        pass  # Expected

    Path(temp_path).unlink()
```

### Manual Testing with Chrome DevTools MCP

**Test scenario 1: Basic watching**

```bash
# Terminal 1: Start rdit
rdit sample.py

# Browser: Open http://localhost:8000?path=/absolute/path/to/sample.py
# Should see file content load

# Terminal 2: Edit file
echo "print('changed')" > sample.py

# Browser: Should auto-reload (if no unsaved changes)
```

**Test scenario 2: Conflict detection**

```bash
# Browser: Make unsaved edit
# Type in editor: "print('my changes')"

# Terminal: Edit file externally
echo "print('external change')" > sample.py

# Browser: Should show yellow conflict banner
# Click "Reload" → sees external change
# OR click "Keep mine" → banner dismisses, keeps editing
```

**Test scenario 3: Connection cleanup**

```bash
# Browser: Open file watcher
# DevTools → Network tab → should see "watch-file" with status "pending"

# Browser: Close tab

# Server logs: Should see cleanup message
# "FileWatcher stopped for /path/to/file.py"
```

**Test scenario 4: File deletion**

```bash
# Browser: File loaded and watching

# Terminal: Delete file
rm sample.py

# Browser: Should show error banner
# "File was deleted"
# Save button should be disabled
```

### Integration Test with FastAPI TestClient

```python
from fastapi.testclient import TestClient
import tempfile
from pathlib import Path

def test_watch_file_endpoint():
    """Test SSE endpoint streams file changes."""
    from rdit.server import app

    client = TestClient(app)

    # Create temp file
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.py') as f:
        f.write("initial")
        temp_path = f.name

    try:
        # Start watching (SSE stream)
        with client.stream("GET", f"/api/watch-file?path={temp_path}") as response:
            assert response.status_code == 200
            assert response.headers["content-type"] == "text/event-stream"

            # Modify file in background
            import threading
            def modify_file():
                time.sleep(0.5)
                Path(temp_path).write_text("modified")

            thread = threading.Thread(target=modify_file)
            thread.start()

            # Read SSE events
            for line in response.iter_lines():
                if line.startswith("data:"):
                    data = json.loads(line[5:])  # Strip "data: " prefix

                    if data["type"] == "fileChanged":
                        assert data["content"] == "modified"
                        break

            thread.join()
    finally:
        Path(temp_path).unlink()
```

---

## Production Considerations

### 1. **Connection Limits**

**Problem:** Each watch = 1 long-lived HTTP connection

```python
# If 1000 users watching files simultaneously:
# - 1000 open connections
# - 1000 asyncio tasks
# - 1 shared observer (efficient)
```

**Solutions:**

```python
# Option 1: Connection pooling (simple)
MAX_WATCHERS = 100

active_watchers = 0

@app.get("/api/watch-file")
async def watch_file(path: str):
    global active_watchers
    if active_watchers >= MAX_WATCHERS:
        raise HTTPException(503, "Too many active watchers")

    active_watchers += 1
    try:
        # ... streaming logic
    finally:
        active_watchers -= 1


# Option 2: Resource-based limits (sophisticated)
import resource

# Set max open files
resource.setrlimit(resource.RLIMIT_NOFILE, (4096, 4096))


# Option 3: Event batching (advanced)
# Instead of 1 connection per file:
# 1 connection watches multiple files
@app.get("/api/watch-files")  # Note: plural
async def watch_files(paths: List[str]):
    # Stream events from multiple files
    # Reduces connections, increases complexity
```

### 2. **Memory Management**

**Problem:** Each watcher holds event queue in memory

```python
# Worst case: File changes rapidly, events not consumed
# Queue grows unbounded → OOM

class FileWatcher:
    def __init__(self, file_path: str):
        # Unbounded queue (dangerous)
        self.queue = asyncio.Queue()  # Can grow infinitely!


# Solution: Bounded queue with overflow handling
class FileWatcher:
    def __init__(self, file_path: str, max_queue_size: int = 10):
        self.queue = asyncio.Queue(maxsize=max_queue_size)

    def on_modified(self, event):
        try:
            # Non-blocking put
            self.queue.put_nowait({...})
        except asyncio.QueueFull:
            # Drop oldest event or skip (depends on use case)
            try:
                self.queue.get_nowait()  # Drop oldest
                self.queue.put_nowait({...})  # Add new
            except:
                pass  # Skip if queue still full
```

### 3. **Debouncing Rapid Changes**

**Problem:** Text editor saves multiple times per second

```python
# User types: "hello world"
# Auto-save every keystroke:
# - Event: "h"
# - Event: "he"
# - Event: "hel"
# ...
# - Event: "hello world"
#
# Result: 11 SSE events sent!
```

**Solution: Time-based debouncing**

```python
class DebouncedFileWatcher:
    def __init__(self, file_path: str, debounce_seconds: float = 0.5):
        self.file_path = file_path
        self.debounce_seconds = debounce_seconds
        self.pending_event = None
        self.debounce_task = None

    def on_modified(self, event):
        # Cancel previous debounce timer
        if self.debounce_task:
            self.debounce_task.cancel()

        # Start new timer
        self.pending_event = event
        self.debounce_task = asyncio.create_task(self._debounced_put())

    async def _debounced_put(self):
        await asyncio.sleep(self.debounce_seconds)

        # After 500ms of silence, send event
        await self.queue.put(self.pending_event)
        self.pending_event = None
```

**Trade-offs:**
- ✅ Reduces network traffic (11 events → 1)
- ✅ Reduces client updates (smoother UX)
- ❌ Adds latency (500ms delay)

### 4. **Error Recovery**

**Scenarios to handle:**

```python
# 1. File permission changes
# User watching file.py → sudo chmod 000 file.py
# Solution: Send error event, close gracefully

# 2. Network interruption
# SSE connection drops mid-stream
# Solution: Browser auto-reconnects (EventSource built-in)

# 3. Server restart
# All watchers lost
# Solution: Clients reconnect automatically (EventSource)

# 4. Disk full / IO errors
# Can't read file content after modification
# Solution: Send error event with details


# Implementation:
async def generate_events():
    watcher = None
    try:
        watcher = FileWatcher(path)
        watcher.start()

        async for event in watcher.get_events():
            try:
                if event["type"] == "modified":
                    # Read might fail (permissions, disk error)
                    content = Path(path).read_text()
                    yield sse_event({"type": "fileChanged", "content": content})

            except PermissionError:
                yield sse_event({"type": "error", "message": "Permission denied"})
                break
            except OSError as e:
                yield sse_event({"type": "error", "message": str(e)})
                break

    except Exception as e:
        yield sse_event({"type": "error", "message": f"Watcher failed: {e}"})
    finally:
        if watcher:
            watcher.stop()


def sse_event(data: dict) -> str:
    """Format data as SSE event."""
    return f"data: {json.dumps(data)}\n\n"
```

### 5. **Scalability: Multiple Files**

**Current design:** One watch per file

**Scaling to multiple files:**

```typescript
// Option 1: Multiple EventSource connections (simple)
files.forEach(path => {
  const es = new EventSource(`/api/watch-file?path=${path}`);
  // Handle events...
});
// Cost: N connections for N files

// Option 2: Multiplexed watching (complex)
const es = new EventSource(
  `/api/watch-files?paths=${files.join(',')}`
);
es.onmessage = (event) => {
  const {path, type, content} = JSON.parse(event.data);
  // Dispatch to appropriate handler
};
// Cost: 1 connection for N files

// Backend for Option 2:
@app.get("/api/watch-files")
async def watch_files(paths: str):  # Comma-separated
    async def generate():
        watchers = [FileWatcher(p) for p in paths.split(',')]
        for w in watchers:
            w.start()

        try:
            # Merge all event streams
            async for watcher in watchers:
                async for event in watcher.get_events():
                    yield sse_event(event)
        finally:
            for w in watchers:
                w.stop()

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 6. **Security Considerations**

```python
@app.get("/api/watch-file")
async def watch_file(path: str):
    # 🚨 SECURITY ISSUES:
    # 1. Path traversal: path="../../../etc/passwd"
    # 2. Arbitrary file access: path="/etc/shadow"
    # 3. No authentication: anyone can watch any file

    # ✅ MITIGATIONS:

    # 1. Restrict to project directory
    PROJECT_ROOT = Path("/path/to/project").resolve()
    requested_path = Path(path).resolve()

    if not requested_path.is_relative_to(PROJECT_ROOT):
        raise HTTPException(403, "Access denied: path outside project")

    # 2. Validate file extension (if applicable)
    ALLOWED_EXTENSIONS = {'.py', '.js', '.ts', '.md'}
    if requested_path.suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(403, "Access denied: invalid file type")

    # 3. Add authentication
    # (JWT token, session, API key, etc.)

    # 4. Rate limiting per user
    # Prevent DoS: opening 1000 watchers

    # 5. Audit logging
    logger.info(f"User {user_id} watching {path}")
```

### 7. **Performance Optimization**

```python
# Optimization 1: Content diffing
# Don't send full file on every change
# Send only diffs (for large files)

def generate_diff(old_content: str, new_content: str) -> str:
    import difflib
    diff = difflib.unified_diff(
        old_content.splitlines(),
        new_content.splitlines(),
        lineterm=''
    )
    return '\n'.join(diff)

# SSE event:
{
  "type": "fileChanged",
  "diff": "--- old\n+++ new\n@@ -1 +1 @@\n-old\n+new",
  "fullContent": "..."  # Optional fallback
}


# Optimization 2: Gzip compression for SSE
# Large files → compress events

@app.get("/api/watch-file")
async def watch_file(path: str):
    async def generate():
        # ... events
        yield gzip.compress(json.dumps(event).encode())

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Content-Encoding": "gzip"}
    )
```

---

## Summary: Key Takeaways

### Architecture Decisions Recap

| Decision | Choice | Why |
|----------|--------|-----|
| **File watching** | watchfiles library | Rust-based, native async, simpler API |
| **Communication** | Server-Sent Events | Unidirectional, built-in browser support |
| **Unified endpoint** | SSE sends initial + changes | Eliminates redundant reads, simpler frontend |
| **Connection model** | Connection-per-watch | Auto-cleanup, simple |
| **Async architecture** | Direct async generators | No threading, queues, or bridges needed |

### Key Innovation: Unified Read + Watch Endpoint

**Problem solved:** Original implementation had separate `/api/read-file` (JSON) and `/api/watch-file` (SSE) endpoints, requiring:
- Two HTTP requests per file load
- File read **twice** (initial + watch start)
- Two separate useEffect hooks in frontend
- Complex state coordination

**Solution:** Unified `/api/watch-file` endpoint that:
- Sends `initial` event with file content immediately
- Then streams `fileChanged` events for updates
- Client can close after `initial` if not watching
- **50% reduction in file I/O**
- **Simpler frontend code** (1 useEffect instead of 2)
- **Faster initial load** (1 HTTP round-trip instead of 2)

### Implementation Checklist

**Backend:**
- [x] Install watchfiles
- [x] Create FileWatcher class with async watch() method
- [x] Handle modification, creation, deletion events via watchfiles Change types
- [x] Create unified `/api/watch-file` endpoint that sends initial content first
- [x] Add `initial` event type with file content
- [x] Stream subsequent `fileChanged` events
- [x] Use async generator for automatic cleanup

**Frontend:**
- [x] Create useScriptFile hook with unified load + watch
- [x] Single useEffect for both initial load and watching
- [x] Handle `initial` event to set code and diskContent
- [x] Use EventSource for SSE connection
- [x] Close connection after `initial` if not watching
- [x] Track code vs diskContent separately
- [x] Implement conflict detection logic
- [x] Create ConflictBanner component
- [x] Handle auto-reload for clean state

**Testing:**
- [x] Unit tests for FileWatcher
- [x] Integration tests for SSE endpoint
- [x] Manual testing with Chrome DevTools
- [x] Test editor save patterns (Vim, VS Code)
- [x] Test connection cleanup

**Production:**
- [ ] Add connection limits
- [ ] Implement bounded queues
- [ ] Add debouncing for rapid changes
- [ ] Secure path access (validation, auth)
- [ ] Add monitoring and logging
- [ ] Consider content diffing for large files

### Common Pitfalls

1. **Forgetting to watch parent directory** (can't watch file directly)
2. **Auto-reload conflicts** (check hasUnsavedChanges first)
3. **Path traversal security** (validate paths!)
4. **Not closing EventSource after initial load** (keeps connection open unnecessarily if not watching)
5. **Two separate endpoints for read + watch** (redundant I/O, use unified endpoint instead)

**Pitfalls eliminated by watchfiles:**
- ❌ ~~No grace period for deletion~~ (watchfiles handles this)
- ❌ ~~Blocking event loop~~ (native async, no threading)
- ❌ ~~No connection cleanup~~ (async generator auto-cleanup)
- ❌ ~~Unbounded queues~~ (no queues needed)

### Next Steps: Enhancements

1. **Diff view UI**: Show side-by-side comparison in conflict banner
2. **Three-way merge**: Smart merge local + disk changes
3. **Directory watching**: Watch entire project, not just one file
4. **Undo support**: Auto-reload with option to undo
5. **Collaborative editing**: Multiple users, CRDT-based sync
6. **Content streaming**: Incremental updates for huge files
7. **Offline support**: Queue changes, sync when reconnected

---

## Further Reading

- [watchfiles documentation](https://watchfiles.helpmanual.io/)
- [watchfiles on PyPI](https://pypi.org/project/watchfiles/)
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [FastAPI: Server-Sent Events](https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse)
- [React: useEffect cleanup](https://react.dev/reference/react/useEffect#disconnecting-from-a-chat-server)
- [Rust Notify library](https://github.com/notify-rs/notify) - The underlying library watchfiles uses

**Example projects using watchfiles:**
- [uvicorn](https://github.com/encode/uvicorn) - ASGI server with auto-reload
- [mkdocs](https://www.mkdocs.org/) - Documentation site generator with live reload

---

**Tutorial complete!** You now have a comprehensive understanding of how to implement real-time file watching from scratch, with rationales for every architectural decision.
