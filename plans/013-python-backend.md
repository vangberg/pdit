# Python Backend

Current we have a Pyodide based backend for running Python code in the browser. We want to add a regular Python backend for running
rdit on your local machine, to ease access to local data files
and a greater range of packages.

## Usage

The user installs rdit via `pip` or `uv`, and opens a script in rdit via the command line:

```
uvx run rdit my_script.py
```

This starts a local web server and opens the rdit interface in the browser, similar to Jupyter Notebook or Jupyter Lab. The script
has access to local files and can use any installed Python packages.

## Implementation

We can use FastAPI to implement the backend server, as it is lightweight and easy to use. The server will handle requests from the frontend, execute the Python code, and return the results.

Refactor `execution-python.ts` to `execution.ts` which is an
abstract implementation with switchable backends.

Add a Pyodide backend from the existing implementation and a new
Python backend which calls the FastAPI server.

We also need to turn this into a Python backage that can run via
e.g. `uvx run`. Can we do this via GitHub without releasing to
PyPi for now?
