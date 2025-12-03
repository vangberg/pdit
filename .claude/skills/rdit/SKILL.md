---
name: rdit
description: Collaborate with users running rdit, an interactive Python editor with inline execution results. Use when user mentions rdit, runs `uv rdit`, or is doing collaborative Python development where they see live execution output in a browser.
---

# rdit Collaboration

rdit is an interactive Python editor with inline execution results. The user sees a browser-based
split-pane interface: code editor (left) and streaming execution results (right).

## User's Environment

**Starting rdit:**

rdit runs from the local uv environment so dependencies work seamlessly.

If pyproject.toml exists, just add rdit and run:
```bash
uv add git+https://github.com/vangberg/rdit@dist
uv run rdit script.py --verbose
```

If starting fresh:
```bash
uv init
uv add git+https://github.com/vangberg/rdit@dist
uv run rdit script.py --verbose
```

**Note:** The `@dist` branch contains pre-built frontend assets, so no Node.js or build step is needed.

**Upgrading rdit:**

To upgrade to the latest version of rdit:
```bash
uv lock --upgrade-package rdit
```

Run with `run_in_background: true` in the Bash tool so you can continue editing.

**IMPORTANT: Always use `--verbose` when Claude is running rdit.**

Verbose mode prints all execution output to the console where rdit is running:
- Shows each line being executed (with `>>>` prefix like Python REPL)
- Displays all stdout/stderr output in real-time
- Shows script name with `[script.py]` prefix
- Allows Claude to see what's happening in the user's browser without waiting for feedback
- Essential for debugging and validating code changes

Options:
- `--verbose` - Print all computation stdout/stderr to console (REQUIRED for Claude)
- `--port 9000` - Use different port (default: 8888)
- `--no-browser` - Don't auto-open browser

Server runs on `127.0.0.1:8888`, browser opens automatically.

**What the user sees:**
- Left pane: CodeMirror Python editor with syntax highlighting
- Right pane: Execution results grouped by source lines
- Top bar: RUN CURRENT, RUN ALL, SAVE buttons

**User shortcuts:**
| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Execute selection/current | Cmd+Enter | Ctrl+Enter |
| Execute all | Cmd+Shift+Enter | Ctrl+Shift+Enter |
| Save | Cmd+S | Ctrl+S |

## Code Style

**Write simple, top-level exploratory code** - like a Jupyter notebook, not a production module.

- Prefer flat, sequential statements over functions and classes
- Each line/expression shows its result inline - take advantage of this
- Avoid unnecessary abstractions, loops, or defensive code
- Focus on data exploration: load, inspect, transform, visualize

```python
import pandas as pd

df = pd.read_csv("data.csv")
df.head()
df.shape
df.describe()
df["price"].mean()
df[df["price"] > 100]
```

## Execution Model

- **Stateful**: Variables persist across executions (like Jupyter kernel)
- **Streaming**: Results appear as each statement completes via SSE
- **Line-grouped**: Results display next to the code that produced them
- **Reset**: User can reset namespace to clear all variables

## Collaboration Workflow

**File watching enabled** (`file-watcher` branch): When you edit the Python file, changes appear
in the user's editor automatically.

**Validate before the user sees it:**
- Run the script yourself with `uv run script.py` before presenting to user
- Fix any errors or warnings so output is clean
- User should see working code, not debug your mistakes

**Recommended workflow:**
1. Write/edit the `.py` file
2. Run `uv run script.py` to validate - fix any errors
3. User sees clean code and runs with Cmd+Enter
4. With `--verbose`, you can see execution output in your console and validate without user feedback

**When user shares output:**
- Results show stdout, stderr, and expression values
- Errors include full tracebacks
- Results are associated with specific line ranges

## API (if needed)

```
POST /api/execute-script  - Execute code (SSE streaming)
POST /api/reset           - Reset namespace
GET  /api/read-file       - Read file from disk
POST /api/save-file       - Save file to disk
GET  /api/health          - Health check
```

## Markdown Cells

rdit supports markdown cells for documentation and explanations using docstring style:

```python
"""
# Data Analysis
This section loads and explores the dataset
"""

import pandas as pd
df = pd.read_csv("data.csv")
df.head()

"""
## Summary Statistics
Let's look at the distribution of values
"""

df.describe()
```

**Usage:**
- Use triple-quoted strings (`"""..."""`) as markdown cells
- Content is rendered as markdown in the output pane
- Supports standard markdown: headers, lists, links, code blocks, etc.
- Great for documenting analysis steps and explaining results

**Shortcut:**
- Insert markdown cell: Cmd+M / Ctrl+M (inserts template and positions cursor)

## Matplotlib Plots

rdit captures matplotlib plots automatically:

```python
import matplotlib.pyplot as plt

plt.plot([1, 2, 3], [1, 4, 9])
plt.title("My Plot")
plt.gca()  # ✅ This triggers plot capture
```

**IMPORTANT:** Use `plt.gca()` to display plots, NOT `plt.show()`:
- `plt.gca()` returns the Axes object, which rdit captures and renders
- `plt.show()` is for interactive displays and won't work in rdit
- Plots appear inline in the output pane automatically

## Tips

- Expressions show their values inline - `print()` is rarely needed
- Write intermediate expressions to see values: `df.shape` instead of `print(df.shape)`
- Long-running code streams results as each statement completes
- User has full filesystem and package access (local Python execution)
- Use docstring-style markdown cells to document your analysis
- Use `plt.gca()` to display matplotlib plots inline

## Dependencies

Since rdit runs from the local uv environment, add packages with `uv add`:

```bash
uv add pandas matplotlib
```

No server restart needed - packages are available immediately in both rdit and `uv run` validation.
