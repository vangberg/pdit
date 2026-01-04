#!/usr/bin/env python3
"""Test if kernel survives interrupt and can execute more code."""

from jupyter_client import KernelManager
import time

def test_interrupt_then_execute():
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
    time.sleep(1)  # Give it time

    # Drain remaining messages
    try:
        while True:
            kc.get_iopub_msg(timeout=0.5)
    except:
        pass

    print("  ✅ Interrupted\n")

    print("Step 4: Try to execute new code (x + 5)")
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
    test_interrupt_then_execute()
