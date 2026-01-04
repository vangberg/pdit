# WebSocket Implementation Review

## Critical Issues

### 1. ⚠️ Dataclass Default Factory Bug

**Location:** `pdit/executor.py:59, 65, 74, 75`

```python
started_at: datetime = field(default_factory=datetime.now)
completed_at: Optional[datetime] = None
created_at: datetime = field(default_factory=datetime.now)
last_active: datetime = field(default_factory=datetime.now)
```

**Problem:** `datetime.now` is passed as a reference, not a callable. All instances share the same timestamp!

**Fix:**
```python
started_at: datetime = field(default_factory=lambda: datetime.now())
created_at: datetime = field(default_factory=lambda: datetime.now())
last_active: datetime = field(default_factory=lambda: datetime.now())
```

**Impact:** HIGH - All executions/sessions will have identical timestamps

---

### 2. ⚠️ Queue Processor Doesn't Handle WebSocket Closure

**Location:** `pdit/server.py:559-557`

```python
async def process_execution_queue(session: Session, websocket: WebSocket):
    while True:
        execution_state = await session.execution_queue.get()
        # ... execute ...
```

**Problem:** If WebSocket closes during execution, the processor continues running and tries to send to closed socket.

**Fix:**
```python
async def process_execution_queue(session: Session, websocket: WebSocket):
    try:
        while True:
            execution_state = await session.execution_queue.get()

            # Check if websocket is still open
            if websocket.client_state != WebSocketState.CONNECTED:
                break

            # ... rest of execution ...
    except asyncio.CancelledError:
        # Clean up any running execution
        if session.current_execution:
            session.current_execution.status = 'cancelled'
        raise
```

**Impact:** MEDIUM - Could cause exceptions and unhandled errors

---

### 3. ⚠️ WebSocket Send Failures Not Handled

**Location:** `pdit/server.py:452, 498, 511, 518, 527`

**Problem:** All `await websocket.send_json()` calls could fail if connection drops, but exceptions aren't caught.

**Fix:** Wrap all websocket sends in try/except:
```python
try:
    await websocket.send_json({...})
except Exception:
    # Connection lost, mark execution as interrupted
    execution_state.status = 'error'
    execution_state.error_message = 'WebSocket connection lost'
    break
```

**Impact:** MEDIUM - Unhandled exceptions crash queue processor

---

### 4. ⚠️ Frontend Polling is Inefficient

**Location:** `web/src/execution-backend-python.ts:243-250`

```typescript
while (!done) {
    if (events.length > 0) {
        yield events.shift()!;
    } else {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}
```

**Problem:** Busy-waiting with 10ms polling wastes CPU and adds latency.

**Fix:** Use promise-based event notification:
```typescript
let resolveNext: (() => void) | null = null;

this.on(handlerId, (msg) => {
    // ... handle message ...
    events.push(event);
    if (resolveNext) {
        resolveNext();
        resolveNext = null;
    }
});

while (!done) {
    if (events.length > 0) {
        yield events.shift()!;
    } else {
        await new Promise<void>(resolve => { resolveNext = resolve; });
    }
}
```

**Impact:** LOW - Performance issue, not correctness

---

## Important Issues

### 5. ⚠️ No Execution Timeout

**Problem:** Long-running or infinite loops will block the queue forever.

**Fix:** Add timeout to execution:
```python
async def execute_script_ws(...):
    try:
        async with asyncio.timeout(300):  # 5 minute timeout
            # ... execute ...
    except asyncio.TimeoutError:
        execution_state.status = 'error'
        execution_state.error_message = 'Execution timeout (5 minutes)'
        # ... send error ...
```

**Impact:** MEDIUM - Users can't cancel runaway executions yet

---

### 6. ⚠️ Session Cleanup Missing

**Problem:** Sessions are never cleaned up, even if browser closes.

**Fix:** Add periodic cleanup task:
```python
async def cleanup_old_sessions():
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        cutoff = datetime.now() - timedelta(hours=1)
        to_remove = [
            sid for sid, session in _sessions.items()
            if session.last_active < cutoff and not session.current_execution
        ]
        for sid in to_remove:
            delete_session(sid)

# Start on app startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = asyncio.create_task(cleanup_old_sessions())
    yield
    cleanup_task.cancel()
    shutdown_all_sessions()
```

