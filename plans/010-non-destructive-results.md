# Non-Destructive Result Management

## Overview

Currently, executing code replaces all previous results. This plan makes result management non-destructive, preserving ALL results for undo/redo history while displaying only the currently active results.

## Current Behavior

When you execute code:
1. All previous results are discarded
2. New results replace everything
3. If you execute one expression, you lose results from all other expressions
4. Undo/redo loses execution results

## Desired Behavior

**Core principle: NEVER remove results**

When you execute code (full or partial):
1. New results are added to the result store
2. Active result set is updated to include new results
3. Old results remain in storage for undo history
4. Undo/redo switches between result sets
5. Line groups are computed from currently active results

**Examples:**

```r
# Execute all → Active: [1-1, 2-2, 3-3], Store: [1-1, 2-2, 3-3]
x <- 1  # line 1
y <- 2  # line 2
z <- 3  # line 3

# Execute line 2 only → Active: [1-1, 2-2v2, 3-3], Store: [1-1, 2-2, 2-2v2, 3-3]
# New result for line 2, old result kept in store

# Undo → Active: [1-1, 2-2, 3-3], Store: unchanged
# Returns to previous active set

# Redo → Active: [1-1, 2-2v2, 3-3], Store: unchanged
# Returns to newer active set
```

## Result ID Strategy

**Decision:** Continue using global counter (current approach) since:
- Each execution creates new results with unique IDs
- We never reuse IDs
- IDs are stable references for undo/redo history
- Simple and already implemented

## State Management Changes

### Current Structure

```typescript
// App.tsx
const [executeResults, setExecuteResults] = useState<ExecutionResult | null>(null);

// ExecutionResult
interface ExecutionResult {
  results: ExecutionOutput[];
}
```

### New Structure

```typescript
// App.tsx

// All results ever created (NEVER remove from this)
const [resultStore, setResultStore] = useState<Map<number, ExecutionOutput>>(
  new Map()
);
```

**Single-tier storage:**
- **Result Store** - Permanent storage, grows over time, NEVER cleared
- **Line Groups** - Already contain `resultIds`, which determines what's "active"
- **OutputPane** - Looks up results from store using IDs in line groups

**Key insight:** We don't need separate "active IDs" state because line groups already track which results to display via their `resultIds` field.

## Implementation

### Phase 1: Update App Component State

Change state management in `src/App.tsx` to use permanent result store.

**Replace executeResults state (line 38-40):**

```typescript
// Old:
// const [executeResults, setExecuteResults] = useState<ExecutionResult | null>(null);

// New:
const [resultStore, setResultStore] = useState<Map<number, ExecutionOutput>>(
  new Map()
);
```

**No other state changes needed** - Line groups already tracked by `currentLineGroups`.

### Phase 2: Update handleExecute Logic

Modify `handleExecute` in `src/App.tsx` (lines 91-115) to add results to store.

**New implementation:**

```typescript
const handleExecute = useCallback(
  async (script: string) => {
    if (!isWebRReady) {
      console.warn("webR is not ready yet");
      return;
    }

    try {
      const result = await executeScript(script);
      console.log("Execute result:", result);

      // Add new results to store (NEVER remove old ones!)
      const newStore = new Map(resultStore);
      for (const r of result.results) {
        newStore.set(r.id, r);
      }
      setResultStore(newStore);

      // Compute line groups from ALL results in store
      const allResults = Array.from(newStore.values());
      const groups = computeLineGroups(allResults);
      setCurrentLineGroups(groups);

      editorRef.current?.applyExecutionUpdate({
        doc: script,
        lineGroups: groups,
      });
    } catch (error) {
      console.error("Execution error:", error);
    }
  },
  [isWebRReady, resultStore]
);
```

**Key changes:**
- Add all new results to store (never remove)
- Compute line groups from ALL results in store (not just new ones!)
- Line groups contain all result IDs, showing accumulated results
- All results stay in store for undo/redo

### Phase 3: Update OutputPane to Use Result Store

Modify `OutputPane` to accept the result store and look up results by ID.

**Option A: Pass result store directly**

