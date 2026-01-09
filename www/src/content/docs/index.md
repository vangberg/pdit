---
title: Getting Started
description: Get up and running with pdit in minutes
---

pdit is an interactive Python editor that displays execution results inline, right next to the code that produced them. It's designed for exploratory programming, data analysis, and learning Python.

## What is pdit?

pdit parses your Python code into individual statements and executes each one in an IPython kernel. Results stream back in real-time and appear inline next to the code that produced them.

Think of it as a middle ground between Jupyter notebooks and a traditional REPL:
- **Like notebooks**: You see results inline with your code
- **Like a REPL**: You work with regular `.py` files
- **Unlike both**: Changes are instantly visible, no cell management needed

## Quick Start

1. Install pdit:
   ```bash
   pip install pdit
   ```

2. Create a Python file:
   ```python
   # example.py
   import pandas as pd

   df = pd.DataFrame({
       'name': ['Alice', 'Bob', 'Charlie'],
       'age': [25, 30, 35]
   })

   df
   ```

3. Run it with pdit:
   ```bash
   pdit example.py
   ```

4. Press `Cmd+Enter` (or `Ctrl+Enter`) to execute

## What You'll See

When you run code in pdit, results appear grouped by the lines that produced them:

- **Standard output** appears as plain text
- **Return values** are displayed with syntax highlighting
- **DataFrames** render as scrollable tables
- **Plots** appear as inline images
- **Errors** show full tracebacks

## Next Steps

- [Installation](/guide/installation/) - Detailed installation options
- [Basic Usage](/guide/basic-usage/) - Learn the core workflow
- [Keyboard Shortcuts](/guide/shortcuts/) - Speed up your workflow
