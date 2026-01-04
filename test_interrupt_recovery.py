#!/usr/bin/env python3
"""Test different recovery strategies after interrupt."""

from jupyter_client import KernelManager
import time

def test_recovery_strategies():
    # Start kernel
    km = KernelManager(kernel_name='xpython')
    km.start_kernel()
    kc = km.client()
    kc.start_channels()
    kc.wait_for_ready(timeout=30)

    print("Step 1: Set a variable x = 10")
    msg_id = kc.execute("x = 10")
    while True:
        msg = kc.get_iopub_msg(timeout=2)
        if msg['parent_header'].get('msg_id') == msg_id:
            if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                break
    print("  ✅ x = 10 complete\n")

    print("Step 2: Start infinite loop")
    msg_id = kc.execute("""
import time
for i in range(1000):
    print(f"Loop {i}")
    time.sleep(0.1)
""")

    # Get a few messages
    for _ in range(3):
        msg = kc.get_iopub_msg(timeout=2)
        if msg['parent_header'].get('msg_id') == msg_id:
            if msg['msg_type'] == 'stream':
                print(f"  {msg['content']['text'].strip()}")

    print("\nStep 3: Interrupt the kernel")
    km.interrupt_kernel()

    # Strategy 1: Wait longer
    print("  Waiting 3 seconds...")
    time.sleep(3)

    # Drain all remaining messages thoroughly
    print("  Draining messages...")
    drained = 0
    try:
        while True:
            msg = kc.get_iopub_msg(timeout=0.5)
            drained += 1
            if msg['msg_type'] == 'error':
                print(f"    Got error: {msg['content']['ename']}")
            elif msg['msg_type'] == 'status':
                print(f"    Got status: {msg['content']['execution_state']}")
    except:
        pass
    print(f"  Drained {drained} messages\n")

    # Strategy 2: Check if kernel is ready
    print("Step 4: Check if kernel is ready")
    try:
        kc.wait_for_ready(timeout=5)
        print("  ✅ Kernel is ready\n")
    except:
        print("  ❌ Kernel not ready\n")

    # Strategy 3: Try simple execution first
    print("Step 5: Try simple execution (1 + 1)")
    msg_id = kc.execute("1 + 1")

    got_result = False
    try:
        timeout_counter = 0
        while timeout_counter < 10:
            try:
                msg = kc.get_iopub_msg(timeout=1)
                if msg['parent_header'].get('msg_id') == msg_id:
                    print(f"  Got message: {msg['msg_type']}")
                    if msg['msg_type'] == 'execute_result':
                        result = msg['content']['data']['text/plain']
                        print(f"  Result: {result}")
                        got_result = True
                    if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                        break
            except:
                timeout_counter += 1
                print(f"  Timeout {timeout_counter}...")
    except Exception as e:
        print(f"  ❌ Error: {e}")

    if got_result:
        print("\n✅ SUCCESS: Simple execution works!")
    else:
        print("\n❌ FAILED: Simple execution failed")
        kc.stop_channels()
        km.shutdown_kernel(now=True)
        return

    # Strategy 4: Try using variable
    print("\nStep 6: Try to execute x + 5")
    msg_id = kc.execute("x + 5")

    got_result = False
    try:
        while True:
            msg = kc.get_iopub_msg(timeout=2)
            if msg['parent_header'].get('msg_id') == msg_id:
                if msg['msg_type'] == 'execute_result':
                    result = msg['content']['data']['text/plain']
                    print(f"  Result: {result}")
                    got_result = True
                if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                    break
    except Exception as e:
        print(f"  ❌ Error: {e}")

    if got_result:
        print("\n✅ SUCCESS: Kernel survived interrupt!")
        print("   Variable x was preserved (x = 10)")
        print("   Can execute new code after interrupt")
    else:
        print("\n❌ FAILED: Kernel didn't respond after interrupt")

    # Cleanup
    kc.stop_channels()
    km.shutdown_kernel(now=True)

if __name__ == "__main__":
    test_recovery_strategies()
