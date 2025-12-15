# pdit 🫛

Pythonic live scripting.

## Features

- **Local Python execution** - Full filesystem and package access
- **Interactive editor** - CodeMirror 6-based Python editor
- **Inline results** - Execution results displayed next to code
- **Execute with Cmd+Enter** - Quick code execution
- **Jupyter-like workflow** - Persistent namespace across executions

## Installation

**Requirement**: [uv](https://github.com/astral-sh/uv)

```bash
# Install from dist branch (recommended, includes pre-built assets)
uv add git+https://github.com/vangberg/pdit@dist

# Or use directly with uvx
uvx --from git+https://github.com/vangberg/pdit@dist pdit start script.py

# From cloned repo (for development)
git clone git@github.com:vangberg/pdit.git
cd pdit
uv pip install -e .
uv run pdit start script.py
```

## Usage

Start pdit with a Python file:

```bash
uv run pdit start script.py
```

This will:
1. Start the local server on port 8888
2. Open your browser automatically
3. Load the script file in the editor

### Options

```bash
uv run pdit start [OPTIONS] [SCRIPT]

Options:
  --port INTEGER       Port to run server on (default: 8888)
  --host TEXT         Host to bind to (default: 127.0.0.1)
  --no-browser        Don't open browser automatically
  --verbose           Print all computation stdout/stderr to console
  --help              Show help message
```

### Examples

```bash
# Start with script
uv run pdit start analysis.py

# Custom port
uv run pdit start --port 9000 script.py

# Start without opening browser
uv run pdit start --no-browser script.py

# Just start the editor (no script)
uv run pdit start
```

### Exporting

Export a script to a self-contained HTML file:

```bash
uv run pdit export script.py
```

This executes the script and generates `script.html` with the output. The HTML file can be opened in any browser without a server.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and testing.

## License

Private
