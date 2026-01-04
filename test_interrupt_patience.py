#!/usr/bin/env python3
"""Test interrupt with more patience - wait longer for kernel to recover."""

from jupyter_client import KernelManager
import time

def test_interrupt_with_patience():
    # Start kernel
    km = KernelManager(kernel_name='xpython')
    km.start_kernel()
    kc = km.client()
    kc.start_channels()
    kc.wait_for_ready(timeout=30)

    print("Step 1: Set x = 10")
    msg_id = kc.execute("x = 10")
    while True:
        msg = kc.get_iopub_msg(timeout=5)
        if msg['parent_header'].get('msg_id') == msg_id:
            if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                break
    print("  ✅ Done\n")

    print("Step 2: Start infinite loop")
    msg_id = kc.execute("""
import time
for i in range(1000):
    print(f"Loop {i}")
    time.sleep(0.1)
""")

    # Get a few messages
    for _ in range(3):
        msg = kc.get_iopub_msg(timeout=5)

    print("\nStep 3: Interrupt")
    km.interrupt_kernel()
    print("  Sent interrupt signal")

    # Wait patiently for interrupt to be processed
    print("\nStep 4: Waiting for kernel to process interrupt (up to 30 seconds)...")
    interrupt_processed = False
    for i in range(30):
        try:
            msg = kc.get_iopub_msg(timeout=1)
            msg_type = msg['msg_type']
            print(f"  [{i}] Got: {msg_type}")

            if msg_type == 'error':
                print(f"      Error: {msg['content']['ename']}")
                interrupt_processed = True
            elif msg_type == 'status' and msg['content']['execution_state'] == 'idle':
                print(f"      Kernel is idle")
                interrupt_processed = True
                break
        except:
            print(f"  [{i}] Timeout")
            if i > 10:  # If we've been waiting a while with no messages
                break

    if not interrupt_processed:
        print("\n  ❌ Kernel never signaled it processed the interrupt")
        print(f"  is_alive: {km.is_alive()}")

    # Give it extra time
    print("\nStep 5: Extra wait (5 seconds)...")
    time.sleep(5)
    print(f"  is_alive: {km.is_alive()}")

    # Drain any remaining messages
    print("\nStep 6: Drain remaining messages...")
    try:
        while True:
            msg = kc.get_iopub_msg(timeout=0.5)
            print(f"  Got: {msg['msg_type']}")
    except:
        print("  No more messages")

    # Now try to execute
    print("\nStep 7: Execute x + 5")
    msg_id = kc.execute("x + 5")

    got_result = False
    try:
        for i in range(20):
            msg = kc.get_iopub_msg(timeout=2)
            print(f"  [{i}] {msg['msg_type']}")
            if msg['parent_header'].get('msg_id') == msg_id:
                if msg['msg_type'] == 'execute_result':
                    result = msg['content']['data']['text/plain']
                    print(f"  Result: {result}")
                    got_result = True
                if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                    break
    except Exception as e:
        print(f"  ❌ Error: {e}")

    print(f"\nResult: {'✅ SUCCESS' if got_result else '❌ FAILED'}")
    print(f"is_alive: {km.is_alive()}")

    # Cleanup
    kc.stop_channels()
    km.shutdown_kernel(now=True)

if __name__ == "__main__":
    test_interrupt_with_patience()
