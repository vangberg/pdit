#!/usr/bin/env python3
"""See what messages the kernel sends during interrupt."""

from jupyter_client import KernelManager
import time

def test_interrupt():
    # Start kernel
    km = KernelManager(kernel_name='xpython')
    km.start_kernel()
    kc = km.client()
    kc.start_channels()
    kc.wait_for_ready(timeout=30)

    print("Starting infinite loop...\n")

    # Execute infinite loop
    msg_id = kc.execute("""
import time
for i in range(1000):
    print(f"Iteration {i}")
    time.sleep(0.1)
""")

    # Get a few messages
    for _ in range(5):
        msg = kc.get_iopub_msg(timeout=2)
        if msg['parent_header'].get('msg_id') == msg_id:
            print(f"Before interrupt: {msg['msg_type']}")

    # Interrupt
    print("\n🔴 INTERRUPTING...\n")
    km.interrupt_kernel()

    # Get messages after interrupt
    print("After interrupt (waiting up to 10 seconds for any message):")
    seen_idle = False
    seen_error = False
    for i in range(10):
        try:
            msg = kc.get_iopub_msg(timeout=1)

            # Print ALL messages, not just for our msg_id
            msg_type = msg['msg_type']
            is_ours = msg['parent_header'].get('msg_id') == msg_id

            if is_ours:
                print(f"  [{i}] {msg_type} (our execution)")

                if msg_type == 'error':
                    seen_error = True
                    print(f"      ename: {msg['content']['ename']}")
                    print(f"      evalue: {msg['content']['evalue']}")
                    print(f"      traceback: {msg['content']['traceback'][:2]}")

                elif msg_type == 'status':
                    state = msg['content']['execution_state']
                    print(f"      state: {state}")
                    if state == 'idle':
                        seen_idle = True
                        break

                elif msg_type == 'stream':
                    print(f"      content: {msg['content']['text'][:50]}")
            else:
                print(f"  [{i}] {msg_type} (other)")

        except Exception as e:
            print(f"  [{i}] Timeout waiting for message")
            break

    print(f"\nSummary:")
    print(f"  Saw error message: {seen_error}")
    print(f"  Saw idle status: {seen_idle}")

    if seen_error:
        print("  ✅ Kernel sent KeyboardInterrupt error")
    if seen_idle:
        print("  ✅ Kernel went idle")
    if not seen_error and not seen_idle:
        print("  ❌ No error or idle - kernel just stopped sending messages")

    # Cleanup
    kc.stop_channels()
    km.shutdown_kernel(now=True)

if __name__ == "__main__":
    test_interrupt()
