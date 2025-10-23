import {EditorView, Decoration, WidgetType, DecorationSet, ViewPlugin, ViewUpdate} from "@codemirror/view"
import {StateField, StateEffect, RangeSetBuilder, Facet} from "@codemirror/state"
import { lineGroupsField } from "./result-grouping-plugin"
import { LineGroup } from "./compute-line-groups"

// ============================================================================
// Spacer Widget (for height management)
// ============================================================================

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

// ============================================================================
// State Effects and State Fields (for height management)
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
// Types and Facet (for top measurement)
// ============================================================================

export interface LineGroupHeight {
  line: number;
  height: number;
}

export type LineGroupHeightChangeCallback = (heights: LineGroupHeight[]) => void

export type LineGroupTopChange = (tops: number[]) => void;

export const lineGroupTopChangeFacet = Facet.define<
  LineGroupTopChange | null,
  LineGroupTopChange | null
>({
  combine(values) {
    if (values.length === 0) {
      return null;
    }

    return values[values.length - 1];
  },
});

// ============================================================================
// Helper Functions (for height management)
// ============================================================================

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

  view.dispatch({
    effects: [
      setLineGroupTargetHeights.of(groupHeights),
      adjustSpacers.of(builder.finish())
    ]
  })
}

// ============================================================================
// Combined Line Group Layout Plugin
// ============================================================================

class LineGroupLayoutPlugin {
  // For height reapplication
  private frameId: number | null = null

  // For top measurement
  private lastTops: number[] | null = null
  private measurePending = false

  constructor(private readonly view: EditorView) {
    // Initialize top measurement if callback exists
    if (this.view.state.facet(lineGroupTopChangeFacet)) {
      this.scheduleMeasure();
    }
  }

  update(update: ViewUpdate) {
    // ========================================================================
    // Height reapplication logic
    // ========================================================================
    if (this.didReceiveTargetHeightEffect(update)) {
      // Don't reapply heights if we just received new target heights
    } else if (update.docChanged) {
      this.scheduleReapply()
    }

    // ========================================================================
    // Top measurement logic
    // ========================================================================
    const callback = update.state.facet(lineGroupTopChangeFacet);

    if (!callback) {
      this.lastTops = null;
      return;
    }

    const callbackChanged =
      callback !== update.startState.facet(lineGroupTopChangeFacet);
    const groupsChanged =
      update.startState.field(lineGroupsField) !==
      update.state.field(lineGroupsField);

    if (
      callbackChanged ||
      groupsChanged ||
      update.docChanged ||
      update.geometryChanged ||
      update.viewportChanged
    ) {
      this.scheduleMeasure();
    }
  }

  destroy() {
    // Clean up height reapplication
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }

    // Clean up top measurement
    this.measurePending = false;
    this.lastTops = null;
  }

  // ==========================================================================
  // Height reapplication methods
  // ==========================================================================

  private didReceiveTargetHeightEffect(update: ViewUpdate): boolean {
    return update.transactions.some(tr =>
      tr.effects.some(effect => effect.is(setLineGroupTargetHeights))
    )
  }

  private scheduleReapply() {
    if (this.frameId !== null) {
      return
    }

    this.frameId = requestAnimationFrame(() => {
      this.frameId = null
      const heights = this.view.state.field(lineGroupTargetHeightsField)
      if (!heights.length) {
        return
      }
      setLineGroupHeights(this.view, heights)
    })
  }

  // ==========================================================================
  // Top measurement methods
  // ==========================================================================

  private scheduleMeasure() {
    if (this.measurePending) {
      return;
    }

    if (!this.view.state.facet(lineGroupTopChangeFacet)) {
      return;
    }

    this.measurePending = true;
    this.view.requestMeasure({
      read: (innerView) => this.read(innerView),
      write: (tops) => this.write(tops),
    });
  }

  private read(view: EditorView): number[] | null {
    if (!view.state.facet(lineGroupTopChangeFacet)) {
      return null;
    }

    const groups = view.state.field(lineGroupsField);
    if (!groups.length) {
      return [];
    }

    return groups.map((group) => {
      const line = view.state.doc.line(group.lineStart);
      const block = view.lineBlockAt(line.from);
      return Math.max(0, block.top);
    });
  }

  private write(tops: number[] | null) {
    this.measurePending = false;

    const callback = this.view.state.facet(lineGroupTopChangeFacet);
    if (!callback || !tops) {
      return;
    }

    if (!this.didTopsChange(tops)) {
      return;
    }

    this.lastTops = tops;
    callback(tops);
  }

  private didTopsChange(next: number[]): boolean {
    const previous = this.lastTops;

    if (!previous) {
      return true;
    }

    if (previous.length !== next.length) {
      return true;
    }

    for (let index = 0; index < next.length; index++) {
      const prev = previous[index];
      const curr = next[index];
      if (prev === undefined || Math.abs(prev - curr) > 0.5) {
        return true;
      }
    }

    return false;
  }
}

// ============================================================================
// Combined Extension Export
// ============================================================================

export const lineGroupLayoutExtension = [
  spacersField,
  lineGroupTargetHeightsField,
  lineGroupTopChangeFacet.of(null),
  ViewPlugin.fromClass(LineGroupLayoutPlugin)
]
