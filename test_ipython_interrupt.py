#!/usr/bin/env python3
"""Test interrupt with standard IPython kernel instead of xeus-python."""

from jupyter_client import KernelManager
import time

def test_ipython_interrupt():
    # Start IPython kernel instead of xeus-python
    km = KernelManager(kernel_name='python3')
    km.start_kernel()
    kc = km.client()
    kc.start_channels()
    kc.wait_for_ready(timeout=30)

    print("Using IPython kernel\n")
    print(f"Kernel alive: {km.is_alive()}\n")

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
        if msg['msg_type'] == 'stream':
            print(f"  {msg['content']['text'].strip()}")

    print("\nStep 3: Interrupt")
    km.interrupt_kernel()

    # Wait for interrupt to be processed
    print("  Waiting for interrupt response...")
    for i in range(10):
        try:
            msg = kc.get_iopub_msg(timeout=2)
            if msg['parent_header'].get('msg_id') == msg_id:
                print(f"  [{i}] {msg['msg_type']}")
                if msg['msg_type'] == 'error':
                    print(f"      {msg['content']['ename']}: {msg['content']['evalue']}")
                if msg['msg_type'] == 'status' and msg['content']['execution_state'] == 'idle':
                    print(f"      Kernel idle")
                    break
        except:
            print(f"  [{i}] Timeout")

    print(f"\nKernel alive after interrupt: {km.is_alive()}\n")

    # Try to execute new code
    print("Step 4: Execute x + 5")
    msg_id = kc.execute("x + 5")

    got_result = False
    try:
        while True:
            msg = kc.get_iopub_msg(timeout=5)
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
        print("\n✅ SUCCESS: IPython kernel survived interrupt!")
    else:
        print("\n❌ FAILED: IPython kernel didn't respond")

    # Cleanup
    kc.stop_channels()
    km.shutdown_kernel(now=True)

if __name__ == "__main__":
    test_ipython_interrupt()
