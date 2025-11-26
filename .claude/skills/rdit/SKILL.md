---
name: rdit
description: Collaborate with users running rdit, an interactive Python editor with inline execution results. Use when user mentions rdit, runs uvx rdit, or is doing collaborative Python development where they see live execution output in a browser.
---

# rdit Collaboration

rdit is an interactive Python editor with inline execution results. The user sees a browser-based
split-pane interface: code editor (left) and streaming execution results (right).

## User's Environment

**Starting rdit:**

rdit runs from the local uv environment so dependencies work seamlessly.

If pyproject.toml exists, just add rdit and run:
```bash
uv add git+ssh://git@github.com/vangberg/rdit@file-watcher
uv run rdit script.py
```

If starting fresh:
```bash
uv init
uv add git+ssh://git@github.com/vangberg/rdit@file-watcher
uv run rdit script.py
```

Run with `run_in_background: true` in the Bash tool so you can continue editing.

Options: `--port 9000` (different port), `--no-browser` (don't auto-open browser)

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
4. Iterate based on results user describes

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

## Tips

- Expressions show their values inline - `print()` is rarely needed
- Write intermediate expressions to see values: `df.shape` instead of `print(df.shape)`
- Long-running code streams results as each statement completes
- User has full filesystem and package access (local Python execution)

## Dependencies

Since rdit runs from the local uv environment, add packages with `uv add`:

```bash
uv add pandas matplotlib
```

No server restart needed - packages are available immediately in both rdit and `uv run` validation.
