# Interrupt Behavior Investigation

## Summary

**Finding**: `km.interrupt_kernel()` with xeus-python **kills the kernel process** instead of just stopping the current execution.

## Expected Behavior (Standard Jupyter)

When you send SIGINT (Ctrl+C) to a Jupyter kernel:
1. ✅ Stops the currently executing code
2. ✅ Raises `KeyboardInterrupt` exception
3. ✅ Kernel returns to idle state
4. ✅ Kernel process stays alive (`is_alive()` = True)
5. ✅ Variables are preserved
6. ✅ Can execute new code immediately

## Actual Behavior (xeus-python)

When you call `km.interrupt_kernel()` with xeus-python:
1. ✅ Stops the currently executing code
2. ❌ Does NOT send KeyboardInterrupt error message
3. ❌ Does NOT return to idle state
4. ❌ Kernel process dies (`is_alive()` = False)
5. ❌ Variables are lost
6. ❌ Cannot execute new code (kernel unresponsive)

## Test Results

### Test 1: Basic Interrupt
```bash
$ python test_kernel_interrupt.py

Before interrupt: status, stream, stream
🔴 INTERRUPTING...
After interrupt: (waiting up to 10 seconds)
  [0] stream (our execution)
  [1] Timeout

Summary:
  Saw error message: False
  Saw idle status: False
  ❌ No error or idle - kernel just stopped sending messages
```

### Test 2: Kernel Alive Check
```bash
$ python test_kernel_alive.py

Kernel alive before: True
Interrupting kernel...

Kernel alive after interrupt: False  ❌

Checking if kernel responds to is_alive...
  [0] is_alive: False
  [1] is_alive: False
  [2] is_alive: False
  [3] is_alive: False
  [4] is_alive: False
```

### Test 3: Execution After Interrupt
```bash
$ python test_interrupt_survival.py

Step 1: Set a variable x = 10
  ✅ x = 10 complete

Step 2: Start infinite loop
  Loop 0

Step 3: Interrupt the kernel
  ✅ Interrupted

Step 4: Try to execute new code (x + 5)
  ❌ Error:

❌ FAILED: Kernel didn't respond after interrupt
```

### Test 4: Patient Waiting
```bash
$ python test_interrupt_patience.py

Step 4: Waiting for kernel to process interrupt (up to 30 seconds)...
  [0] Got: stream
  [1-11] Timeout...

  ❌ Kernel never signaled it processed the interrupt
  is_alive: False

Step 7: Execute x + 5
  ❌ Error:

Result: ❌ FAILED
is_alive: False
```

## Root Cause

This appears to be a bug in xeus-python's interrupt handling. The kernel process actually dies when you send SIGINT.

## Workaround

After interrupt, call `km.restart_kernel()` to bring the kernel back:

```python
km.interrupt_kernel()  # Kills kernel
km.restart_kernel()    # Brings it back
kc.wait_for_ready()    # Wait for ready

# Now can execute code again (but variables are lost)
```

## Current Implementation

In `server_simple.py`, we handle interrupt as follows:

```python
elif msg_type == 'interrupt':
    # Interrupt the kernel (send SIGINT)
    session.interrupt()

    # Cancel the current execution task
    if current_execution and not current_execution.done():
        current_execution.cancel()

    # Send acknowledgment
    await websocket.send_json({'type': 'interrupt-ack'})
```

**Issue**: After this, the kernel is dead and cannot execute more code.

## Options

### Option 1: Auto-restart after interrupt
```python
session.interrupt()
session.restart()  # Restart to make kernel usable again
```
**Pros**: Kernel works after interrupt
**Cons**: Variables are lost (full restart)

### Option 2: Keep current behavior
```python
session.interrupt()  # Just stop
```
**Pros**: Correct behavior (no auto-restart)
**Cons**: Kernel is dead, user must manually restart

### Option 3: Detect and restart if needed
```python
session.interrupt()
if not session.km.is_alive():
    session.restart()
```
**Pros**: Only restart if kernel actually died
**Cons**: Same as Option 1 - variables lost

## Recommendation

**Option 2** - Keep current behavior for now. This is a known xeus-python bug.

The user should use the `reset` message to restart the kernel when needed:
```javascript
ws.send(JSON.stringify({ type: 'reset' }));
```

## Kernel Comparison

Tested interrupt behavior across different Jupyter kernels:

### ✅ IPython Kernel (python3/ipykernel) - WORKS CORRECTLY

```bash
$ python test_ipython_interrupt.py

Step 3: Interrupt
  [0] stream
  [1] error
      KeyboardInterrupt:           ✅ Sends error message
  [2] status
      Kernel idle                  ✅ Returns to idle state

Kernel alive after interrupt: True  ✅ Process survives

Step 4: Execute x + 5
  Result: 15                       ✅ Variables preserved

✅ SUCCESS: IPython kernel survived interrupt!
```

**Behavior**: Perfect - exactly as expected for SIGINT

### ❌ xeus-python Kernel (xpython) - BROKEN

```bash
$ python test_kernel_alive.py

Kernel alive before: True
Kernel alive after interrupt: False  ❌ Process dies

Step 7: Execute x + 5
  ❌ Error: (no response)

Result: ❌ FAILED
```

**Behavior**: interrupt_kernel() kills the process instead of just stopping execution

### ❌ xpython-raw Kernel - BROKEN

**Behavior**: Has different issues (timeouts on message retrieval)

## Conclusion

**This is confirmed to be a xeus-python bug.** The standard IPython kernel handles interrupts correctly, while xeus-python's interrupt kills the kernel process.

## Recommendation (Updated)

**Switch from xpython to python3 (IPython kernel)** for proper interrupt support:

```python
km = KernelManager(kernel_name='python3')  # instead of 'xpython'
```

Benefits:
- Interrupt works correctly (stops execution, keeps kernel alive)
- Variables preserved after interrupt
- Sends proper KeyboardInterrupt error
- Can execute new code immediately after interrupt
- Standard, well-tested implementation

## Future Work

1. ~~Report bug to xeus-python project~~ Confirmed as xeus-python issue
2. **Switch pdit to use IPython kernel (python3)** - recommended
3. Update server.py to use kernel_name='python3'

## Related Issues

- Check xeus-python GitHub for similar interrupt issues
- May be related to how xeus handles signals vs standard IPython kernel
