# %% [markdown]
"""
# Working with a coding agent
"""

x = [1,2,3]
y = [1,3,5]

# %% [markdown]
"""
Plot x against y
"""

import matplotlib.pyplot as plt

plt.figure()
plt.plot(x, y)
plt.xlabel('x')
plt.ylabel('y')
plt.gca()