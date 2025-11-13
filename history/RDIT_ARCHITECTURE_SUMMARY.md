# RDIT: Results and Line Groups Architecture

## Overview
The codebase manages R code execution, result display, and visual feedback through a well-organized pipeline:
1. **Execution** - WebR evaluates code expressions
2. **Result Storage** - ExecutionOutput objects capture output
3. **Line Grouping** - Expressions with output are grouped by line ranges
4. **Display** - Results shown in OutputPane with visual highlighting

---

## 1. RESULT CREATION & STORAGE

### ExecutionOutput Interface
**File:** `/Users/harryvangberg/git/rdit/src/execution.ts` (lines 8-14)

```typescript
export interface ExecutionOutput {
  id: number;           // Global counter: starts at 1, increments
  lineStart: number;    // 1-based line number where expression starts
  lineEnd: number;      // 1-based line number where expression ends
  output: OutputItem[]; // Array of stdout/stderr/error/warning items
  images?: ImageBitmap[]; // Optional plot/graphics output
}

export interface OutputItem {
  type: 'stdout' | 'stderr' | 'error' | 'warning' | 'message';
  text: string;
}
```

### Result Creation Flow
**File:** `/Users/harryvangberg/git/rdit/src/execution.ts` (lines 30-150)

The `executeScript()` function:

1. **Parses R code** (lines 41-45):
   ```typescript
   await webR.evalRVoid(`
     .rdit_code <- ${JSON.stringify(script)}
     .rdit_parsed <- parse(text = .rdit_code, keep.source = TRUE)
     .rdit_parse_data <- getParseData(.rdit_parsed)
   `);
   ```

2. **Executes each expression** (lines 53-139):
   - Gets line numbers from R parse data
   - Filters by optional `lineRange` parameter (lines 82-89)
   - Wraps execution with `withVisible()` to preserve visibility flag (line 97)
   - Captures output with `shelter.captureR()` (lines 95-110)

3. **Key Execution Snippet** (lines 95-110):
   ```typescript
   const result = await shelter.captureR(`
     {
       .tmp <- withVisible(eval(.rdit_parsed[[${i}]]))
       # Ensure plot is flushed
       if (length(dev.list()) > 0) {
         dev.flush()
       }
       # Preserve invisibility flag
       if (.tmp$visible) .tmp$value else invisible(.tmp$value)
     }
   `, {
     withAutoprint: true,
     captureStreams: true,
     captureConditions: false,
     captureGraphics: false,
   });
   ```

4. **Filters invisible output** (lines 129-138):
   ```typescript
   // Only add result if there's output or images
   if (output.length > 0 || images.length > 0) {
     results.push({
       id: globalIdCounter++,
       lineStart: startLine,
       lineEnd: endLine,
       output: output,
       images: images.length > 0 ? images : undefined,
     });
   }
   ```

### Key Insight: Invisible Output
**Lines 97-103, 129-138:**

The system uses R's `withVisible()` to track visibility:
- If an expression is invisible (like `x <- 2`), no `ExecutionOutput` is created
- Only expressions with output (stdout/stderr/images) generate results
- **Currently: Invisible output is completely hidden - not tracked in the system**

---

## 2. RESULT STORAGE & PROCESSING

### Results Hook
**File:** `/Users/harryvangberg/git/rdit/src/results.ts` (lines 63-97)

```typescript
export function useResults() {
  const [results, setResults] = useState<Map<number, ExecutionOutput>>(
    new Map()  // Keyed by result.id (global counter)
  );
  const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);

  const addResults = useCallback(
    (newResults: ExecutionOutput[], options?: { lineRange?: { from: number; to: number } }) => {
      const { newStore, groups } = processExecutionResults(
        results,
        newResults,
        { currentLineGroups: lineGroups, lineRange: options?.lineRange }
      );
      setResults(newStore);
      setLineGroups(groups);
      return { lineGroups: groups };
    },
    [results, lineGroups]
  );
}
```

### Result Processing
**File:** `/Users/harryvangberg/git/rdit/src/results.ts` (lines 23-58)

```typescript
export function processExecutionResults(
  resultStore: Map<number, ExecutionOutput>,
  newResults: ExecutionOutput[],
  options?: { currentLineGroups?: LineGroup[]; lineRange?: { from: number; to: number } }
): { newStore: Map<number, ExecutionOutput>; groups: LineGroup[] } {
  const newStore = addResultsToStore(resultStore, newResults);
  
  // Compute new groups from executed results ONLY
  const newGroups = computeLineGroups(newResults);
  
  // For partial execution: merge with non-overlapping existing groups
  if (options?.lineRange && options?.currentLineGroups) {
    const nonOverlappingGroups = options.currentLineGroups.filter(
      (group) => group.lineEnd < from || group.lineStart > to
    );
    const mergedGroups = [...nonOverlappingGroups, ...newGroups].sort(
      (a, b) => a.lineStart - b.lineStart
    );
    return { newStore, groups: mergedGroups };
  }
  
  return { newStore, groups: newGroups };
}
```

