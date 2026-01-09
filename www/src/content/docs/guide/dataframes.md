---
title: DataFrames
description: Working with pandas DataFrames in pdit
---

## Automatic Rendering

Pandas DataFrames are automatically rendered as interactive tables:

```python
import pandas as pd

df = pd.DataFrame({
    'name': ['Alice', 'Bob', 'Charlie'],
    'age': [25, 30, 35],
    'city': ['NYC', 'LA', 'Chicago']
})

df
```

## Features

- **Scrollable** - Large DataFrames scroll horizontally and vertically
- **Formatted** - Numbers and dates are formatted for readability
- **Styled** - Alternating row colors for easy reading

## Large DataFrames

For DataFrames with many rows, pdit shows a preview. The full data is still accessible in your kernel session.

## Series

Pandas Series are also rendered nicely:

```python
df['age']  # Renders as a formatted series
```
