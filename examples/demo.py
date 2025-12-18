"""
## Polars

Dataframes
"""

import polars as pl

df = pl.read_csv("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv")

print(df[:1])

df


"""
## Matplotlib

Plot x against y
"""

x = [1, 2, 3]
y = [5, 6, 7]

import matplotlib.pyplot as plt
with plt.ioff():
  plt.figure()
  plt.plot(x, y)
  plt.xlabel('x')
  plt.ylabel('y')
  plt.show()

"""
## Image Display Examples

Demonstrates displaying images in various formats using IPython.display.Image
"""

from IPython.display import Image, SVG, display

# Display PNG image
Image('pea.png')
