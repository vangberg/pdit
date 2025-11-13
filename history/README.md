# RDIT Architecture Documentation

This directory contains comprehensive documentation about how RDIT (R Document Interactive Textbook) works, specifically focused on:
- How execution results are created and stored
- How line groups are created and displayed
- The complete execution flow
- Where invisible output is handled
- How to add visual feedback for invisible lines

## Documents

### 1. RDIT_ARCHITECTURE_SUMMARY.md (14 KB, 445 lines)
**Comprehensive technical guide covering:**

1. Result creation & storage
   - ExecutionOutput interface
   - Result creation flow in executeScript()
   - Key insight: Invisible output is completely dropped

2. Result storage & processing
   - Results hook (useResults)
   - Result processing pipeline
   - Results keyed by ExecutionOutput.id

3. Line group creation & display
   - LineGroup interface
   - Union-find algorithm for grouping
   - Detailed example of grouping behavior

4. Visualization & highlighting
   - Line group display in OutputPane
   - Output component rendering
   - Editor highlighting (decorations + spacers)
   - CSS theme classes

5. Execution flow diagram
   - Complete pipeline from user action to visual output

6. Invisible output handling (current)
   - Problem description
   - Current behavior
   - Code locations

7. Where to add invisible output feedback
   - Option 1: Marker ExecutionOutput
   - Option 2: isInvisible flag (Recommended)
   - Option 3: Visual-only decoration

8. Summary table of key files

**Use this for:** Deep understanding of the system, implementation details, code locations

---

### 2. DATA_FLOW_DIAGRAM.md (22 KB, 380 lines)
**Visual diagrams showing data flow:**

1. Execution to Display Pipeline
   - ASCII flowchart from user action to visual output
   - Shows all major components and state updates
   - Includes phase breakdowns

2. Line Group Creation (Union-Find Algorithm)
   - Step-by-step example with visual tables
   - Shows transformation from results to groups

3. Invisible Output Problem
   - Current flow diagram
   - Where invisible output is dropped
   - What happens vs. what should happen

4. CodeMirror State Fields Integration
   - Hierarchy of state fields
   - Dependencies and relationships
   - Update triggers

5. React State Hierarchy
   - App.tsx state layout
   - Props flow to children
   - CodeMirror extensions

6. Data Flow for Invisible Output Enhancement
   - Current path (NO feedback)
   - Proposed path (WITH feedback)

**Use this for:** Visual understanding, presentations, identifying integration points

---

### 3. QUICK_REFERENCE.md (7.4 KB, 276 lines)
**Quick lookup guide:**

- Key Interfaces (ExecutionOutput, LineGroup)
- Key Functions with parameters and behavior
- Critical sections for invisible output
  - Visibility tracking location
  - Result filtering location (THE problem point)
- CodeMirror state fields at a glance
- Data flow summary
- Files to modify for invisible output (2 approaches)
- Testing insights and new tests to add
- CSS classes reference
- Performance considerations

**Use this for:** Quick lookups while coding, implementation checklists, integration points

---

## Key Findings Summary

### How Results Are Created (execution.ts:30-150)

1. **Parse R code** with source information
2. **For each expression:**
   - Get line numbers from R parser
   - Wrap with `withVisible()` to track visibility flag
   - Execute and capture stdout/stderr/images
3. **Filter (THE CRITICAL POINT - Lines 129-138):**
   - IF output OR images exist → Create ExecutionOutput
   - ELSE (invisible) → SKIP SILENTLY ← **PROBLEM**

### How Line Groups Are Created (compute-line-groups.ts:14-95)

Uses **union-find algorithm**:
1. Build line→resultIds mapping
2. Union results that share any line
3. Group by root ID
4. Calculate min/max lines per group
5. Return sorted LineGroup[]

### How Visualization Works (result-grouping-plugin.ts)

1. **lineGroupsField** stores LineGroup[]
2. **lineGroupBackgroundField** creates line decorations
   - 6-color round-robin (cm-line-group-bg-0 through -5)
   - "Recent" border for lastExecutedIds
3. **spacersField** aligns output pane with editor

### The Invisible Output Problem

**Location:** execution.ts lines 129-138

```typescript
if (output.length > 0 || images.length > 0) {
  results.push({ ... });
}
// Invisible expressions reach here with empty output and no images
// They are silently skipped - NO ExecutionOutput created
```

**Impact:** Lines with invisible expressions (like `x <- 2`) have:
- No ExecutionOutput
- No LineGroup
- No editor highlighting
- No visual feedback

### Solution: Option 2 (Recommended)

Add `isInvisible?: boolean` flag to ExecutionOutput, then:
1. Always create ExecutionOutput
2. Mark invisible ones with flag
3. Show subtle visual feedback in editor
4. Display "(invisible)" marker in output pane

---

## Navigation Guide

| Question | Document | Section |
|----------|----------|---------|
| How does execution work? | ARCHITECTURE | Section 1 & 5 |
| What's ExecutionOutput? | QUICK_REFERENCE | Key Interfaces |
| How are line groups created? | ARCHITECTURE | Section 3 |
| Where's the invisible output bug? | QUICK_REFERENCE | Critical Sections |
| Need a visual diagram? | DATA_FLOW | Section 1-3 |
| Which files to modify? | QUICK_REFERENCE | Files to Modify |
| What are state fields? | DATA_FLOW | Section 4 |
| How does highlighting work? | ARCHITECTURE | Section 4 |
| Show me the full flow? | DATA_FLOW | Section 1 |

---

## File References

### Core Execution
- `/Users/harryvangberg/git/rdit/src/execution.ts` - Execute R code, create ExecutionOutput
- `/Users/harryvangberg/git/rdit/src/compute-line-groups.ts` - Group results by lines

### State Management
- `/Users/harryvangberg/git/rdit/src/results.ts` - Results hook, processing
- `/Users/harryvangberg/git/rdit/src/result-grouping-plugin.ts` - CodeMirror state + highlighting

### Display
- `/Users/harryvangberg/git/rdit/src/OutputPane.tsx` - Results container
- `/Users/harryvangberg/git/rdit/src/Output.tsx` - Individual result rendering
- `/Users/harryvangberg/git/rdit/src/line-group-layout.ts` - Spacer alignment

### Integration
- `/Users/harryvangberg/git/rdit/src/App.tsx` - Main orchestration
- `/Users/harryvangberg/git/rdit/src/Editor.tsx` - CodeMirror integration

---

## Implementation Checklist (For Invisible Output)

See QUICK_REFERENCE.md section "Files to Modify for Invisible Output" for step-by-step.

**Option A (Recommended):**
- [ ] Add `isInvisible?: boolean` to ExecutionOutput interface
- [ ] Modify execution.ts lines 129-138 to track invisibility
- [ ] Modify Output.tsx to show invisible marker
- [ ] Add CSS classes for invisible styling
- [ ] Update tests in execution.test.ts
- [ ] Consider UI: marker style, output pane indication

---

## Created: 2025-11-13

These documents were generated as part of code exploration and understanding.
They are ephemeral and serve as reference during development.

