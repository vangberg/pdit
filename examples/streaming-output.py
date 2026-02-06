import sys
import time

print("Streaming output demo (one line per second):")
for i in range(5):
    print(f"tick {i + 1}")
    time.sleep(1)

print("Done.")
