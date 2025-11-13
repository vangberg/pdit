# RDIT Data Flow Diagrams

## 1. Execution to Display Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│ User Action: Execute Code (Cmd+Enter or Run All)                   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ App.tsx: handleExecute() [lines 94-121]                            │
│  ├─ Input: script: string, lineRange?: { from, to }               │
│  └─ Calls executeScript()                                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ execution.ts: executeScript() [lines 30-150]                       │
│                                                                      │
│  Phase 1: Parse R Code                                             │
│    • Store code in R variable (.rdit_code)                         │
│    • Parse with source info (.rdit_parsed)                         │
│    • Extract parse data (.rdit_parse_data)                         │
│                                                                      │
│  Phase 2: For Each Expression                                      │
│    1. Get line numbers from R parser (lineStart, lineEnd)          │
│    2. Filter by lineRange if provided (lines 82-89)               │
│    3. Wrap in withVisible() to track visibility flag                │
│    4. Execute with shelter.captureR() to catch output              │
│    5. Flush plots (dev.flush())                                    │
│    6. Collect images from persistent graphics device               │
│    7. Convert output to OutputItem[] format                        │
│                                                                      │
│  Phase 3: Filter & Create Results                                  │
│    • If output.length > 0 OR images.length > 0:                   │
│      └─ Create ExecutionOutput with id, lineStart, lineEnd, output│
│    • Else:                                                          │
│      └─ Skip (INVISIBLE OUTPUT - NO TRACKING)                     │
│                                                                      │
│  Return: ExecutionResult { results: ExecutionOutput[] }           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ results.ts: processExecutionResults() [lines 23-58]               │
│                                                                      │
│  addResultsToStore() [lines 8-17]                                  │
│    • Create new Map(resultStore)                                   │
│    • For each ExecutionOutput: map.set(id, result)                │
│    → newStore: Map<number, ExecutionOutput>                       │
│                                                                      │
│  computeLineGroups() [execute.ts lines 37]                        │
│    • Input: ExecutionOutput[] (only those with output)            │
│    • Uses union-find to group by line overlap                      │
│    → groups: LineGroup[]                                           │
│                                                                      │
│  For partial execution (lineRange provided):                       │
│    • Filter existing groups outside [from, to]                    │
│    • Merge with new groups                                         │
│    • Sort by lineStart                                             │
│                                                                      │
│  Return: { newStore, groups }                                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ React State Update: results, lineGroups [results.ts lines 84-85]   │
│  • setResults(newStore)                                            │
│  • setLineGroups(groups)                                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│ App.tsx: Update Editor   │  │ App.tsx: Update Output   │
│  applyExecutionUpdate()  │  │  <OutputPane />          │
│  [lines 111-115]         │  │  [lines 158-164]         │
│                          │  │                          │
│ Inputs:                  │  │ Inputs:                  │
│  • lineGroups            │  │  • Array.from(results)   │
│  • lastExecutedResultIds │  │  • lineGroups            │
└──────────┬───────────────┘  │  • lineGroupTops         │
           │                  │  • lineGroupHeights      │
           │                  └──────────┬───────────────┘
           │                             │
           ▼                             ▼
┌──────────────────────────────┐  ┌──────────────────────┐
│ Editor.tsx: CodeMirror       │  │ OutputPane.tsx       │
│ Dispatch effects:            │  │ [lines 84-133]       │
│  • setLineGroups effect      │  │                      │
│  • setLastExecutedIds effect │  │ For each LineGroup:  │
│  [lines in Editor]           │  │  • Create output-    │
│                              │  │    group div         │
│ lineGroupsField updates:     │  │  • Position absolute │
│  • lineGroupBackgroundField  │  │  • Map resultIds     │
│    (colored line backgrounds)│  │    to Output comps   │
│  • lastExecutedIdsField      │  │                      │
│    (tracks recent executions)│  │ Output.tsx renders:  │
└──────────┬───────────────────┘  │  • Text content      │
           │                      │  • Canvas for plots  │
           │                      └──────────┬───────────┘
           │                                 │
           ▼                                 ▼
