"""
# pdit

*Output-focused* Python editor
"""

import math
import matplotlib.pyplot as plt

x = [i * 0.1 for i in range(0, 67)]
y = [math.sin(v) for v in x]

with plt.ioff():
  plt.figure(figsize=(4, 2))
  plt.plot(x, y)
  plt.xlabel('x')
  plt.ylabel('sin(x)')
  plt.show()

import polars as pl

df = pl.read_csv(
  "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv"
)
df.head(5)
