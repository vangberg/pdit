# rdit Python Backend

This is the Python backend server for rdit, enabling local Python execution with access to local files and packages.

## Installation

### Using uv (recommended)

```bash
uvx --from . rdit my_script.py
```

### Using pip

```bash
pip install .
rdit my_script.py
```

## Usage

Start rdit with a Python script:

```bash
rdit my_script.py
```

This will:
1. Start a local FastAPI server
2. Open your browser with the rdit interface
3. Load and execute your Python script

### Options

- `--port PORT`: Specify the port (default: 8888)
- `--host HOST`: Specify the host (default: 127.0.0.1)
- `--no-browser`: Don't open the browser automatically

## Development

Install in development mode:

```bash
pip install -e ".[dev]"
```

Run tests:

```bash
pytest
```

## Architecture

The Python backend consists of:

- **server.py**: FastAPI server that executes Python code
- **cli.py**: Command-line interface
- **/execute endpoint**: Executes Python statements and returns results
- **/reset endpoint**: Resets the execution namespace
- **/health endpoint**: Health check

The server maintains a global execution namespace across requests, similar to a Jupyter kernel.
