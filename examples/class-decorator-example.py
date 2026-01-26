"""
# Class decorators

A minimal example to verify class decorators work in pdit.
"""

from __future__ import annotations


def add_repr(cls):
  """Inject a simple __repr__ and return the class."""
  def _repr(self):
    return f"<{cls.__name__} name={self.name!r}>"

  cls.__repr__ = _repr
  return cls


@add_repr
class User:
  def __init__(self, name: str) -> None:
    self.name = name


"""
## Try it
"""

user = User("Ada")
user
