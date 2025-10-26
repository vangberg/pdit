# Line Group Height Synchronization: Architecture Analysis

## Problem Statement

We need to synchronize the height of editor line groups with their corresponding output panels. When a line group's content changes (e.g., user inserts a line break), we must immediately adjust spacing to prevent visual flicker.

## Current Implementation Issues

### The Flicker Problem (Correctly Diagnosed)

When a user types a line break in a line group:

1. **Transaction executes**: Document changes, line count increases
2. **Browser renders**: Natural height increases (~21px), but spacer is still at old height (e.g., 100px)
3. **Total height is too large**: natural_height + old_spacer > target_height
4. **Content below shifts DOWN** ← **First flicker**
5. **Async update fires** (via setTimeout): Recalculates spacer (e.g., 80px)
6. **Content below shifts UP** to correct position ← **Second flicker**

### Current Architecture Problems

1. **Async Spacer Updates**: Using `setTimeout(..., 0)` creates 2-4ms delay between document change and spacer adjustment
2. **Transaction Extender with Assumptions**: Current extender estimates line heights (21px hardcoded) and tries to calculate deltas, which is:
   - Fragile: Line heights vary by font, zoom, line wrapping
   - Wrong for wrapped lines
   - Wrong for different font sizes
   - Introduces drift over multiple edits

3. **Two-Phase Complexity**: Separate "update spacers" and "measure tops" phases with complex state management

4. **Multiple Measure Cycles**: Triggers measure → dispatch → measure → dispatch chain

## CodeMirror Constraints

### Key Insight from Docs

> "Two provision methods exist: directly (often derived from fields) or indirectly (functions from views to range sets). **Only direct decoration sets influence vertical block structure**; only indirect ones read viewports."

**Spacers MUST be provided directly via StateField** because they affect vertical structure.

### Transaction Timing

- Transactions cannot dispatch new transactions synchronously
- Transaction extenders run BEFORE state is finalized
- DOM measurements require the view to be updated
- `requestMeasure` runs in next animation frame (after paint)

### The Core Constraint

**You cannot have accurate spacer heights before DOM measurement, and you cannot measure DOM synchronously during a transaction.**

This is a fundamental timing problem that cannot be fully solved with the current approach.

## Alternative Approaches

### Option 1: Accept Slight Estimation Error (Current Transaction Extender)

**Approach**: Use transaction extender with estimated line height
- ✅ No setTimeout delay
- ✅ Atomic with user edits
- ❌ Inaccurate for variable line heights
- ❌ Accumulates error over time
- ❌ Wrong for wrapped lines

**When this works**: Simple monospace editors with fixed line heights

**When this fails**: Variable fonts, wrapped lines, zoom changes

### Option 2: Pre-measure Line Heights

**Approach**: Maintain a cache of measured line heights, use in transaction extender

```typescript
// ViewPlugin maintains height cache
class HeightCache {
  lineHeight: number = 21 // Measured from DOM

  update(view: EditorView) {
    // Periodically measure actual line height
    const line = view.lineBlockAt(0)
    this.lineHeight = line.height
  }
}

// Transaction extender uses cached height
const extender = EditorState.transactionExtender.of((tr) => {
  const lineHeight = getCachedLineHeight() // From view plugin
  // Use measured height instead of estimate
})
```

- ✅ More accurate than hardcoded 21px
- ✅ Still atomic
- ❌ Doesn't handle wrapped lines
- ❌ Requires global state sharing between plugin and extender
- ⚠️ Line height can change mid-transaction (zoom, font change)

### Option 3: Dual-Phase with Optimization (Recommended)

**Approach**: Transaction extender for immediate estimate + async correction

```typescript
// Phase 1: Transaction extender (synchronous)
// - Use best estimate to prevent large flicker
// - Spacer = oldSpacer - (linesDelta × estimatedHeight)

// Phase 2: Async requestMeasure (happens next frame)
// - Measure actual heights
// - Dispatch correction if estimate was wrong
// - Only dispatch if error > threshold (e.g., 2px)
```

**Flow**:
1. User types → transaction with spacer estimate (good enough)
2. Browser paints with estimate (minimal/no flicker)
3. Next frame: measure actual, correct if needed (small adjustment)

- ✅ Prevents large flicker (estimate is close)
- ✅ Converges to accuracy (async correction)
- ✅ Handles all cases (wrapped lines, font changes)
- ✅ Minimizes corrections (only when estimate is off)
- ⚠️ Slight adjustment may still be visible for wrapped lines

### Option 4: CSS-Based Height Management

**Approach**: Use CSS instead of widgets for spacing

```css
.cm-line[data-group-end="true"] {
  padding-bottom: var(--spacer-height);
}
```

