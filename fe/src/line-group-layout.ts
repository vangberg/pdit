import { EditorView, Decoration, WidgetType, DecorationSet } from "@codemirror/view"
import { StateField, StateEffect, RangeSetBuilder, Facet, Text } from "@codemirror/state"
import { lineGroupsField, lastExecutedIdsField, staleGroupIdsField } from "./result-grouping-plugin"
import { LineGroup } from "./compute-line-groups"
import { getLineGroupSpacerClass, getLineGroupVisualFlags } from "./line-group-appearance"

// ============================================================================
// Types
// ============================================================================

export interface LineGroupLayout {
  top: number;
  naturalHeight: number;
}

export type LineGroupLayoutChange = (layouts: Map<string, LineGroupLayout>) => void;

// ============================================================================
// Spacer Widget
// ============================================================================

class Spacer extends WidgetType {
  constructor(
    readonly height: number,
    readonly lineNumber: number,
    readonly className: string
  ) { super() }

  eq(other: Spacer) {
    return this.height == other.height &&
           this.lineNumber == other.lineNumber &&
           this.className == other.className
  }

  toDOM() {
    let elt = document.createElement("div")
    elt.style.height = this.height + "px"
    elt.className = this.className
    return elt
  }

  updateDOM(dom: HTMLElement) {
    dom.style.height = this.height + "px"
    dom.className = this.className
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

export const setLineGroupTargetHeights = StateEffect.define<Map<string, number>>()

export const lineGroupTargetHeightsField = StateField.define<Map<string, number>>({
  create: () => new Map(),
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

export const lineGroupLayoutChangeFacet = Facet.define<
  LineGroupLayoutChange | null,
  LineGroupLayoutChange | null
>({
  combine(values) {
    return values.length > 0 ? values[values.length - 1] : null;
  },
});

// ============================================================================
// Measurement
// ============================================================================

function measureGroupLayouts(
  view: EditorView,
  groups: LineGroup[],
  existingSpacers: Map<number, number>
): Map<string, LineGroupLayout> {
  const doc = view.state.doc
  const contentPadding = parseInt(getComputedStyle(view.contentDOM).paddingTop) || 0
  const layouts = new Map<string, LineGroupLayout>()

  for (const group of groups) {
    const startLine = doc.line(group.lineStart)
    const startBlock = view.lineBlockAt(startLine.from)
    const top = Math.max(0, startBlock.top + contentPadding)

    let naturalHeight = 0
    for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
      const line = doc.line(lineNum)
      const block = view.lineBlockAt(line.from)
      naturalHeight += block.height
    }

    // Subtract existing spacer height to get true natural height
    const endLine = doc.line(group.lineEnd)
    const previousSpacerHeight = existingSpacers.get(endLine.to)
    if (previousSpacerHeight !== undefined) {
      naturalHeight -= previousSpacerHeight
    }

    layouts.set(group.id, { top, naturalHeight })
  }

  return layouts
}

// ============================================================================
// Spacer Computation
// ============================================================================

function computeSpacers(
  groups: LineGroup[],
  layouts: Map<string, LineGroupLayout>,
  targetHeights: Map<string, number>,
  lastExecutedIds: Set<number>,
  staleGroupIds: Set<string>,
  doc: Text
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()

  for (const group of groups) {
    const layout = layouts.get(group.id)
    const targetHeight = targetHeights.get(group.id)

    if (layout && targetHeight !== undefined && Number.isFinite(targetHeight)) {
      const diff = targetHeight - layout.naturalHeight
      if (diff > 0.01) {
        const endLine = doc.line(group.lineEnd)
        const flags = getLineGroupVisualFlags(group, lastExecutedIds, staleGroupIds)
        builder.add(endLine.to, endLine.to, Decoration.widget({
          widget: new Spacer(
            diff,
            group.lineEnd,
            getLineGroupSpacerClass(group, flags)
          ),
          block: true,
          side: 1
        }))
      }
    }
  }

  return builder.finish()
}

function compareSpacers(a: DecorationSet, b: DecorationSet): boolean {
  if (a.size != b.size) return false
  let iA = a.iter(), iB = b.iter()
  while (iA.value) {
    const spacerA = iA.value.spec.widget as Spacer
    const spacerB = iB.value!.spec.widget as Spacer
    if (iA.from != iB.from ||
        Math.abs(spacerA.height - spacerB.height) > 1 ||
        spacerA.className !== spacerB.className)
      return false
    iA.next(); iB.next()
  }
  return true
}

function getExistingSpacerHeights(spacers: DecorationSet): Map<number, number> {
  const result = new Map<number, number>()
  for (let iter = spacers.iter(); iter.value; iter.next()) {
    const widget = iter.value.spec.widget
    if (widget instanceof Spacer) {
      result.set(iter.from, widget.height)
    }
  }
  return result
}

// ============================================================================
// Update Orchestration
// ============================================================================

function updateSpacersAndReportLayout(view: EditorView) {
  const groups = view.state.field(lineGroupsField)
  const currentSpacers = view.state.field(spacersField)
  const layoutCallback = view.state.facet(lineGroupLayoutChangeFacet)

  // Handle empty state
  if (groups.length === 0) {
    if (currentSpacers.size > 0) {
      view.dispatch({ effects: [adjustSpacers.of(Decoration.none)] })
    }
    layoutCallback?.(new Map())
    return
  }

  // 1. Measure layouts
  const existingSpacers = getExistingSpacerHeights(currentSpacers)
  const layouts = measureGroupLayouts(view, groups, existingSpacers)

  // 2. Compute new spacers
  const targetHeights = view.state.field(lineGroupTargetHeightsField)
  const lastExecutedIds = view.state.field(lastExecutedIdsField)
  const staleGroupIds = view.state.field(staleGroupIdsField)
  const newSpacers = computeSpacers(
    groups,
    layouts,
    targetHeights,
    lastExecutedIds,
    staleGroupIds,
    view.state.doc
  )

  // 3. Dispatch if changed
  if (!compareSpacers(newSpacers, currentSpacers)) {
    view.dispatch({ effects: [adjustSpacers.of(newSpacers)] })
  }

  // 4. Report layouts
  layoutCallback?.(layouts)
}

// ============================================================================
// Public API
// ============================================================================

export function setLineGroupHeights(view: EditorView, heights: Map<string, number>) {
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
  lineGroupLayoutChangeFacet.of(null),
  EditorView.updateListener.of(update => {
    const hasSpacerEffect = update.transactions.some(tr =>
      tr.effects.some(e => e.is(adjustSpacers))
    )

    const targetHeightsChanged = update.startState.field(lineGroupTargetHeightsField) !==
                                 update.state.field(lineGroupTargetHeightsField)
    const lineGroupsChanged = update.startState.field(lineGroupsField) !==
                              update.state.field(lineGroupsField)

    if (!hasSpacerEffect && (update.heightChanged || update.geometryChanged || update.docChanged || targetHeightsChanged || lineGroupsChanged)) {
      updateSpacersAndReportLayout(update.view)
    }
  })
]
