# Writing Code for pdit

This guide helps coding agents write Python code that works well with pdit's inline execution model.

## How pdit Works

pdit parses Python into statements using AST and executes each statement one at a time. Results appear inline next to the code that produced them. This is similar to Jupyter notebooks but with a different visual model—outputs appear in a side panel aligned with source lines.

Key behaviors:
- Each top-level statement is executed independently
- Expression results (the last value in a statement) are displayed automatically
- Execution stops on the first error
- Standalone string literals become markdown cells

## Code Structure

### Use Standalone Expressions for Visibility

Unlike regular Python scripts, pdit displays the result of any expression statement. Use this to show intermediate results:

```python
# Good: each expression shows its result
data = load_data()
data.shape  # Shows dimensions

filtered = data.filter(pl.col("value") > 0)
filtered.head(5)  # Shows preview
```

```python
# Less useful: results hidden inside assignments
data = load_data()
shape = data.shape  # Result not shown
```

### One Logical Step Per Statement

Structure code so each statement represents one logical step. This makes outputs easier to follow:

```python
# Good: clear progression
df = pl.read_csv("data.csv")
df.head()

df_clean = df.drop_nulls()
df_clean.shape

result = df_clean.group_by("category").agg(pl.mean("value"))
result
```

```python
# Avoid: chaining everything into one statement
result = (pl.read_csv("data.csv")
          .drop_nulls()
          .group_by("category")
          .agg(pl.mean("value")))
result  # Only see final result
```

## Markdown Cells

Standalone triple-quoted strings are rendered as markdown. Use them for documentation:

```python
"""
# Analysis Title

This section loads and explores the data.
"""

import polars as pl

df = pl.read_csv("data.csv")
df.head()

"""
## Data Cleaning

Remove null values and outliers.
"""

df_clean = df.drop_nulls()
df_clean.shape
```

## DataFrames

pdit renders polars and pandas DataFrames as interactive tables with sorting and filtering.

```python
import polars as pl

df = pl.read_csv("data.csv")
df  # Interactive table

# Show a subset
df.head(10)

# Filtered view
df.filter(pl.col("value") > 100)
```

For pandas:

```python
import pandas as pd

df = pd.read_csv("data.csv")
df  # Also interactive
```

## Matplotlib

pdit disables matplotlib's interactive mode. Plots display when you call `plt.show()`:

```python
import matplotlib.pyplot as plt

x = [1, 2, 3, 4]
y = [1, 4, 9, 16]

plt.figure()
plt.plot(x, y)
plt.xlabel("x")
plt.ylabel("y")
plt.show()  # Plot appears here
```

For explicit control, use the `plt.ioff()` context manager:

```python
import matplotlib.pyplot as plt

with plt.ioff():
    plt.figure(figsize=(6, 4))
    plt.plot(x, y)
    plt.title("My Plot")
    plt.show()
```

### Multiple Plots

Each `plt.show()` produces a separate output:

```python
import matplotlib.pyplot as plt

# First plot
plt.figure()
plt.plot([1, 2, 3], [1, 2, 3])
plt.title("Linear")
plt.show()

# Second plot
plt.figure()
plt.plot([1, 2, 3], [1, 4, 9])
plt.title("Quadratic")
plt.show()
```

## Images

Use `IPython.display.Image` for displaying image files:

```python
from IPython.display import Image

Image("chart.png")
```

## Custom HTML

Objects with a `_repr_html_` method render as HTML:

```python
class Card:
    def __init__(self, title, content):
        self.title = title
        self.content = content

    def _repr_html_(self):
        return f'''
        <div style="padding: 16px; border: 1px solid #ccc; border-radius: 8px;">
            <h3>{self.title}</h3>
            <p>{self.content}</p>
        </div>
        '''

Card("Status", "Processing complete")
```

## IPython Display

Use `IPython.display` for explicit control:

```python
from IPython.display import display, HTML, Markdown

# Display multiple items from one statement
display(df1)
display(df2)

# Render HTML directly
display(HTML("<b>Bold text</b>"))

# Render markdown
display(Markdown("**Important:** Check the results above"))
```

## Print Statements

Standard `print()` works for text output:

```python
print("Loading data...")
df = load_large_dataset()
print(f"Loaded {len(df)} rows")
df.head()
```

## Patterns to Avoid

### Long Single Statements

Avoid putting too much logic in one statement—you won't see intermediate results:

```python
# Avoid: can't see intermediate steps
final = (fetch_data()
         .transform()
         .validate()
         .aggregate())
```

### Suppressing Output Unnecessarily

Don't add semicolons or assign to `_` just to suppress output:

```python
# Avoid
df.describe();  # Suppresses useful output

# Better
df.describe()  # Shows statistics
```

### Imports Mixed with Logic

Keep imports at the top or in their own statements:

```python
# Good
import polars as pl
import matplotlib.pyplot as plt

df = pl.read_csv("data.csv")
```

```python
# Avoid
import polars as pl; df = pl.read_csv("data.csv")  # Harder to follow
```

## Summary

1. **Show results** - Use expression statements to display intermediate values
2. **One step per statement** - Keep logical steps separate for clear output
3. **Use markdown cells** - Document with triple-quoted strings
4. **DataFrames just work** - polars and pandas render as interactive tables
5. **Call plt.show()** - Matplotlib plots need explicit show
6. **Use display()** - For multiple outputs from one statement
