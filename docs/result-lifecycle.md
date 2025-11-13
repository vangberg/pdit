# Result Lifecycle and Display Management

## Goal

When code is executed multiple times, we want to show the **most recent result** for each line while preserving historical results for potential future use (undo, history browsing, etc.).

## Core Principle

**Results are never deleted, only hidden from view.**

When a line is re-executed, we don't destroy its previous results. Instead, we maintain two concepts:

- **Result Store**: All results ever produced (grows monotonically)
- **Active Results**: Which results are currently visible to the user

## User Experience

### Initial Execution

```r
head(mtcars)      # Line 2 - executes, shows result A
summary(mtcars)   # Line 3 - executes, shows result B
```

User sees results A and B displayed inline.

### Re-execution (Complete Overlap)

User modifies and re-runs line 2:

```r
tail(mtcars)      # Line 2 - executes, shows result C
summary(mtcars)   # Line 3 - still shows result B
```

**What happens:**

- Result C replaces result A in the display
- Result A remains in history (not deleted)
- Result B is unaffected

### Re-execution (Partial Overlap)

User executes code that spans multiple existing results:

```r
# Previously executed:
# Line 2: head(mtcars) → result A
# Line 3: summary(mtcars) → result B
# Line 5: plot(...) → result C (lines 5-8)

# Now execute lines 3-6:
summary(iris)     # Line 3
plot(iris)        # Lines 5-6
```

**What happens:**

- Result A (line 2): Unaffected, still visible
- Result B (line 3): Hidden (overlaps with new execution)
- Result C (lines 5-8): Hidden (overlaps with new execution)
- New results D and E: Displayed for lines 3 and 5-6

## Overlap Detection Strategy

When new code is executed:

1. **Identify affected line groups** - which visible result groups overlap with the newly executed lines?

2. **For each affected group:**

   - If **completely contained** (all lines re-executed): hide entire group
   - If **partially overlapping** (some lines re-executed): hide only results on those specific lines
   - If **no overlap**: keep visible

3. **Display new results** - add them to the active set and group them

## Why This Approach?

### Benefits

- **Non-destructive**: All execution history preserved
- **Intuitive**: Most recent result is what you see
- **Performant**: No need to re-execute old code
- **Future-proof**: Enables undo, time-travel debugging, diff views

### Trade-offs

- Memory grows with execution count (mitigated by: results are just data, not heavy)
- Need to track both storage and visibility (manageable with clear separation of concerns)
