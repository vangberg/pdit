import { EditorView, Decoration, DecorationSet } from '@codemirror/view'
import { StateField, RangeSet, Extension, Compartment } from '@codemirror/state'

// Compartment for reconfigurable range highlighting
export const rangeHighlightCompartment = new Compartment()

// StateField to manage the decorations based on initial ranges
function createRangeHighlightField(initialRanges?: RangeSet<any> | null) {
  return StateField.define<DecorationSet>({
    create() {
      if (initialRanges) {
        const decorations: any[] = []
        initialRanges.between(0, Number.MAX_SAFE_INTEGER, (from, to) => {
          decorations.push(highlightMark.range(from, to))
        })
        return Decoration.set(decorations)
      }
      return Decoration.none
    },

    update(decorations, tr) {
      // Map existing decorations through document changes
      return decorations.map(tr.changes)
    },

    provide: f => EditorView.decorations.from(f)
  })
}

// The highlight decoration
const highlightMark = Decoration.mark({
  class: "range-highlight"
})

// CSS theme for the highlights
const highlightTheme = EditorView.theme({
  '.range-highlight': {
    backgroundColor: 'rgba(255, 255, 0, 0.3)',
    borderRadius: '2px'
  }
})

// Main plugin function
export function rangeHighlightPlugin(ranges?: RangeSet<any> | null): Extension {
  return [
    rangeHighlightCompartment.of([
      createRangeHighlightField(ranges)
    ]),
    highlightTheme
  ]
}

// Function to reconfigure ranges in an existing editor
export function reconfigureRanges(view: EditorView, ranges: RangeSet<any> | null) {
  view.dispatch({
    effects: rangeHighlightCompartment.reconfigure([
      createRangeHighlightField(ranges)
    ])
  })
}