# RDIT Quick Reference Guide

## Key Interfaces

### ExecutionOutput (execution.ts)
```typescript
{
  id: number,              // Global counter (starts 1, increments)
  lineStart: number,       // 1-based line where expression starts
  lineEnd: number,         // 1-based line where expression ends
  output: OutputItem[],    // Text output (stdout/stderr/etc)
  images?: ImageBitmap[]   // Optional plots/graphics
}
```

### LineGroup (compute-line-groups.ts)
```typescript
{
  id: string,              // "lg-0", "lg-1", etc.
  resultIds: number[],     // ExecutionOutput.id values
  lineStart: number,       // 1-based line start
  lineEnd: number          // 1-based line end
}
```

---

## Key Functions

### executeScript() - execution.ts:30-150
**Purpose:** Parse and execute R code expressions

**Input:**
- `script`: R code string
- `options.lineRange`: Optional { from: number; to: number }

**Process:**
1. Parse R code with `parse(text=..., keep.source=TRUE)`
2. For each expression:
   - Get line numbers from R parser
   - Wrap with `withVisible(eval(expr))` ← Tracks visibility
   - Capture stdout/stderr with `shelter.captureR()`
   - Collect images from graphics device
3. Filter: Only create ExecutionOutput if output OR images exist
   - **This is where invisible output is currently dropped**

**Output:** `ExecutionResult { results: ExecutionOutput[] }`

---

### computeLineGroups() - compute-line-groups.ts:14-95
**Purpose:** Group execution results by line overlap using union-find

**Input:** `ExecutionOutput[]`

**Algorithm:**
1. Build line→resultIds map (lines 20-28)
2. Union-find: merge results sharing any line (lines 30-58)
3. Group by root ID (lines 60-67)
4. Calculate min/max lines per group (lines 72-82)
5. Sort by lineStart (line 94)

**Output:** `LineGroup[]`

**Example:**
```
Results: [id:1(L1-3), id:2(L3-5), id:3(L10-11)]
         ↓ (share line 3)
Groups:  [lg-0(L1-5)[1,2], lg-1(L10-11)[3]]
```

---

### processExecutionResults() - results.ts:23-58
**Purpose:** Add results to store and compute new line groups

**Input:**
- `resultStore`: Map<number, ExecutionOutput>
- `newResults`: ExecutionOutput[]
- `options.lineRange`: Optional execution range

**Output:** `{ newStore, groups }`

**Behavior:**
- Full execution: Replace all groups
- Partial execution: Keep non-overlapping groups, merge new ones

---

## Critical Sections for Invisible Output

### 1. Visibility Tracking - execution.ts:97-103
```typescript
const result = await shelter.captureR(`
  {
    .tmp <- withVisible(eval(.rdit_parsed[[${i}]]))  // ← Gets visibility
    if (length(dev.list()) > 0) dev.flush()
    if (.tmp$visible) .tmp$value else invisible(.tmp$value)
  }
`, { withAutoprint: true, ... });
```

The `withVisible()` wrapper captures whether expression is visible/invisible.
**Problem:** We capture it but don't use it.

### 2. Result Filtering - execution.ts:129-138
```typescript
// Only add result if there's output or images
if (output.length > 0 || images.length > 0) {
  results.push({ ... });
}
// INVISIBLE OUTPUT SILENTLY SKIPPED HERE ↑
```

**This is the single point where we lose invisible output.**

---

## CodeMirror State Fields (result-grouping-plugin.ts)

### lineGroupsField
- Stores: `LineGroup[]`
- Updated by: `setLineGroups` effect (from React)
- Read by: `lineGroupBackgroundField`, spacer logic
- Normalized to full lines

### lastExecutedIdsField
- Stores: `Set<number>` (ExecutionOutput.id values)
- Updated by: `setLastExecutedIds` effect (from React)
- Used to: Apply "recent" styling (darker border)
- Tracked for: Undo/redo support

