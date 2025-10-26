# Solution: Synchronous Spacer Updates via ViewPlugin

## The Problem

Using `setTimeout(() => dispatch(), 0)` creates two JavaScript execution turns:
1. First turn: document change → browser paints (flicker)
2. Second turn: spacer adjustment → browser paints again

## The Solution (from CodeMirror Merge)

Dispatch spacers **synchronously** from the ViewPlugin's `update()` method. This keeps everything in one JavaScript turn, so the browser only paints once.

## Key Insight

ViewPlugin's `update()` method runs **after** the view is updated but **before** the browser paints. You CAN dispatch from here, and it will be processed synchronously.

## Implementation Pattern

```typescript
class LineGroupLayoutPlugin {
  update(update: ViewUpdate) {
    // Check if we need to update spacers
    const spacersUpdated = update.transactions.some(tr =>
      tr.effects.some(e => e.is(adjustSpacers))
    );

    if (spacersUpdated) {
      // Skip - we just applied spacers
      return;
    }

    if (update.heightChanged || update.geometryChanged) {
      // Measure and dispatch SYNCHRONOUSLY
      this.updateSpacers();
    }
  }

  private updateSpacers() {
    // Measure actual heights
    const spacers = this.calculateSpacers(this.view);

    // Dispatch IMMEDIATELY (not via setTimeout)
    this.view.dispatch({
      effects: [adjustSpacers.of(spacers)]
    });
  }
}
```

## Flow

1. User types → transaction
2. View updates
3. `update()` fires → `heightChanged` is true
4. `updateSpacers()` called synchronously
5. Spacers dispatched synchronously
6. View processes spacer update
7. JavaScript execution completes
8. Browser paints ONCE ✅

## Why This Works

- No setTimeout = no separate execution turn
- Browser only paints when JavaScript stack is empty
- Both transactions complete before paint
- No flicker!
