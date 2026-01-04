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
    print("After interrupt:")
    seen_idle = False
    for _ in range(20):
        try:
            msg = kc.get_iopub_msg(timeout=1)
            if msg['parent_header'].get('msg_id') == msg_id:
                msg_type = msg['msg_type']
                print(f"  {msg_type}")

                if msg_type == 'error':
                    print(f"    ename: {msg['content']['ename']}")
                    print(f"    evalue: {msg['content']['evalue']}")

                if msg_type == 'status':
                    state = msg['content']['execution_state']
                    print(f"    state: {state}")
                    if state == 'idle':
                        seen_idle = True
                        break
        except Exception as e:
            print(f"  Timeout: {e}")
            break

    if seen_idle:
        print("\n✅ Kernel went idle")
    else:
        print("\n❌ Kernel didn't go idle")

    # Cleanup
    kc.stop_channels()
    km.shutdown_kernel(now=True)

if __name__ == "__main__":
    test_interrupt()
