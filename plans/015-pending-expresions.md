# Pending expressions

When executing one or more expressions in a script, we want to
indicate which line groups has pending expressions, and which
are currently being executed.

1. Line groups with pending expressions get a grey border.
2. Line groups with currently executing expressions get a green border.
3. Line groups with done expressions have a blue border as currently.
4. Last executed expression(s) have a dark blue border as currently.

The code flow is something like:

1. `App.tsx` calls `executeScript()` as currently.
2. The backend:
   1. Parses the script and return all expressions, with state `pending`.
   2. Before each expression is executed, the backend sends an update to the frontend
      indicating that the expression is now `executing`.
   3. After each expression is executed, the backend sends an update to the frontend
      indicating that the expression is now `done`, including the result or error.
3. The frontend updates the UI accordingly, adding/removing borders as needed.
