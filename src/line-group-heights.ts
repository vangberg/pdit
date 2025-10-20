import {EditorView, Decoration, WidgetType, DecorationSet, ViewUpdate, ViewPlugin} from "@codemirror/view"
import {StateField, StateEffect, RangeSetBuilder} from "@codemirror/state"
import { lineGroupsField } from "./result-grouping-plugin"
import { LineGroup } from "./compute-line-groups"

class Spacer extends WidgetType {
  constructor(readonly height: number, readonly lineNumber: number) { super() }

  eq(other: Spacer) { return this.height == other.height && this.lineNumber == other.lineNumber }

  toDOM() {
    let elt = document.createElement("div")
    elt.style.height = this.height + "px"
    elt.className = "cm-preview-spacer"
    // Add zebra stripe class for even-numbered lines (matching zebra stripe logic)
    if ((this.lineNumber % 2) === 0) {
      elt.className += " zebra-stripe"
    }
    return elt
  }

  updateDOM(dom: HTMLElement) {
    dom.style.height = this.height + "px"
    // Ensure zebra stripe class is maintained on updates
    dom.className = "cm-preview-spacer"
    if ((this.lineNumber % 2) === 0) {
      dom.className += " zebra-stripe"
    }
    return true
  }

  get estimatedHeight() { return this.height }

  ignoreEvent() { return false }
}

export const adjustSpacers = StateEffect.define<DecorationSet>({
  map: (value, mapping) => value.map(mapping)
})

export const spacersField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (spacers, tr) => {
    for (let e of tr.effects) if (e.is(adjustSpacers)) return e.value
    return spacers.map(tr.changes)
  },
  provide: f => EditorView.decorations.from(f)
})

export interface LineGroupHeight {
  line: number;
  height: number;
}

export type LineGroupHeightChangeCallback = (heights: LineGroupHeight[]) => void

function findSpacerForLine(spacers: DecorationSet, lineInfo: any): Spacer | null {
  const spacerIter = spacers.iter()
  while (spacerIter.value) {
    if (spacerIter.to === lineInfo.to) {
      return spacerIter.value.spec.widget as Spacer
    }
    spacerIter.next()
  }
  return null
}

function computeNaturalGroupHeight(
  view: EditorView,
  spacers: DecorationSet,
  group: LineGroup
): number {
  const { doc } = view.state
  let total = 0

  for (let lineNumber = group.lineStart; lineNumber <= group.lineEnd; lineNumber++) {
    const lineInfo = doc.line(lineNumber)
    const lineBlock = view.lineBlockAt(lineInfo.from)
    const spacer = findSpacerForLine(spacers, lineInfo)
    const spacerHeight = spacer ? spacer.height : 0

    total += lineBlock.height - spacerHeight
  }

  return total
}

export function setLineGroupHeights(view: EditorView, groupHeights: number[]) {
  const builder = new RangeSetBuilder<Decoration>()
  const spacers = view.state.field(spacersField)
  const groups = view.state.field(lineGroupsField)

  for (let index = 0; index < groups.length; index++) {
    const targetHeight = groupHeights[index]
    if (!Number.isFinite(targetHeight)) {
      continue
    }

    const group = groups[index]
    const naturalHeight = computeNaturalGroupHeight(view, spacers, group)
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

  view.dispatch({effects: adjustSpacers.of(builder.finish())})
}

export function getLineGroupHeights(view: EditorView): LineGroupHeight[] {
  const doc = view.state.doc
  const spacers = view.state.field(spacersField)
  const result: LineGroupHeight[] = []

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const lineInfo = doc.line(lineNumber)
    const lineBlock = view.lineBlockAt(lineInfo.from)
    const spacer = findSpacerForLine(spacers, lineInfo)
    const spacerHeight = spacer ? spacer.height : 0
    const actualHeight = lineBlock.height - spacerHeight

    result.push({
      line: lineNumber,
      height: actualHeight
    })
  }

  return result
}

export function lineGroupHeightChangeListener(callback: LineGroupHeightChangeCallback) {
  return ViewPlugin.fromClass(class {
    constructor(view: EditorView) {
      // Initial call
      setTimeout(() => callback(getLineGroupHeights(view)), 0)
    }

    update(update: ViewUpdate) {
      // Skip if this update contains adjustSpacers effects to avoid loops
      const hasSpacerEffects = update.transactions.some(tr =>
        tr.effects.some(effect => effect.is(adjustSpacers))
      )

      if (!hasSpacerEffects && (update.docChanged || update.viewportChanged || update.geometryChanged)) {
        callback(getLineGroupHeights(update.view))
      }
    }
  })
}

// Include spacersField in your editor extensions
export const lineGroupHeightExtension = spacersField