### lineGroupBackgroundField
- Creates: Line background decorations
- Classes: `cm-line-group-bg-{0-5}` (round-robin 6 colors)
- Recent: `cm-line-group-recent` (darker border)
- Reads: `lineGroupsField`, `lastExecutedIdsField`

---

## Data Flow Summary

```
executeScript()
    ↓
ExecutionOutput[] (results with output only)
    ↓
addResults() → processExecutionResults()
    ↓
{newStore: Map, groups: LineGroup[]}
    ↓
React: setResults(newStore), setLineGroups(groups)
    ↓
Editor.applyExecutionUpdate()
    ├─ Dispatch setLineGroups effect
    └─ Dispatch setLastExecutedIds effect
    ↓
CodeMirror lineGroupsField updates
    ├─ lineGroupBackgroundField (decorations)
    └─ lineGroupLayoutExtension (spacers)
    ↓
Visual output: highlighting + alignment
```

---

## Files to Modify for Invisible Output

### Option A: Mark results as invisible (Recommended)

1. **execution.ts** - Track invisibility in ExecutionOutput
   ```typescript
   export interface ExecutionOutput {
     // ... existing fields
     isInvisible?: boolean;  // NEW
   }
   ```

2. **execution.ts** - Change filter logic (lines 129-138)
   ```typescript
   // Always create result if execution happened
   results.push({
     id: globalIdCounter++,
     lineStart, lineEnd,
     output,
     images: images.length > 0 ? images : undefined,
     isInvisible: output.length === 0 && !images.length  // NEW
   });
   ```

3. **Output.tsx** - Show invisible marker
   ```typescript
   {result.isInvisible && result.output.length === 0 && (
     <div className="output-item output-invisible">
       <pre>(invisible)</pre>
     </div>
   )}
   ```

4. **result-grouping-plugin.ts** - Add invisible class
   ```typescript
   const isInvisible = group.resultIds.some(id => {
     const result = resultStore.get(id);
     return result?.isInvisible;
   });
   const classes = isInvisible ? `${colorClass} cm-line-invisible` : colorClass;
   ```

### Option B: Only track when user explicitly executes

Change execution.ts lines 82-89 to only create invisible results when lineRange is specified (user executed just this line).

---

## Testing Insights

### From execution.test.ts:17
```typescript
const script = 'x <- 1\ny <- 2\nz <- 3';
const result = await executeScript(script);
expect(result.results).toHaveLength(0);  // ← No results for invisible output
```

This test confirms current behavior: invisible expressions create no results.

### Tests to Add
```typescript
it('includes invisible expressions when lineRange specified', async () => {
  const script = 'x <- 1\nprint("hello")';
  const result = await executeScript(script, { lineRange: { from: 1, to: 1 } });
  
  expect(result.results).toHaveLength(1);  // Include invisible
  expect(result.results[0].isInvisible).toBe(true);
  expect(result.results[0].lineStart).toBe(1);
});
```

---

## CSS Classes Reference

### Line Background Colors
- `.cm-line-group-bg-0` through `.cm-line-group-bg-5`
- Light pastels + left border (#7dd3fc)
- Used in 6-color round-robin

### Recent Indicator
- `.cm-line-group-recent` - Darker left border (#0284c7)
- Applied to groups containing recently executed result IDs

### New Classes to Add
- `.cm-line-invisible` - Subtle styling for invisible lines
- `.cm-line-group-invisible` - Lighter background than normal groups

---

## Performance Considerations

1. **Union-find in computeLineGroups()**: O(n × m) worst case (n results, m lines)
   - Acceptable for typical script sizes (100s of lines)
   
2. **Decoration updates**: Only when lineGroups change
   - Not on every keystroke
   
3. **Result storage**: Map keyed by ExecutionOutput.id
   - O(1) lookup, maintains insertion order in iterations

---

## Related Files (For Context)

- **Editor.tsx** - Manages CodeMirror instance, applies effects
- **App.tsx** - Orchestrates execution and state flow
- **OutputPane.tsx** - Displays results aligned with editor
- **line-group-layout.ts** - Calculates spacer heights for alignment

