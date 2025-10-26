import {EditorView, Decoration, WidgetType, DecorationSet} from "@codemirror/view"
import {StateField, StateEffect, RangeSetBuilder, Facet} from "@codemirror/state"
import { lineGroupsField } from "./result-grouping-plugin"

// ============================================================================
// Spacer Widget
// ============================================================================

class Spacer extends WidgetType {
  constructor(readonly height: number, readonly lineNumber: number) { super() }

  eq(other: Spacer) { return this.height == other.height && this.lineNumber == other.lineNumber }

  toDOM() {
    let elt = document.createElement("div")
    elt.style.height = this.height + "px"
    elt.className = "cm-preview-spacer"
    if ((this.lineNumber % 2) === 0) {
      elt.className += " zebra-stripe"
    }
    return elt
  }

  updateDOM(dom: HTMLElement) {
    dom.style.height = this.height + "px"
    dom.className = "cm-preview-spacer"
    if ((this.lineNumber % 2) === 0) {
      dom.className += " zebra-stripe"
    }
    return true
  }

  get estimatedHeight() { return this.height }

  ignoreEvent() { return false }
}

// ============================================================================
// State
// ============================================================================

export const adjustSpacers = StateEffect.define<DecorationSet>({
  map: (value, mapping) => value.map(mapping)
})

export const setLineGroupTargetHeights = StateEffect.define<number[]>()

export const lineGroupTargetHeightsField = StateField.define<number[]>({
  create: () => [],
  update: (targetHeights, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setLineGroupTargetHeights)) {
        return effect.value
      }
    }
    return targetHeights
  }
})

export const spacersField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (spacers, tr) => {
    for (let e of tr.effects) if (e.is(adjustSpacers)) return e.value
    return spacers.map(tr.changes)
  },
  provide: f => EditorView.decorations.from(f)
})

// ============================================================================
// Types and Callback
// ============================================================================

export interface LineGroupHeight {
  line: number;
  height: number;
}

export type LineGroupTopChange = (tops: number[]) => void;

export const lineGroupTopChangeFacet = Facet.define<
  LineGroupTopChange | null,
  LineGroupTopChange | null
>({
  combine(values) {
    return values.length > 0 ? values[values.length - 1] : null;
  },
});

// ============================================================================
// Core Logic (like merge's updateSpacers)
// ============================================================================

function compareSpacers(a: DecorationSet, b: DecorationSet): boolean {
  if (a.size != b.size) return false
  let iA = a.iter(), iB = b.iter()
  while (iA.value) {
    if (iA.from != iB.from ||
        Math.abs((iA.value.spec.widget as Spacer).height - (iB.value!.spec.widget as Spacer).height) > 1)
      return false
    iA.next(); iB.next()
  }
  return true
}

function updateSpacers(view: EditorView) {
  const groups = view.state.field(lineGroupsField)
  const targetHeights = view.state.field(lineGroupTargetHeightsField)
  const currentSpacers = view.state.field(spacersField)

  if (!targetHeights.length || !groups.length) return

  const builder = new RangeSetBuilder<Decoration>()
  const spacersIter = currentSpacers.iter()

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    const targetHeight = targetHeights[i]

    if (!Number.isFinite(targetHeight)) continue

    // Measure natural height from DOM
    let naturalHeight = 0
    for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
      const line = view.state.doc.line(lineNum)
      const block = view.lineBlockAt(line.from)
      naturalHeight += block.height
    }

    // Subtract existing spacer in this group
    while (spacersIter.value && spacersIter.from <= view.state.doc.line(group.lineEnd).to) {
      if (spacersIter.from === view.state.doc.line(group.lineEnd).to) {
        naturalHeight -= (spacersIter.value.spec.widget as Spacer).height
      }
      spacersIter.next()
    }

    const diff = targetHeight - naturalHeight
    if (diff > 0.01) {
      const endLine = view.state.doc.line(group.lineEnd)
      builder.add(endLine.to, endLine.to, Decoration.widget({
        widget: new Spacer(diff, group.lineEnd),
        block: true,
        side: 1
      }))
    }
  }

  const newSpacers = builder.finish()
  if (!compareSpacers(newSpacers, currentSpacers)) {
    view.dispatch({ effects: [adjustSpacers.of(newSpacers)] })
  }
}

function measureAndReportTops(view: EditorView) {
  const callback = view.state.facet(lineGroupTopChangeFacet)
  if (!callback) return

  const groups = view.state.field(lineGroupsField)
  if (!groups.length) {
    callback([])
    return
  }

  const tops = groups.map(group => {
    const line = view.state.doc.line(group.lineStart)
    const block = view.lineBlockAt(line.from)
    return Math.max(0, block.top)
  })

  callback(tops)
}

// ============================================================================
// Public API
// ============================================================================

export function setLineGroupHeights(view: EditorView, heights: number[]) {
  view.dispatch({
    effects: [setLineGroupTargetHeights.of(heights)]
  })
}

// ============================================================================
// Extension
// ============================================================================

export const lineGroupLayoutExtension = [
  spacersField,
  lineGroupTargetHeightsField,
  lineGroupTopChangeFacet.of(null),
  // Like merge: updateListener that measures and dispatches synchronously
  EditorView.updateListener.of(update => {
    const hasSpacerEffect = update.transactions.some(tr =>
      tr.effects.some(e => e.is(adjustSpacers))
    )

    // Check if target heights changed
    const targetHeightsChanged = update.startState.field(lineGroupTargetHeightsField) !==
                                 update.state.field(lineGroupTargetHeightsField)

    // Phase 1: Update spacers when heights change (but not if we just applied spacers)
    if (!hasSpacerEffect && (update.heightChanged || update.geometryChanged || update.docChanged || targetHeightsChanged)) {
      console.log("Updating spacers due to layout change")
      updateSpacers(update.view)
      measureAndReportTops(update.view)
    }
  })
]