**Important:** Results are keyed by `ExecutionOutput.id` (global counter).

---

## 3. LINE GROUP CREATION & DISPLAY

### LineGroup Interface
**File:** `/Users/harryvangberg/git/rdit/src/compute-line-groups.ts` (lines 3-8)

```typescript
export interface LineGroup {
  id: string;          // Format: "lg-0", "lg-1", etc.
  resultIds: number[]; // Array of ExecutionOutput.id values
  lineStart: number;   // 1-based line number
  lineEnd: number;     // 1-based line number
}
```

### Line Group Computation
**File:** `/Users/harryvangberg/git/rdit/src/compute-line-groups.ts` (lines 14-95)

Uses **union-find algorithm** to group results that share any lines:

1. **Build line-to-results mapping** (lines 20-28):
   ```typescript
   const lineToResults = new Map<number, Set<number>>();
   for (const result of results) {
     for (let line = result.lineStart; line <= result.lineEnd; line++) {
       if (!lineToResults.has(line)) {
         lineToResults.set(line, new Set());
       }
       lineToResults.get(line)!.add(result.id);
     }
   }
   ```

2. **Union results sharing any line** (lines 30-58):
   - Uses union-find to connect results that touch the same line
   - Transitively merges connected results

3. **Create output groups** (lines 60-94):
   - Groups all results with the same root ID
   - Calculates lineStart/lineEnd for each group
   - Sorts by lineStart

**Example:**
```
Results: [id:1(L1-L3), id:2(L3-L5), id:3(L10-L11)]
       ↓
Lines:  L1:[1], L2:[1], L3:[1,2], L4:[2], L5:[2], L10:[3], L11:[3]
       ↓
Union-find merges 1,2 (share L3)
       ↓
Groups: [id:1,2(L1-L5), id:3(L10-L11)]
```

---

## 4. VISUALIZATION & HIGHLIGHTING

### Line Group Display
**File:** `/Users/harryvangberg/git/rdit/src/OutputPane.tsx` (lines 84-133)

```typescript
{lineGroups.map((group) => {
  const topValue = lineGroupTops?.get(group.id);
  return (
    <div
      className="output-group"
      key={group.id}
      style={
        topValue !== undefined && Number.isFinite(topValue)
          ? { position: "absolute", top: topValue, left: 0, right: 0 }
          : undefined
      }
    >
      {group.resultIds.map((resultId) => {
        const result = results.find((r) => r.id === resultId);
        return <Output key={result.id} result={result} />;
      })}
    </div>
  );
})}
```

### Output Component
**File:** `/Users/harryvangberg/git/rdit/src/Output.tsx` (lines 37-65)

```typescript
<div ref={elementRef} className="output-container">
  <div className="output-line">
    {result.output.map((item, i) => (
      <div key={i} className={`output-item output-${item.type}`}>
        <pre>{item.text}</pre>
      </div>
    ))}
    {result.images && result.images.length > 0 && (
      <div className="output-item output-plot">
        <canvas ref={canvasRef} width={width} height={height} />
      </div>
    )}
  </div>
</div>
```

### Editor Highlighting
**File:** `/Users/harryvangberg/git/rdit/src/result-grouping-plugin.ts`

Two types of highlighting:

1. **Line Background Decorations** (lines 371-407):
   ```typescript
   export const lineGroupBackgroundField = StateField.define<DecorationSet>({
     update(_, tr) {
       const lineGroups = tr.state.field(lineGroupsField);
       const lastExecutedIds = tr.state.field(lastExecutedIdsField);
       
       for (let groupIndex = 0; groupIndex < lineGroups.length; groupIndex++) {
         const group = lineGroups[groupIndex];
         const colorClass = `cm-line-group-bg-${groupIndex % 6}`;
         const isRecent = group.resultIds.some(id => lastExecutedIds.has(id));
         const classes = isRecent ? `${colorClass} cm-line-group-recent` : colorClass;
         
         for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
           const line = tr.state.doc.line(lineNum);
           decorations.push(lineDecoration.range(line.from));
         }
       }
     }
   });
   ```

2. **Right-side Spacers with Output** (lines 106-171 in `line-group-layout.ts`):
   - Measures output pane height
   - Creates spacers to align with source code
   - Marks recent executions with darker border

### CSS Theme Classes
**File:** `/Users/harryvangberg/git/rdit/src/result-grouping-plugin.ts` (lines 409-490)

