import {EditorView, Decoration, WidgetType, DecorationSet} from "@codemirror/view"
import {StateField, StateEffect, RangeSetBuilder, Facet} from "@codemirror/state"
import { lineGroupsField } from "./result-grouping-plugin"
import { executionHistoryField } from "./execution-gutter"
import { LineGroup } from "./compute-line-groups"

// ============================================================================
// Spacer Widget
// ============================================================================

class Spacer extends WidgetType {
  constructor(
    readonly height: number,
    readonly lineNumber: number,
    readonly groupIndex: number,
    readonly executionState: 'recent' | 'previous' | 'none'
  ) { super() }

  eq(other: Spacer) {
    return this.height == other.height &&
           this.lineNumber == other.lineNumber &&
           this.groupIndex == other.groupIndex &&
           this.executionState == other.executionState
  }

  toDOM() {
    let elt = document.createElement("div")
    elt.style.height = this.height + "px"
    const executionClass = this.executionState === 'recent' ? 'cm-execution-recent' :
                          this.executionState === 'previous' ? 'cm-execution-previous' : ''
    elt.className = `cm-preview-spacer cm-preview-spacer-${this.groupIndex % 6} ${executionClass}`.trim()
    return elt
  }

  updateDOM(dom: HTMLElement) {
    dom.style.height = this.height + "px"
    const executionClass = this.executionState === 'recent' ? 'cm-execution-recent' :
                          this.executionState === 'previous' ? 'cm-execution-previous' : ''
    dom.className = `cm-preview-spacer cm-preview-spacer-${this.groupIndex % 6} ${executionClass}`.trim()
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

// ============================================================================
// Types and Callback
// ============================================================================

export interface LineGroupHeight {
  line: number;
  height: number;
}

export type LineGroupTopChange = (tops: Map<string, number>) => void;

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
    const widgetA = iA.value.spec.widget as Spacer
    const widgetB = iB.value!.spec.widget as Spacer
    if (iA.from != iB.from ||
        Math.abs(widgetA.height - widgetB.height) > 1 ||
        widgetA.executionState !== widgetB.executionState)
      return false
    iA.next(); iB.next()
  }
  return true
}

function getExecutionState(group: LineGroup, executionHistory: any): 'recent' | 'previous' | 'none' {
  // Check if this group is in lastExecuted (recent)
  const isRecent = executionHistory.lastExecuted.some((g: LineGroup) =>
    g.lineStart === group.lineStart && g.lineEnd === group.lineEnd
  )
  if (isRecent) return 'recent'

  // Check if this group is in everExecuted (previous)
  const isPrevious = executionHistory.everExecuted.some((g: LineGroup) =>
    g.lineStart === group.lineStart && g.lineEnd === group.lineEnd
  )
  if (isPrevious) return 'previous'

  return 'none'
}

function updateSpacers(view: EditorView) {
  const groups = view.state.field(lineGroupsField)
  const targetHeights = view.state.field(lineGroupTargetHeightsField)
  const currentSpacers = view.state.field(spacersField)
  const executionHistory = view.state.field(executionHistoryField, false)

  if (targetHeights.size === 0 || groups.length === 0) return

  const doc = view.state.doc
  const builder = new RangeSetBuilder<Decoration>()
  const existingSpacers = new Map<number, number>()

  for (let iter = currentSpacers.iter(); iter.value; iter.next()) {
    const widget = iter.value.spec.widget
    if (widget instanceof Spacer) {
      existingSpacers.set(iter.from, widget.height)
    }
  }

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]
    const targetHeight = targetHeights.get(group.id)

    // Skip if no target height set for this group
    if (targetHeight === undefined || !Number.isFinite(targetHeight)) continue

    // Measure natural height from DOM
    let naturalHeight = 0
    for (let lineNum = group.lineStart; lineNum <= group.lineEnd; lineNum++) {
      const line = doc.line(lineNum)
      const block = view.lineBlockAt(line.from)
      naturalHeight += block.height
    }

    // Subtract existing spacer in this group
    const endLine = doc.line(group.lineEnd)
    const spacerPosition = endLine.to
    const previousSpacerHeight = existingSpacers.get(spacerPosition)
    if (previousSpacerHeight !== undefined) {
      naturalHeight -= previousSpacerHeight
    }

    const diff = targetHeight - naturalHeight
    if (diff > 0.01) {
      const executionState = executionHistory ? getExecutionState(group, executionHistory) : 'none'
      builder.add(endLine.to, endLine.to, Decoration.widget({
        widget: new Spacer(diff, group.lineEnd, groupIndex, executionState),
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
  const doc = view.state.doc
  if (!groups.length) {
    callback(new Map())
    return
  }

  // Get the cm-content padding to account for offset
  const contentEl = view.contentDOM
  const contentPadding = contentEl ? parseInt(getComputedStyle(contentEl).paddingTop) || 0 : 0

  const tops = new Map<string, number>()
  for (const group of groups) {
    const line = doc.line(group.lineStart)
    const block = view.lineBlockAt(line.from)
    tops.set(group.id, Math.max(0, block.top + contentPadding))
  }

  callback(tops)
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
  lineGroupTopChangeFacet.of(null),
  // Like merge: updateListener that measures and dispatches synchronously
  EditorView.updateListener.of(update => {
    const hasSpacerEffect = update.transactions.some(tr =>
      tr.effects.some(e => e.is(adjustSpacers))
    )

    // Check if target heights changed
    const targetHeightsChanged = update.startState.field(lineGroupTargetHeightsField) !==
                                 update.state.field(lineGroupTargetHeightsField)
    const lineGroupsChanged = update.startState.field(lineGroupsField) !==
                              update.state.field(lineGroupsField)

    // Check if execution history changed
    const executionHistoryChanged = update.startState.field(executionHistoryField, false) !==
                                    update.state.field(executionHistoryField, false)

    // Phase 1: Update spacers when heights, groups, or execution history change (but not if we just applied spacers)
    if (!hasSpacerEffect && (update.heightChanged || update.geometryChanged || update.docChanged || targetHeightsChanged || lineGroupsChanged || executionHistoryChanged)) {
      updateSpacers(update.view)
      measureAndReportTops(update.view)
    }
  })
]
