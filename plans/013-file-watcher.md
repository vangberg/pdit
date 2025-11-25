# File watcher

When a script is loaded through /api/read-file we need to set up
a file watcher, which will notify the frontend of changes to the file on disk.

## Overview

Enable real-time sync of file content from disk. When a user opens a file in the editor, we watch that file for changes and notify the frontend immediately, allowing the editor to update with external modifications.

## MVP Scope

**In scope (MVP):**

- Detect file modifications and stream to frontend via SSE
- Auto-reload when no local changes
- Show simple banner "[Reload] [Keep mine]" when user has unsaved changes
- Handle file deletion (close watch, show error)

**Out of scope (future enhancements):**

- Diff view UI
- Three-way merge
- Multiple file watching
- Directory watching

## Backend Implementation

### File Watching Library

- Add `watchdog` package to dependencies (standard Python file watching)
- Create `FileWatcher` class to manage watch lifecycle
- Use watchdog's native event coalescing (no manual debouncing initially)

### Connection Model: Long-lived SSE

Use Server-Sent Events (SSE) for streaming file changes, similar to `/api/execute-script` but with a **persistent connection**:

- **GET /api/watch-file?path={path}** - Start watching and stream changes
  - Frontend provides path from URL query param (same as `/api/read-file`)
  - Opens long-lived SSE connection
  - Streams file change events as they occur
  - Connection stays open until client disconnects or file is deleted
  - One watch per connection (no watcherId needed)
  - Auto-cleanup when connection closes

### Real-time Event Streaming

Send SSE events when file changes detected:

**File changed event:**

```
data: {"type": "fileChanged", "path": "/path/to/file.py", "content": "new file content", "timestamp": 1234567890}

```

**File deleted event (closes watch):**

```
data: {"type": "fileDeleted", "path": "/path/to/file.py"}

```

**Error event (closes watch):**

```
data: {"type": "error", "message": "Error reading file"}

```

### State Management

- Track active watcher per SSE connection in memory
- Automatic cleanup when SSE connection closes (client disconnect or error)
- Stop watching and close connection on file deletion
- Clean up all watchers on server shutdown

## Frontend Integration

### Hook Extension: useFileWatcher

Create new hook or extend `useScriptFile` to handle file watching:

```typescript
const {
  code: initialCode,
  diskContent, // Latest content from disk
  hasConflict, // True if disk changed while user has unsaved edits
  isWatching,
  error,
} = useScriptFile(scriptPath, defaultCode, {
  watchForChanges: true,
});
```

**Implementation:**

- Open SSE connection to `/api/watch-file?path={path}` after successful load
- Parse SSE events and update `diskContent` state
- Connection auto-closes on component unmount (fetch abort)
- No explicit unwatch endpoint needed (connection close = unwatch)

### State Management Integration

Integrate with existing `hasUnsavedChanges` flag in App.tsx:

```typescript
// Track both disk and editor state
const [diskContent, setDiskContent] = useState<string>(initialCode);
const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
const [hasConflict, setHasConflict] = useState(false);

// On file change event from watcher
onFileChange: (newContent) => {
  setDiskContent(newContent);

  if (hasUnsavedChanges) {
    // User has local edits → conflict
    setHasConflict(true);
  } else {
    // No local edits → safe to auto-reload
    editorRef.current?.setContent(newContent);
    setDoc(newContent);
  }
};
```

### Conflict Resolution UI (MVP)

When `hasConflict === true`, show simple banner above editor:

```
⚠️ File changed on disk  [Reload from disk] [Keep my changes]
```

**Reload button**: Discard local changes, load disk content
**Keep button**: Dismiss banner, keep editing (conflict persists until save)

### Cleanup

- SSE connection closes automatically on:
  - Component unmount (AbortController)
  - Script path changes (new useEffect run)
  - Network error (reconnect with exponential backoff)
  - File deleted event received

### Error Handling

- **File deleted**: Close connection, show error banner, disable save button
- **Network disconnect**: Attempt reconnect with exponential backoff (1s, 2s, 4s, max 30s)

## Testing

### Backend Tests (pytest)

- **Basic watching**: Start watch, modify file, verify SSE event sent with new content
- **File deletion**: Delete watched file, verify `fileDeleted` event sent and connection closes
- **Connection cleanup**: Close SSE connection, verify watcher stops
- **Multiple events**: Modify file multiple times, verify all events stream correctly
- **Rapid changes**: Make rapid file changes, verify watchdog coalesces events naturally

### Manual Testing (Chrome MCP)

Test with `rdit sample.py`:

1. Open file, verify watch starts
2. Edit file externally (VS Code), verify auto-reload
3. Make local edit (unsaved), edit externally, verify conflict banner shows
4. Test "Reload" button discards local changes
5. Test "Keep mine" button dismisses banner
6. Delete file externally, verify error banner
7. Close browser tab, verify backend cleans up watcher

### Integration Testing

End-to-end flow:

```bash
# Start rdit
rdit sample.py

# In browser: make unsaved edit
# In terminal: echo "print('changed')" > sample.py
# Expected: Conflict banner shows

# In browser: click "Reload"
# Expected: Editor shows new content, unsaved indicator clears
```
