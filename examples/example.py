"""
# Working with a coding agent
"""

x = [1,2,3]
y = [1,3,5]

"""
Plot x against y
"""

import matplotlib.pyplot as plt
with plt.ioff():
  plt.figure()
  plt.plot(x, y)
  plt.xlabel('x')
  plt.ylabel('y')
  plt.gca()
  plt.show()

from IPython.display import display, HTML

import polars as pl

df = pl.read_csv("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv")
df
display(df)

