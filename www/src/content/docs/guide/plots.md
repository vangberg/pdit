---
title: Plots & Images
description: Displaying matplotlib plots and images
---

## Matplotlib

Matplotlib figures are automatically captured and displayed inline:

```python
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
plt.title('Sine Wave')
plt.show()
```

No special configuration needed - just use `plt.show()` as usual.

## Multiple Plots

Create multiple figures and they'll all appear:

```python
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
ax1.plot(x, np.sin(x))
ax2.plot(x, np.cos(x))
plt.show()
```

## Other Image Types

Any IPython-compatible image output works:

```python
from IPython.display import Image
Image(filename='photo.png')
```

## Seaborn, Plotly, etc.

Libraries built on matplotlib work automatically. For Plotly and other JavaScript-based libraries, static image export may be needed.
