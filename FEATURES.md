# pdit Features & Capabilities

## Core Philosophy

- **Output-focused** - Results appear inline next to the code that generated them
- **Just Python scripts** - No notebooks, no cells, no special format. Work with plain `.py` files

## Execution Model

- **Local execution** - Code runs on your machine with full filesystem and package access
- **IPython kernel** - Persistent namespace across executions, Jupyter-like workflow
- **Streaming results** - See output as it's generated, not after completion
- **Cmd+Enter to run** - Quick, focused execution of your code

## Rich Output Types

- **Standard output** - stdout/stderr captured and displayed
- **Matplotlib plots** - Inline image rendering with `plt.ioff()`
- **Interactive DataFrames** - Sortable, searchable tables powered by itables
- **HTML rendering** - Display rich HTML from `_repr_html_()` methods
- **Markdown** - Format text with markdown syntax
- **Images** - PNG, JPG, and other image formats displayed inline

## Editor Experience

- **CodeMirror 6** - Modern, extensible editor with Python syntax highlighting
- **Browser-based** - No IDE required, works in any modern browser
- **File watching** - Changes to the file on disk automatically update the editor
- **Multi-session** - Each browser tab gets its own IPython kernel instance

## Export & Sharing

- **Self-contained HTML** - Export scripts with results to standalone HTML files
- **No server required** - Exported files open in any browser
- **Complete state capture** - All outputs (text, plots, tables) preserved in export

## Developer Friendly

- **No cloud, no account** - Everything runs locally
- **Full Python ecosystem** - Use any package from PyPI
- **Standard Python files** - Git-friendly, works with existing tools
- **CLI interface** - Simple `pdit script.py` command to start
- **Customizable** - Options for port, host, auto-browser, etc.

## Speed & Performance

- **Fast startup** - Browser opens and connects in seconds
- **Background kernel warming** - Kernel starts while you're opening the editor
- **Minimal latency** - WebSocket-based real-time communication
- **Efficient execution** - AST-parsed statements for precise line tracking
