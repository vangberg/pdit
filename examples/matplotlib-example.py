"""
Plot x against y
"""

import matplotlib.pyplot as plt
with plt.ioff():
  plt.figure()
  plt.plot(x, y)
  plt.xlabel('x')
  plt.ylabel('y')
  plt.show()
