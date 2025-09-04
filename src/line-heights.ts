import {EditorView, Decoration, WidgetType, DecorationSet, ViewUpdate, ViewPlugin} from "@codemirror/view"
import {StateField, StateEffect, RangeSetBuilder} from "@codemirror/state"

class Spacer extends WidgetType {
  constructor(readonly height: number) { super() }

  eq(other: Spacer) { return this.height == other.height }

  toDOM() {
    let elt = document.createElement("div")
    elt.style.height = this.height + "px"
    elt.className = "cm-preview-spacer"
    return elt
  }

  updateDOM(dom: HTMLElement) {
    dom.style.height = this.height + "px"
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

export interface LineHeight {
  line: number;
  height: number;
}

export type LineHeightChangeCallback = (heights: LineHeight[]) => void

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

export function setLineHeights(view: EditorView, lineHeights: LineHeight[]) {
  const builder = new RangeSetBuilder<Decoration>()
  const spacers = view.state.field(spacersField)

  for (const {line, height} of lineHeights) {
    const lineInfo = view.state.doc.line(line)
    const spacer = findSpacerForLine(spacers, lineInfo)

    const currentHeight = view.lineBlockAt(lineInfo.from).height
    const spacerHeight = spacer ? spacer.height : 0
    const diff = height - currentHeight + spacerHeight

    if (diff > 0.01) {
      builder.add(lineInfo.to, lineInfo.to, Decoration.widget({
        widget: new Spacer(diff),
        block: true,
        side: 1
      }))
    }
  }
  
  view.dispatch({effects: adjustSpacers.of(builder.finish())})
}

export function getLineHeights(view: EditorView): LineHeight[] {
  const doc = view.state.doc
  const spacers = view.state.field(spacersField)
  const result: LineHeight[] = []
  
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

export function lineHeightChangeListener(callback: LineHeightChangeCallback) {
  return ViewPlugin.fromClass(class {
    constructor(view: EditorView) {
      // Initial call
      setTimeout(() => callback(getLineHeights(view)), 0)
    }
    
    update(update: ViewUpdate) {
      // Skip if this update contains adjustSpacers effects to avoid loops
      const hasSpacerEffects = update.transactions.some(tr => 
        tr.effects.some(effect => effect.is(adjustSpacers))
      )
      
      if (!hasSpacerEffects && (update.docChanged || update.viewportChanged || update.geometryChanged)) {
        callback(getLineHeights(update.view))
      }
    }
  })
}

// Include spacersField in your editor extensions
export const lineHeightExtension = spacersField