**Impact:** LOW - Memory leak over time

---

### 7. ⚠️ Reconnection Doesn't Resume Queue

**Problem:** If WebSocket reconnects, the queue processor isn't restarted.

**Fix:** In execute_websocket, check if queue processor is already running:
```python
# Get or create session
session = get_or_create_session(session_id)

# Cancel old queue processor if websocket changed
if queue_processor_task and session.websocket != websocket:
    queue_processor_task.cancel()

session.websocket = websocket

# Start new queue processor
queue_processor_task = asyncio.create_task(...)
```

**Impact:** MEDIUM - Reconnection doesn't work properly

---

### 8. ⚠️ Execution History Cleanup Never Called

**Problem:** `cleanup_old_executions()` is defined but never called.

**Fix:** Call it periodically or in the session cleanup task:
```python
async def cleanup_old_sessions():
    while True:
        await asyncio.sleep(300)
        cleanup_old_executions()  # Also cleanup execution history
        # ... cleanup sessions ...
```

**Impact:** LOW - Memory leak over time

---

## Minor Issues

### 9. Missing Heartbeat

**Problem:** No ping/pong heartbeat to detect dead connections.

**Fix:** Add periodic ping:
```python
async def heartbeat(websocket: WebSocket):
    while True:
        await asyncio.sleep(30)
        try:
            await websocket.send_json({'type': 'ping'})
        except:
            break
```

**Impact:** LOW - Connections may stay open when dead

---

### 10. Frontend Event Queue Could Overflow

**Problem:** If consumer is slow, `events` array grows unbounded.

**Fix:** Add backpressure:
```typescript
const MAX_QUEUE_SIZE = 100;

this.on(handlerId, (msg) => {
    if (events.length >= MAX_QUEUE_SIZE) {
        console.warn('Event queue overflow, dropping old events');
        events.shift();
    }
    events.push(event);
});
```

**Impact:** LOW - Unlikely in practice

---

### 11. No Connection State Exposed

**Problem:** Frontend can't check if WebSocket is connected.

**Fix:** Add getter:
```typescript
get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
}
```

**Impact:** LOW - Nice to have for UI

---

### 12. Multiple Message Handlers Could Conflict

**Problem:** If same execution ID is reused, handlers could process wrong messages.

**Fix:** Use UUID v4 which has negligible collision probability, or add timestamp to handler ID:
```typescript
const handlerId = `exec-${executionId}-${Date.now()}`;
```

**Impact:** VERY LOW - UUID collision is astronomically unlikely

---

## Summary

### Must Fix (Critical)
1. ✅ **Dataclass default_factory bug** - Wrong timestamps
2. ✅ **Queue processor WebSocket closure** - Crashes on disconnect
3. ✅ **WebSocket send error handling** - Unhandled exceptions

### Should Fix (Important)
4. **Execution timeout** - Prevent infinite loops
5. **Session cleanup** - Memory leak
6. **Reconnection queue resume** - Broken reconnection
7. **Execution history cleanup** - Never called

### Nice to Have (Minor)
8. Frontend polling efficiency
9. Heartbeat mechanism
10. Event queue overflow protection
11. Connection state getter
12. Handler ID uniqueness

## Recommendations

### Priority 1 (Do Now)
- Fix the dataclass default_factory bug
- Add try/except around all websocket.send_json
- Handle queue processor cancellation properly

### Priority 2 (Before Production)
- Add execution timeout (with configurable limit)
- Implement session cleanup task
- Fix reconnection to resume queue processor
- Call cleanup_old_executions periodically

### Priority 3 (Future Enhancements)
- Replace polling with promise-based events
- Add heartbeat ping/pong
- Expose connection state to UI
- Add execution queue size limits

## Testing Needed

1. **Reconnection test**: Disconnect mid-execution, verify queue resumes
2. **Timeout test**: Infinite loop script, verify timeout works
3. **Concurrent executions**: Queue multiple scripts, verify ordering
4. **Memory leak test**: Run for hours, check session/execution cleanup
5. **Error handling**: Kill server mid-execution, verify graceful degradation
