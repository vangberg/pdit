import sys
import time

print("Streaming output demo (one line per second):")
for i in range(5):
    print(f"tick {i + 1}", flush=True)
    # Extra flush for environments that buffer stdout.
    sys.stdout.flush()
    time.sleep(1)

print("Done.")