┌──────────────────────────────┐  ┌─────────────────────┐
│ CodeMirror Decorations       │  │ Visual Output Pane  │
│  • Line backgrounds          │  │  (Right side panel) │
│  • 6-color round-robin       │  │                     │
│  • Recent = darker border    │  │ Shows results aligned│
│  • Spacers for alignment     │  │ with editor lines   │
└──────────────────────────────┘  └─────────────────────┘
```

---

## 2. Line Group Creation (Union-Find Algorithm)

```
INPUT: ExecutionOutput[] = [
  { id: 1, lineStart: 1, lineEnd: 3, output: [...] },
  { id: 2, lineStart: 3, lineEnd: 5, output: [...] },
  { id: 3, lineStart: 10, lineEnd: 11, output: [...] },
]

STEP 1: Build Line-to-Results Mapping
┌─────────────────────────┐
│ Line │ Result IDs      │
├─────┼─────────────────┤
│ 1   │ {1}            │
│ 2   │ {1}            │
│ 3   │ {1, 2}    ← SHARED │
│ 4   │ {2}            │
│ 5   │ {2}            │
│ 10  │ {3}            │
│ 11  │ {3}            │
└─────────────────────────┘

STEP 2: Union-Find - Group Results Sharing Lines
┌──────────────────────────────────────────┐
│ For each line with multiple result IDs:  │
│   union(resultId[0], resultId[1], ...)   │
└──────────────────────────────────────────┘

Line 3 has {1, 2} → union(1, 2)
  Parent map: { 1→1, 2→1, 3→3 }
  (Result 2 now linked to result 1)

STEP 3: Group by Root ID
┌──────────────────────┐
│ Root 1: [1, 2]      │  ← Merged group
│ Root 3: [3]         │  ← Separate group
└──────────────────────┘

STEP 4: Create LineGroups
┌─────────────┬────────────────────┐
│ LineGroup   │ Properties         │
├─────────────┼────────────────────┤
│ lg-0        │ resultIds: [1, 2]  │
│             │ lineStart: 1       │
│             │ lineEnd: 5         │
├─────────────┼────────────────────┤
│ lg-1        │ resultIds: [3]     │
│             │ lineStart: 10      │
│             │ lineEnd: 11        │
└─────────────┴────────────────────┘

OUTPUT: LineGroup[] = [
  { id: "lg-0", resultIds: [1, 2], lineStart: 1, lineEnd: 5 },
  { id: "lg-1", resultIds: [3], lineStart: 10, lineEnd: 11 }
]
```

---

## 3. Invisible Output Problem

```
Script:
┌──────────────────┐
│ 1: x <- 2        │ ← INVISIBLE (no output)
│ 2: print(x)      │ ← VISIBLE (prints "2")
│ 3: y <- 5        │ ← INVISIBLE (no output)
└──────────────────┘

Current Execution Flow:
┌─────────────────────────────────────────┐
│ Expression 1: x <- 2                    │
│  • withVisible(eval(x <- 2)) = invisible│
│  • No stdout/stderr → output = []       │
│  • Lines 129-138: if (output.length > 0)│
│    └─ FALSE → NO ExecutionOutput        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Expression 2: print(x)                  │
│  • withVisible(eval(print(x))) = visible│
│  • stdout: "2" → output = [{text: "2"}] │
│  • Lines 129-138: if (output.length > 0)│
│    └─ TRUE → Create ExecutionOutput(2)  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Expression 3: y <- 5                    │
│  • withVisible(eval(y <- 5)) = invisible│
│  • No stdout/stderr → output = []       │
│  • Lines 129-138: if (output.length > 0)│
│    └─ FALSE → NO ExecutionOutput        │
└─────────────────────────────────────────┘

Results Array:
┌───────────────────────────────────────┐
│ results: [                            │
│   {                                   │
│     id: 1,                            │
│     lineStart: 2,                     │
│     lineEnd: 2,                       │
│     output: [{type: 'stdout', ...}]  │
│   }                                   │
│ ]                                     │
│                                       │
│ Lines 1 and 3 have NO FEEDBACK        │
└───────────────────────────────────────┘

