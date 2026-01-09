---
title: Common Questions
description: Frequently asked questions about pdit
---

## How is pdit different from Jupyter?

Jupyter notebooks use a cell-based interface where you organize code into discrete blocks. pdit works with regular Python files and shows results inline next to the code that produced them.

**Choose pdit when:**
- You prefer working with `.py` files
- You want to use your favorite text editor
- You like seeing results next to code

**Choose Jupyter when:**
- You need rich narrative documentation
- You want explicit control over execution order
- You're doing heavy interactive exploration

## Does pdit modify my files?

Yes, when you edit code in the browser, changes are saved back to the file. pdit also watches for external changes, so you can edit in another editor simultaneously.

## Can I use pdit with virtual environments?

Yes. Run pdit from within your activated virtual environment:

```bash
source venv/bin/activate
pdit script.py
```

pdit uses whatever Python environment is active.

## How do I reset my session?

Refresh the browser tab. This creates a new kernel session with a fresh namespace.

## Can I use IPython magic commands?

Yes! pdit runs on IPython, so magic commands work:

```python
%timeit sum(range(1000))
%pwd
%who
```
