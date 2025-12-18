"""
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