Set CSS variables via DOM attributes/inline styles.

- ✅ No widget overhead
- ✅ Can update synchronously
- ❌ Mixing state and DOM (anti-pattern in CodeMirror)
- ❌ Harder to get zebra stripes right
- ❌ Still need measurement for correction

### Option 5: Block Widgets with estimatedHeight

**Approach**: Better leverage `estimatedHeight` property

CodeMirror uses `estimatedHeight` for layout before DOM is rendered. If we could make this estimate very accurate...

```typescript
class Spacer extends WidgetType {
  constructor(readonly height: number) { super() }

  get estimatedHeight() { return this.height }

  // When we create spacer, height should be pre-calculated
  // based on cached measurements
}
```

- ✅ CodeMirror's built-in mechanism
- ❌ Still requires accurate height before transaction completes
- ⚠️ Same problem: need measurement before we can estimate

## Recommended Solution: Dual-Phase with Smart Caching

### Architecture

1. **Height Cache** (ViewPlugin)
   - Measures and caches line height when idle
   - Detects font/zoom changes
   - Provides best estimate for extender

2. **Transaction Extender** (Synchronous)
   - Uses cached line height for estimate
   - Adjusts spacers atomically with edits
   - Prevents large flicker

3. **Async Corrector** (requestMeasure)
   - Measures actual heights after paint
   - Dispatches correction only if error > 2px
   - Updates height cache

4. **Simplified State**
   - Single StateField for spacers
   - Single StateField for target heights
   - No complex phase tracking

### Implementation Simplifications

```typescript
// 1. Height cache in view plugin
class LayoutPlugin {
  cachedLineHeight = 21 // Updated from measurements

  update(update: ViewUpdate) {
    if (update.geometryChanged || shouldRemeasure) {
      this.measureLineHeight()
    }

    if (spacersWereApplied && needsCorrection) {
      this.scheduleCorrection()
    }
  }

  private measureLineHeight() {
    // Measure first visible line
    const line = this.view.lineBlockAt(this.view.viewport.from)
    this.cachedLineHeight = line.height
  }
}

// 2. Transaction extender uses cache
const extender = EditorState.transactionExtender.of((tr) => {
  if (!tr.docChanged) return null

  const cachedHeight = getGlobalHeightCache() // From plugin
  const oldSpacers = tr.startState.field(spacersField)
  const newGroups = tr.state.field(lineGroupsField)

  // Calculate new spacers using cached height
  const newSpacers = calculateSpacers(newGroups, oldSpacers, cachedHeight)

  return { effects: [adjustSpacers.of(newSpacers)] }
})

// 3. Async corrector only fires if needed
private scheduleCorrection() {
  this.view.requestMeasure({
    read: (view) => {
      const actualHeights = measureActualGroupHeights(view)
      const currentSpacers = view.state.field(spacersField)
      const error = calculateError(actualHeights, currentSpacers)

      return error > 2 ? calculateCorrectSpacers(actualHeights) : null
    },
    write: (correction) => {
      if (correction) {
        this.view.dispatch({ effects: [adjustSpacers.of(correction)] })
      }
    }
  })
}
```

### Why This Works

1. **Transaction extender**: Prevents 99% of flicker using best available estimate
2. **Cached measurements**: Much more accurate than hardcoded 21px
3. **Async correction**: Handles edge cases (wrapped lines, font changes) without visible flicker
4. **Error threshold**: Avoids unnecessary corrections for sub-pixel differences
5. **Simple state**: No complex phase tracking, just estimate → measure → correct flow

## Comparison

| Approach | Flicker | Accuracy | Complexity | Robustness |
|----------|---------|----------|------------|------------|
| Current (setTimeout) | ❌ Large | ✅ Perfect | 🟡 Medium | ✅ Good |
| Extender only (hardcoded) | ✅ None | ❌ Poor | ✅ Low | ❌ Fragile |
| **Dual-phase (cached)** | ✅ Minimal | ✅ Excellent | 🟡 Medium | ✅ Excellent |
| CSS-based | 🟡 Some | ✅ Good | ❌ High | 🟡 Fragile |

## Conclusion

The **Dual-Phase with Smart Caching** approach is recommended because:

1. ✅ **Solves the flicker problem**: Synchronous estimate prevents visible jumps
2. ✅ **Maintains accuracy**: Async correction ensures perfect alignment
3. ✅ **Handles edge cases**: Wrapped lines, font changes, zoom all work
4. ✅ **Follows CodeMirror patterns**: Uses transaction extender + requestMeasure correctly
5. ✅ **Simple and maintainable**: Clear estimate → measure → correct flow

The key insight: **Perfect accuracy before DOM measurement is impossible, but a good estimate + fast correction is imperceptible.**
