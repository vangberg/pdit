"""
# pdit

*Output-focused* Python editor
"""

import math
import matplotlib.pyplot as plt

"""
## Expressions

The result of an expression is printed in the output pane, right next to
the code that generated it.
"""

x = [i * 0.1 for i in range(0, 67)]
y = [math.sin(v) for v in x]

y[1:4]

"""
## Matplotlib

Easily iterate on plots.
"""

with plt.ioff():
  plt.figure(figsize=(4, 2))
  plt.plot(x, y)
  plt.xlabel('x')
  plt.ylabel('sin(x)')
  plt.show()

"""
## DataFrames

Interactive tables for quick sorting and filtering.
"""
import polars as pl

df = pl.read_csv(
  "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv"
)
df.head(5)