Editor Display:
┌──────────────────┐
│ 1: x <- 2        │ ← NO HIGHLIGHTING
│ 2: print(x)      │ ← HIGHLIGHTED (colored bg)
│ 3: y <- 5        │ ← NO HIGHLIGHTING
└──────────────────┘
```

---

## 4. CodeMirror State Fields Integration

```
EditorState Tree:
┌─────────────────────────────────────────────────────────────┐
│ CodeMirror EditorState                                      │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ lineGroupsField: LineGroup[]                           │ │
│ │  • Updated by: setLineGroups effect (from React)       │ │
│ │  • Normalized to full lines                            │ │
│ │  • Tracked for undo/redo                               │ │
│ │  • Used by: lineGroupBackgroundField, spacer updates   │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ lastExecutedIdsField: Set<number>                      │ │
│ │  • Updated by: setLastExecutedIds effect (from React)  │ │
│ │  • Contains ids of results from last execution         │ │
│ │  • Used by: lineGroupBackgroundField (recent border)   │ │
│ │  • Tracked for undo/redo                               │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ groupRangesField: RangeSet<GroupValue>                 │ │
│ │  • Internal: snapped ranges for line groups            │ │
│ │  • Maps through document changes automatically         │ │
│ │  • Supports undo/redo via invertedEffects              │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ lineGroupBackgroundField: DecorationSet                │ │
│ │  • Line background decorations                         │ │
│ │  • Classes: cm-line-group-bg-{0-5}                    │ │
│ │  • Recent: cm-line-group-recent (darker border)        │ │
│ │  • Provides: EditorView.decorations                    │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ spacersField: DecorationSet                            │ │
│ │  • Spacer widgets for output alignment                 │ │
│ │  • Updated by: setLineGroupTargetHeights effect        │ │
│ │  • Provides: EditorView.decorations                    │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ lineGroupTargetHeightsField: Map<string, number>       │ │
│ │  • Target heights from output pane measurements        │ │
│ │  • Used to size spacers for alignment                  │ │
│ └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. React State Hierarchy

```
App.tsx (Top Level)
│
├─ State Hooks:
│  ├─ results: Map<number, ExecutionOutput>
│  ├─ lineGroups: LineGroup[]
│  ├─ lineGroupHeights: Map<string, number>
│  ├─ lineGroupTops: Map<string, number>
│  ├─ isWebRReady: boolean
│  └─ doc: Text (CodeMirror document)
│
├─ useResults() Hook → { results, lineGroups, addResults }
│
└─ Passes to Children:
   │
   ├─ Editor.tsx
   │  ├─ Props:
   │  │  ├─ lineGroupHeights
   │  │  ├─ (receives lineGroups via callback)
   │  │  └─ (receives lineGroupTops via callback)
   │  │
   │  └─ CodeMirror Extensions:
   │     ├─ resultGroupingExtension (highlights, decorations, state)
   │     ├─ lineGroupLayoutExtension (spacers, alignment)
   │     └─ codemirror-debug-panel
   │
   └─ OutputPane.tsx
      ├─ Props:
      │  ├─ results: ExecutionOutput[]
      │  ├─ lineGroups: LineGroup[]
      │  ├─ lineGroupTops?: Map<string, number>
      │  ├─ lineGroupHeights?: Map<string, number>
      │  └─ onLineGroupHeightChange callback
      │
      └─ Renders:
         └─ For each LineGroup:
            └─ For each resultId in group:
               └─ <Output result={result} />
```

---

## 6. Data Flow for Invisible Output Enhancement

### Current Path (NO feedback for invisible):
```
Script: x <- 2
   ↓
withVisible() → invisible
   ↓
No stdout/stderr captured
   ↓
output = []
   ↓
Lines 129-138: Check if (output.length > 0)
   ├─ TRUE:  Create ExecutionOutput
   └─ FALSE: Skip silently ← INVISIBLE OUTPUT IGNORED
   ↓
(No result created, no line group, no highlighting)
```

### Proposed Path (Add invisible tracking):
```
Script: x <- 2
   ↓
withVisible() → invisible
   ↓
No stdout/stderr captured
   ↓
output = []
   ↓
Track invisibility: isInvisible = (output.length === 0 && !images.length)
   ↓
Create ExecutionOutput {
  id: counter++,
  lineStart, lineEnd,
  output: [],        // Empty or marker message
  isInvisible: true  // NEW FLAG
}
   ↓
computeLineGroups() creates LineGroup
   ↓
lineGroupBackgroundField decorates line with "invisible" class
   ↓
Editor shows subtle visual feedback (e.g., lighter color)
   ↓
Output.tsx shows "(invisible)" or icon marker
```

