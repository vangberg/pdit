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
## GreatTables

[GreatTables](https://posit-dev.github.io/great-tables/) renders rich HTML tables.
"""

from great_tables import GT

GT(df.head(5))

"""
## HTML representation

Classes that implement a `_repr_html_()` function returning HTML are rendered
as HTML.
"""

class IrisSummary:
  def __init__(self, df: pl.DataFrame):
    self.df = df

  def _repr_html_(self) -> str:
    summary = (
      self.df.group_by("species")
      .agg(pl.col("sepal_length").mean().round(2).alias("mean"))
      .sort("mean", descending=True)
    )
    max_mean = float(summary["mean"].max())
    rows = "".join(
      "<tr>"
      f"<td style='padding-right:8px'>{species}</td>"
      f"<td><meter min='0' max='{max_mean:.2f}' value='{mean:.2f}'></meter></td>"
      f"<td style='padding-left:6px'>{mean:.2f}</td>"
      "</tr>"
      for species, mean in summary.iter_rows()
    )
    return (
      "<div style='display:inline-block;border:1px solid #ddd;border-radius:8px;"
      "padding:8px 10px;background:#fff;'>"
      "<div style='font-weight:600;margin-bottom:6px'>Mean sepal length</div>"
      "<table style='border-collapse:collapse;font-size:12px'>"
      + rows
      + "</table></div>"
    )


IrisSummary(df)


"""
## IPython display objects

IPython [display objects](https://ipython.readthedocs.io/en/latest/api/generated/IPython.display.html)
are supported, e.g. images.
"""

from IPython.display import Image

Image('https://pdit.dev/pea.png')
