# Execute Current Expression

## Implementation Status

**Status:** Not implemented

**Current behavior:**
- Cmd+Enter executes all code in the editor (src/Editor.tsx:106-111)
- `executeScript()` does not support line range filtering (src/execution.ts:27)
- No separate shortcuts for current vs all execution
- TopBar shows "RUN ALL (CMD+ENTER)" (src/TopBar.tsx:23)

**Remaining work:** All phases below

---

## Overview

Users can execute individual R expressions at their cursor position, rather than running all code in the editor. This enables iterative, exploratory coding workflows where you can test and run specific parts of your code independently.

## Keyboard Shortcuts

- **Cmd+Enter** - Execute the R expression at the current cursor position
- **Cmd+Shift+Enter** - Execute all code in the editor (existing behavior)

## Execution Behavior

When you press Cmd+Enter:

1. The editor identifies which R expressions overlap with the cursor position or selection
2. **All** expressions overlapping those lines are executed
3. If an expression spans multiple lines, all lines of that expression are included
4. The outputs are updated
5. Your cursor/selection position is preserved

**Examples:**

```r
# Cursor on line 1 → executes both expressions
x <- 1; y <- 2

# Cursor on any of lines 1-3 → executes the entire function definition
my_func <- function() {
  print("hello")
}

# Cursor on line 1 → executes first expression only
x <- 1
y <- 2

# Selection spanning lines 1-2 → executes both expressions
x <- 1
y <- 2
z <- 3  # not executed
```

## Use Cases

- Test a single function call without re-running setup code
- Iterate on data transformations one step at a time
- Explore data interactively by running specific expressions
- Debug by executing code line-by-line or expression-by-expression

## Implementation

### Phase 1: Modify Execution Engine

Update `src/execution.ts` to support partial execution with line range filtering.

**Changes to `executeScript()`:**

```typescript
export async function executeScript(
  script: string,
  options?: {
    lineRange?: { from: number; to: number };  // Optional: execute only expressions overlapping this range (1-based, inclusive)
  }
): Promise<ExecutionResult>
```

**Implementation:**
- Parse script once (already happens): `parse(text=..., keep.source=TRUE)`
- Extract parse data for all expressions (already happens)
- **NEW:** If `lineRange` provided, filter to expressions where the expression's lines overlap with the range:
  - Expression overlaps if: `expressionLineEnd >= lineRange.from && expressionLineStart <= lineRange.to`
- **NEW:** If no expressions match the range, return empty result
- Loop only over filtered expression indices
- Return results only for executed expressions

**Advantages:**
- Single parse operation (no duplicate parsing)
- Detection and execution happen together
- Reuses existing parse data extraction logic
- Supports both cursor position (from === to) and selections (from < to)

### Phase 2: Update Keyboard Shortcuts

Modify `src/Editor.tsx` keyboard shortcuts (currently lines 104-117).

**Current behavior:**
- Cmd+Enter → Execute all code (lines 106-111)
- Cmd+Shift-d → Toggle debug panel (lines 114-116)

**New behavior:**
```typescript
{
  key: "Cmd-Enter",
  run: async (view: EditorView) => {
    const selection = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(selection.from).number;
    const toLine = view.state.doc.lineAt(selection.to).number;
    const currentText = view.state.doc.toString();
    onExecuteCurrentRef.current?.(currentText, { from: fromLine, to: toLine });
    return true;
  },
},
{
  key: "Cmd-Shift-Enter",
  run: (view: EditorView) => {
    const currentText = view.state.doc.toString();
    onExecuteAllRef.current?.(currentText);
    return true;
  },
}
```

**Changes:**
- Extract selection range from `view.state.selection.main`
- Get line numbers for both `from` and `to` positions
- Split into two callbacks: `onExecuteCurrent` and `onExecuteAll`
- Pass line range to current-expression handler

### Phase 3: Wire Up App Component

Update `src/App.tsx` to handle both execution modes.

**Add new handler:**
```typescript
const handleExecuteCurrent = useCallback(
  async (script: string, lineRange: { from: number; to: number }) => {
    if (!isWebRReady) return;

    try {
      const result = await executeScript(script, { lineRange });

      setExecuteResults(result);
      const groups = computeLineGroups(result.results);
      setCurrentLineGroups(groups);
      editorRef.current?.applyExecutionUpdate({
        doc: script,
        lineGroups: groups,
      });
    } catch (error) {
      console.error("Execution error:", error);
    }
  },
  [isWebRReady]
);
```

**Rename existing handler:**
- `handleExecute` → `handleExecuteAll` (keep behavior unchanged)

**Pass both to Editor:**
```typescript
<Editor
  onExecuteCurrent={handleExecuteCurrent}
  onExecuteAll={handleExecuteAll}
  // ... other props
/>
```

### Phase 4: Update TopBar UI

Update `src/TopBar.tsx` to show both shortcuts.

**Current (lines 10-11):** `Execute: ⌘+Enter`

**New:** `⌘+Enter: Current | ⌘⇧+Enter: All` (or similar compact format)

### Phase 5: Edge Cases

**Handle:**
- Empty line → no execution, return empty result
- Comment-only line → execute expression containing comment (if any)
- Parse errors → show error gracefully
- Multiple expressions spanning same line → execute all of them

### Phase 6: Testing

**Manual tests:**
1. Single expression per line (cursor)
2. Multiple expressions per line: `1; 2; 3` (cursor)
3. Multi-line expression (function, pipe) - cursor on different lines
4. Empty lines (cursor)
5. Comments (cursor)
6. Selection spanning multiple expressions
7. Selection spanning part of a multi-line expression
8. Selection with empty lines included
9. Sequential partial executions
10. Full execution after partial

**Unit tests:**
- Test line range filtering logic in `executeScript()`
- Test overlap detection: `expressionLineEnd >= from && expressionLineStart <= to`
- Mock WebR to test filtering behavior
- Test edge cases (empty lines, parse errors, empty selections)
