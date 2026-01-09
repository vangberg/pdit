---
title: Installation
description: How to install pdit
---

## Requirements

- Python 3.9 or higher
- A modern web browser (Chrome, Firefox, Safari, Edge)

## Using pip

The simplest way to install pdit:

```bash
pip install pdit
```

## Using uv

If you use [uv](https://github.com/astral-sh/uv) for Python package management:

```bash
uv pip install pdit
```

Or run directly without installing:

```bash
uvx pdit script.py
```

## Using pipx

For isolated installation:

```bash
pipx install pdit
```

## Verify Installation

Check that pdit is installed correctly:

```bash
pdit --version
```

## Optional Dependencies

pdit works best with these packages installed in your environment:

- **pandas** - For DataFrame rendering
- **matplotlib** - For inline plots
- **numpy** - For array display

Install them with:

```bash
pip install pandas matplotlib numpy
```
