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
        let rangeIndex = 0
        initialRanges.between(0, Number.MAX_SAFE_INTEGER, (from, to) => {
          const colorIndex = rangeIndex % highlightMarks.length
          decorations.push(highlightMarks[colorIndex].range(from, to))
          rangeIndex++
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

// The highlight decorations with different colors
const highlightMarks = [
  Decoration.mark({ class: "range-highlight-0" }),
  Decoration.mark({ class: "range-highlight-1" }),
  Decoration.mark({ class: "range-highlight-2" }),
  Decoration.mark({ class: "range-highlight-3" }),
  Decoration.mark({ class: "range-highlight-4" }),
  Decoration.mark({ class: "range-highlight-5" })
]

// CSS theme for the highlights
const highlightTheme = EditorView.theme({
  '.range-highlight-0': {
    borderBottom: '2px dotted #FFD700'
  },
  '.range-highlight-1': {
    borderBottom: '2px dotted #007BFF'
  },
  '.range-highlight-2': {
    borderBottom: '2px dotted #28A745'
  },
  '.range-highlight-3': {
    borderBottom: '2px dotted #DC3545'
  },
  '.range-highlight-4': {
    borderBottom: '2px dotted #FF6500'
  },
  '.range-highlight-5': {
    borderBottom: '2px dotted #6C757D'
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