```typescript
".cm-line-group-bg-0": {
  backgroundColor: "rgba(252, 228, 236, 0.5)",
  borderLeft: "3px solid #7dd3fc",
}
// ... 5 color variations for round-robin coloring

".cm-line-group-recent": {
  borderLeft: "3px solid #0284c7",  // Darker blue for recent
}
```

---

## 5. EXECUTION FLOW DIAGRAM

```
handleExecute()  [App.tsx]
       ↓
executeScript()  [execution.ts]
       ↓
For each R expression:
  ├─ Get line numbers from R parser
  ├─ withVisible(eval(expr))  ← Captures visibility
  ├─ Capture stdout/stderr/images
  └─ If output exists → Create ExecutionOutput
       ↓
Array of ExecutionOutput[]
       ↓
processExecutionResults()  [results.ts]
  ├─ addResultsToStore() - Add to Map<id, ExecutionOutput>
  └─ computeLineGroups() - Group by line ranges
       ↓
LineGroup[]
       ↓
updateLineGroups()  [result-grouping-plugin.ts]
  ├─ lineGroupsField (CodeMirror state)
  └─ lineGroupBackgroundField (Decorations)
       ↓
Visual highlighting in editor + spacers in output pane
```

---

## 6. INVISIBLE OUTPUT HANDLING (CURRENT)

**Problem:** Expressions with invisible output (like `x <- 2`) generate NO ExecutionOutput

**Current behavior:**
1. R wraps execution with `withVisible()` (line 97)
2. If invisible, expression evaluation completes without output
3. No OutputItem created → No ExecutionOutput → No LineGroup
4. Line has no visual feedback

**Current code (lines 129-138):**
```typescript
if (output.length > 0 || images.length > 0) {
  results.push({ ... });  // Only create result if has output
}
// Silent return if no output - line has NO visual feedback
```

---

## 7. WHERE TO ADD INVISIBLE OUTPUT FEEDBACK

### Option 1: Create a marker ExecutionOutput
**Change location:** `/Users/harryvangberg/git/rdit/src/execution.ts` (lines 129-138)

```typescript
// Instead of silently skipping:
if (output.length > 0 || images.length > 0) {
  results.push({ id: globalIdCounter++, lineStart, lineEnd, output, images });
} else if (lineRangeExecution) {
  // Create invisible marker with empty output
  results.push({
    id: globalIdCounter++,
    lineStart, lineEnd,
    output: [{ type: 'message', text: '(invisible)' }],  // Or empty array
    _invisible: true  // New field to track this
  });
}
```

### Option 2: Add marker to ExecutionOutput interface
**Change location:** `/Users/harryvangberg/git/rdit/src/execution.ts` (lines 8-14)

```typescript
export interface ExecutionOutput {
  id: number;
  lineStart: number;
  lineEnd: number;
  output: OutputItem[];
  images?: ImageBitmap[];
  isInvisible?: boolean;  // NEW: Marks invisible expressions
}
```

Then in execution.ts, track whether result was invisible:
```typescript
const result = await shelter.captureR(...);
const isInvisible = output.length === 0 && !images.length;

results.push({
  id: globalIdCounter++,
  lineStart, lineEnd,
  output: output.length > 0 ? output : [],
  images: images.length > 0 ? images : undefined,
  isInvisible  // NEW
});
```

### Option 3: Create visual-only decoration (no result object)
Directly in the editor without creating ExecutionOutput:
- Scan for expressions with no output
- Add decoration markers for invisible lines
- Would require parsing results to find "missing" lines
- More complex, not recommended

---

## SUMMARY OF KEY FILES

| File | Purpose | Key Components |
|------|---------|-----------------|
| `execution.ts` | WebR code evaluation | `executeScript()`, `ExecutionOutput` interface, invisibility tracking |
| `results.ts` | Result storage & processing | `useResults()` hook, `processExecutionResults()` |
| `compute-line-groups.ts` | Group results by line ranges | `computeLineGroups()`, union-find algorithm, `LineGroup` interface |
| `result-grouping-plugin.ts` | CodeMirror highlighting & state | Decorations, background colors, recent execution tracking |
| `line-group-layout.ts` | Output pane layout & spacers | Spacer sizing, position calculations |
| `OutputPane.tsx` | Result display container | Maps lineGroups → Output components |
| `Output.tsx` | Individual result rendering | Text output + canvas for images |
| `App.tsx` | Main orchestration | Connects all pieces, handles execution callbacks |

---

## TESTING INSIGHTS

### Invisible Output Behavior
**From `execution.test.ts` (line 17):**
```typescript
it('executes all expressions in the script', async () => {
  const script = 'x <- 1\ny <- 2\nz <- 3';
  const result = await executeScript(script);
  
  // Should execute all three expressions
  expect(result.results).toHaveLength(0); // No output generated for assignments
  //                       ↑ Currently: invisible output generates NO results
});
```

This confirms invisible expressions don't create ExecutionOutput objects.

