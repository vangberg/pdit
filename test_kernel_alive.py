#!/usr/bin/env python3
"""Test if kernel process is still alive after interrupt."""

from jupyter_client import KernelManager
import time

def test_kernel_alive():
    # Start kernel
    km = KernelManager(kernel_name='xpython')
    km.start_kernel()
    kc = km.client()
    kc.start_channels()
    kc.wait_for_ready(timeout=30)

    print(f"Kernel alive before: {km.is_alive()}\n")

    print("Starting infinite loop...")
    msg_id = kc.execute("""
import time
for i in range(1000):
    print(f"Loop {i}")
    time.sleep(0.1)
""")

    # Get a few messages
    for _ in range(3):
        msg = kc.get_iopub_msg(timeout=2)

    print("Interrupting kernel...")
    km.interrupt_kernel()
    time.sleep(2)

    print(f"\nKernel alive after interrupt: {km.is_alive()}")

    # Try to check kernel status
    print("\nChecking if kernel responds to is_alive...")
    for i in range(5):
        print(f"  [{i}] is_alive: {km.is_alive()}")
        time.sleep(0.5)

    # Drain messages
    print("\nDraining messages...")
    try:
        while True:
            msg = kc.get_iopub_msg(timeout=0.5)
            print(f"  Got: {msg['msg_type']}")
    except:
        print("  No more messages")

    # Try restart_kernel instead
    print("\n🔄 Trying restart_kernel()...")
    km.restart_kernel()
    kc.wait_for_ready(timeout=30)
    print("  ✅ Kernel restarted and ready")

    # Test execution after restart
    print("\nTesting execution after restart...")
    msg_id = kc.execute("2 + 2")
    while True:
        msg = kc.get_iopub_msg(timeout=2)
        if msg['parent_header'].get('msg_id') == msg_id:
            if msg['msg_type'] == 'execute_result':
                result = msg['content']['data']['text/plain']
                print(f"  Result: {result}")
            if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                break

    print("\n✅ Kernel works after restart!")
    print("   Conclusion: interrupt_kernel() breaks kernel, requires restart")

    # Cleanup
    kc.stop_channels()
    km.shutdown_kernel(now=True)

if __name__ == "__main__":
    test_kernel_alive()
