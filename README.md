# pdit

Output-focused Python editor.

pdit lets you write regular Python files and see execution results inline, like a notebook but without cells. Edit in your browser or your favorite editor.

## Quick Start

```bash
pip install pdit
pdit script.py
```

## Features

- **Output-focused** - Results appear inline next to the code that generated them
- **Just Python scripts** - No notebooks, no cells, no special format. Work with plain `.py` files
- **File watching** - Changes to the file on disk automatically reload in the editor
- **Auto-run** - Execute code automatically when the file changes
- **Coding agents** - Perfect companion for Claude Code, Cursor, and other AI coding tools that edit files

### Rich Output

- **IPython display** - Rich outputs via [IPython.display](https://ipython.readthedocs.io/en/latest/api/generated/IPython.display.html)
- **Matplotlib** - Inline plot rendering
- **Interactive DataFrames** - Sortable, searchable tables
- **Markdown** - Format text output with Markdown

## Output

### Markdown

Top-level string output renders as Markdown, so headings, lists, and emphasis display cleanly.

### HTML

Rich HTML output is supported for objects that implement `_repr_html_()`; see note: [IPython.display.display](https://ipython.readthedocs.io/en/latest/api/generated/IPython.display.html#IPython.display.display).

### IPython display

IPython display objects render inline; see [IPython.display](https://ipython.readthedocs.io/en/latest/api/generated/IPython.display.html) for details.

### DataFrames

Pandas and Polars DataFrames render as interactive tables automatically.

### Plots

Matplotlib figures display inline. Call `plt.show()`.

## Installation

For development installs or running from source, use [uv](https://github.com/astral-sh/uv).

```bash
# Install from PyPI
uv add pdit

# Or use directly with uvx
uvx pdit script.py

# From cloned repo (for development)
git clone git@github.com:vangberg/pdit.git
cd pdit
uv pip install -e .
uv run pdit script.py
```

## Usage

Start pdit with a Python file:

```bash
pdit script.py
```

This will:
1. Start the local server on port 8888
2. Open your browser automatically
3. Load the script file in the editor

If you're running from source, use:

```bash
uv run pdit script.py
```

### Options

```bash
pdit [OPTIONS] [SCRIPT]

Options:
  --port INTEGER      Port to run server on (default: 8888)
  --host TEXT         Host to bind to (default: 127.0.0.1)
  --no-browser        Don't open browser automatically
  --help              Show help message
```

### Examples

```bash
# Start with script
pdit analysis.py

# Custom port
pdit --port 9000 script.py

# Start without opening browser
pdit --no-browser script.py

# Just start the editor (no script)
pdit
```
## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and testing.

## License

Private
