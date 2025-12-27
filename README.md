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

### Install as a tool (recommended)

```bash
uv tool install git+https://github.com/vangberg/pdit@dist
```

This installs `pdit` globally, so you can run it from anywhere:

```bash
pdit script.py
```

### One-off usage with uvx

```bash
uvx --from git+https://github.com/vangberg/pdit@dist pdit script.py
```

### Development install

```bash
git clone git@github.com:vangberg/pdit.git
cd pdit
uv tool install . -e
```

The `-e` flag creates an editable install, so changes to the source are reflected immediately.

## Usage

Start pdit with a Python file:

```bash
pdit script.py
```

This will:
1. Start the local server on port 8888
2. Open your browser automatically
3. Load the script file in the editor

### Options

```bash
pdit [OPTIONS] [SCRIPT]

Options:
  -e, --export        Export script to self-contained HTML file
  -o, --output PATH   Output file for export (default: script.html)
  --stdout            Write export to stdout instead of file
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

### Exporting

Export a script to a self-contained HTML file:

```bash
pdit --export script.py
```

This executes the script and generates `script.html` with the output. The HTML file can be opened in any browser without a server.

## Matplotlib Integration

pdit automatically captures and displays matplotlib plots inline. Always wrap plotting code in a `plt.ioff()` context manager:

```python
import matplotlib.pyplot as plt

with plt.ioff():
    plt.plot([1, 2, 3], [1, 4, 9])
    plt.title("My Plot")
    plt.show()  # Standard matplotlib display
```

The `plt.ioff()` context manager disables interactive mode and enables proper plot capture with standard `plt.show()`.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and testing.

## License

Private
