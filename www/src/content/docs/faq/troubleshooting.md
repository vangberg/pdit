---
title: Troubleshooting
description: Solutions to common problems
---

## Browser doesn't open

If the browser doesn't open automatically, manually navigate to the URL shown in the terminal (usually `http://localhost:8000`).

You can also specify a different port:

```bash
pdit script.py --port 8080
```

## "Module not found" errors

Make sure you're running pdit from the correct Python environment. The kernel uses the same environment as the `pdit` command.

```bash
# Activate your environment first
source venv/bin/activate
pdit script.py
```

## Results not updating

Try these steps:

1. **Refresh the page** - Creates a new kernel session
2. **Check for syntax errors** - Errors in parsing prevent execution
3. **Check the terminal** - Error messages appear in the terminal where pdit is running

## Plots not showing

Make sure you call `plt.show()` after creating your plot:

```python
import matplotlib.pyplot as plt
plt.plot([1, 2, 3])
plt.show()  # Required!
```

## Large output is slow

For very large DataFrames or lots of output, rendering can be slow. Try:

- Limiting DataFrame rows: `df.head(100)`
- Reducing print output
- Breaking code into smaller chunks

## Port already in use

If you see "Address already in use", another pdit instance (or another app) is using that port:

```bash
pdit script.py --port 8001
```

## Still having issues?

Open an issue on [GitHub](https://github.com/vangberg/pdit/issues) with:

- Your Python version
- Your operating system
- Steps to reproduce the problem
