# Editor-Preview Height Sync Plan

## Overview
Implement height synchronization between CodeMirror editor lines and preview lines. When any height changes occur, compare each line's natural height and set the shorter one to match the taller one using spacers.

## Implementation Steps

### 1. Add Editor Height Change Listener
- Import `getLineHeights` and `lineHeightChangeListener` from `line-heights.ts`
- Add height change listener to Editor component in App.tsx
- Store editor heights in state for comparison

### 2. Create Height Sync Logic (Simple Approach)
- Function `syncHeights()` that compares natural content heights from callbacks
- **Key insight**: Callbacks already report natural heights, so just set both to max
- For each line: `targetHeight = Math.max(editorNaturalHeight, previewNaturalHeight)`
- Set both editor and preview to targetHeight (one will be no-op, one adds spacer)
- Handle edge cases (missing lines, empty lines)

### 3. Handle Both Directions of Change
- Editor height changes → sync preview to match
- Preview height changes → sync editor to match  
- Initial render → sync both directions

### 4. Prevent Infinite Loops
- Track when we're programmatically setting heights
- Skip sync callbacks during height adjustments
- Use flags similar to existing `isSettingHeights` pattern

## Implementation Details

```typescript
const syncHeights = (editorNaturalHeights: LineHeight[], previewNaturalHeights: PreviewHeight[]) => {
  const maxLines = Math.max(editorNaturalHeights.length, previewNaturalHeights.length);
  const editorTargets: LineHeight[] = [];
  const previewTargets: PreviewHeight[] = [];
  
  for (let line = 1; line <= maxLines; line++) {
    const editorHeight = editorNaturalHeights[line-1]?.height || 0;
    const previewHeight = previewNaturalHeights[line-1]?.height || 0;
    const targetHeight = Math.max(editorHeight, previewHeight);
    
    // Set both to target height (one will be no-op, one will add spacer)
    editorTargets.push({ line, height: targetHeight });
    previewTargets.push({ line, height: targetHeight });
  }
  
  // Apply all targets with loop prevention
  setEditorHeights(editorTargets);
  setPreviewHeights(previewTargets);
}
```

## Files to Modify
- `src/App.tsx` - Main sync logic and state management
- Import existing functions from `src/line-heights.ts` and `src/Preview.tsx`

## Expected Behavior
- Lines will always have matching heights between editor and preview
- Taller content on either side will force the other side to match
- Light blue spacers will be visible showing where heights were adjusted
- System works bidirectionally and handles dynamic changes

## Technical Notes
- Use `requestAnimationFrame` for proper timing
- Implement debouncing if needed for performance
- Handle edge cases like empty lines and dynamic content changes
- Maintain existing APIs and patterns from both systems