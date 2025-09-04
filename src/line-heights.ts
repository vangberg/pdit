import {EditorView, Decoration, WidgetType, DecorationSet} from "@codemirror/view"
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

export function setLineHeights(view: EditorView, lineHeights: LineHeight[]) {
  const builder = new RangeSetBuilder<Decoration>()

  for (const {line, height} of lineHeights) {
    const lineInfo = view.state.doc.line(line)

    const spacers = view.state.field(spacersField).iter()
    let spacer
    while (spacers.value) {
      if (spacers.to == lineInfo.to) {
        spacer = spacers.value.spec.widget as Spacer
        break;
      }
      spacers.next();
    }

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

// Include spacersField in your editor extensions
export const lineHeightExtension = spacersField