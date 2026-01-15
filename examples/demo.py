"""
# Markdown

Top-level strings are _rendered_ as [Markdown](https://en.wikipedia.org/wiki/Markdown).
"""

"""
## Expressions
"""

1 + 2

[x * 2 for x in [1, 2, 3]]

"""
## Matplotlib
"""

import math
import matplotlib.pyplot as plt

x = [i * 0.1 for i in range(0, 63)]
y = [math.sin(v) for v in x]

plt.figure()
plt.plot(x, y)
plt.xlabel('x')
plt.ylabel('sin(x)')
plt.show()

"""
## Polars/Pandas

DataFrames are rendered as interactive tables.
"""

import polars as pl

df = pl.read_csv("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv")
df

"""
## HTML representation

Classes that implement a `_repr_html_()` function returning HTML are rendered
as HTML.
"""

class DFBrief:
  def __init__(self, df: pl.DataFrame):
    self.df = df

  def _repr_html_(self) -> str:
    return (
      "<span style='display:inline-block;border:1px solid #ddd;"
      "border-radius:6px;padding:6px 10px;background:#f7f7f7;"
      "font-family:monospace;'>"
      f"{self.df.height}×{self.df.width}"
      "</span>"
    )


DFBrief(df)


"""
## IPython display objects

IPython [display objects](https://ipython.readthedocs.io/en/latest/api/generated/IPython.display.html)
are supported, e.g. images.
"""

from IPython.display import Image

Image('pea.png')
