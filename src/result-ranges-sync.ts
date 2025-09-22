import { StateField, StateEffect, RangeSet, RangeValue, Text } from '@codemirror/state'
import { ViewPlugin, ViewUpdate } from '@codemirror/view'

export const setResultRanges = StateEffect.define<RangeSet<RangeValue>>({
  map: (value, mapping) => value.map(mapping)
})

export const resultRangesField = StateField.define<RangeSet<RangeValue>>({
  create: () => RangeSet.empty,

  update: (ranges, tr) => {
    // Apply any setResultRanges effects
    for (let effect of tr.effects) {
      if (effect.is(setResultRanges)) {
        return effect.value
      }
    }

    // Map existing ranges through document changes
    return ranges.map(tr.changes)
  }
})

export type ResultRangesChangeCallback = (ranges: RangeSet<RangeValue>) => void
export type DocumentChangeCallback = (doc: Text) => void

export function resultRangesSyncExtension(
  rangesCallback: ResultRangesChangeCallback,
  documentCallback?: DocumentChangeCallback
) {
  return [
    resultRangesField,
    ViewPlugin.fromClass(class {
      constructor(view: any) {
        // Initial callbacks
        setTimeout(() => {
          rangesCallback(view.state.field(resultRangesField))
          if (documentCallback) {
            documentCallback(view.state.doc)
          }
        }, 0)
      }

      update(update: ViewUpdate) {
        // Check if ranges changed due to document changes or effects
        const hadSetRangesEffect = update.transactions.some(tr =>
          tr.effects.some(effect => effect.is(setResultRanges))
        )

        if (hadSetRangesEffect || update.docChanged) {
          const currentRanges = update.state.field(resultRangesField)
          rangesCallback(currentRanges)
        }

        // Call document callback if document changed
        if (update.docChanged && documentCallback) {
          documentCallback(update.state.doc)
        }
      }
    })
  ]
}

export function getCurrentResultRanges(view: any): RangeSet<RangeValue> {
  return view.state.field(resultRangesField)
}