In `App.tsx` (lines 137-145):
```typescript
<OutputPane
  onLineGroupHeightChange={handleLineGroupHeightChange}
  resultStore={resultStore}  // Pass the Map
  lineGroups={currentLineGroups}
  lineGroupTops={lineGroupTops}
  lineGroupHeights={lineGroupHeights}
/>
```

In `OutputPane.tsx`, update to look up results from store using line group result IDs.

**Option B: Keep current interface, pass all results**

In `App.tsx`:
```typescript
<OutputPane
  onLineGroupHeightChange={handleLineGroupHeightChange}
  results={Array.from(resultStore.values())}  // All results
  lineGroups={currentLineGroups}
  lineGroupTops={lineGroupTops}
  lineGroupHeights={lineGroupHeights}
/>
```

**No changes needed to OutputPane.tsx** - it already uses line groups to determine which results to display.

**Recommendation:** Use Option B for minimal changes.

### Phase 4: Create Dev Test Page

Create a simple test page to verify result storage without CodeMirror complexity.

**Location:** `src/dev/` namespace

**Purpose:** Visualize and test the result storage system independently.

**Layout:** Three-column layout showing:

1. **Left column: Test cases**
   - Buttons to execute different R code snippets
   - Examples: "Line 1" (x <- 1), "Line 2" (y <- 2), "Lines 1-2", "Line 1 (again)"
   - Each button shows the code that will be executed

2. **Middle column: Result Store**
   - Display all results in the store
   - Show: Result ID, line range, output text
   - Store size counter at top
   - Verify store grows monotonically (never shrinks)

3. **Right column: Line Groups**
   - Display current line groups
   - Show: Group ID, line range, result IDs in the group
   - Group count at top
   - Verify groups update correctly

**Functionality:**
- Uses same `resultStore` + `handleExecute` logic as main App
- Calls `executeScript()` and `computeLineGroups()`
- No CodeMirror, no editor state - pure result management testing

**Benefits:**
- Fast iteration on result storage logic
- Visual verification of store behavior
- Easy debugging without editor complexity
- Clear demonstration of "never remove" principle

### Phase 5: Handle Stale Results (Future Enhancement)

**Question:** What happens if user edits code between executions?

**Example:**
```r
x <- 1    # Execute → result at line 1
y <- 2    # Execute → result at line 2

# User adds new line at line 1
z <- 0
x <- 1    # Now line 2
y <- 2    # Now line 3

# Results are now at wrong lines visually
```

**Current approach:** DON'T clear results on edit
- Results stay in store for undo history
- Line groups are tracked by CodeMirror and update with edits
- CodeMirror's result-grouping-plugin already handles line shifts during undo/redo
- Results may appear at wrong lines after edits, but that's acceptable for v1

**Future options:**
1. Visual indicator for "stale" results (faded out, warning icon)
2. Clear line groups (but not store) on certain types of edits
3. Content hashing to detect staleness

**Decision:** Keep results, don't clear on edit. Simpler and enables full undo/redo.

### Phase 6: Testing

**Manual tests:**
1. Execute code → see all results, store contains all results
2. Execute again → new results added to store, old ones remain, line groups updated
3. Undo → line groups revert, old results still in store
4. Redo → line groups return, results looked up from store

**Integration tests:**
1. Verify result store grows monotonically (never shrinks)
2. Verify line groups correctly reference result IDs
3. Verify OutputPane can look up all results from line groups
4. Verify undo/redo preserves result access

**No unit tests needed** - Simple state management, no complex algorithms.

## Design Decisions

### 1. NEVER remove results

**Yes** - All results kept for undo/redo history. Store grows monotonically.

### 2. Use Map for storage

**Yes** - Map provides O(1) lookup by result ID for OutputPane.

### 3. How to determine "active" results?

**Line groups** - The `resultIds` in line groups determine which results to display.

### 4. Clear results on edit?

**No** - Keep all results for full undo/redo support.

## Future Enhancements

1. **Visual indicators** for stale results (after code edits)
2. **Result garbage collection** - Clear very old results (e.g., >100 results)
3. **Result persistence** across editor sessions
4. **Selective clearing** (clear plots only, keep text)
