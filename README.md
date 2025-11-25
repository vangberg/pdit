# rdit

An interactive Python code editor with inline execution results.

## Features

- **Local Python execution** - Full filesystem and package access
- **Interactive editor** - CodeMirror 6-based Python editor
- **Inline results** - Execution results displayed next to code
- **Execute with Cmd+Enter** - Quick code execution
- **Jupyter-like workflow** - Persistent namespace across executions

## Installation

**Requirement**: [uv](https://github.com/astral-sh/uv)

```bash
# From GitHub (no cloning needed, requires SSH key)
uvx --from git+ssh://git@github.com/vangberg/rdit rdit script.py

# From cloned repo
git clone git@github.com:vangberg/rdit.git
cd rdit
uv pip install -e .
uv run rdit script.py
```

## Usage

Start rdit with a Python file:

```bash
uv run rdit script.py
```

This will:
1. Start the local server on port 8888
2. Open your browser automatically
3. Load the script file in the editor

### Options

```bash
uv run rdit [OPTIONS] [SCRIPT]

Options:
  --port INTEGER       Port to run server on (default: 8888)
  --host TEXT         Host to bind to (default: 127.0.0.1)
  --no-browser        Don't open browser automatically
  --help              Show help message
```

### Examples

```bash
# Start with script
uv run rdit analysis.py

# Custom port
uv run rdit --port 9000 script.py

# Start without opening browser
uv run rdit --no-browser script.py

# Just start the editor (no script)
uv run rdit
```

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and testing.

## License

Private
