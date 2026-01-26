"""
# Function decorators

A minimal example to verify decorators work as expected in pdit.
"""

from __future__ import annotations

from functools import wraps


def log_calls(fn):
  @wraps(fn)
  def wrapper(*args, **kwargs):
    print(f"-> {fn.__name__} args={args} kwargs={kwargs}")
    result = fn(*args, **kwargs)
    print(f"<- {fn.__name__} result={result!r}")
    return result

  return wrapper


@log_calls
def add(a: int, b: int) -> int:
  return a + b


"""
## Try it
"""

add(2, 3)
add(10, -4)
add.__name__
