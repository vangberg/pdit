import { useState, useCallback, useRef } from "react";
import { Expression, ExecutionEvent } from "./execution";
import { computeLineGroups, LineGroup } from "./compute-line-groups";

/** Key for looking up expressions by line range */
function lineRangeKey(lineStart: number, lineEnd: number): string {
  return `${lineStart}-${lineEnd}`;
}

/**
 * Adds new expressions to the expression store (non-destructive).
 */
export function addExpressionsToStore(
  expressionStore: Map<number, Expression>,
  newExpressions: Expression[]
): Map<number, Expression> {
  const newStore = new Map(expressionStore);
  for (const expr of newExpressions) {
    newStore.set(expr.id, expr);
  }
  return newStore;
}

/**
 * Processes execution expressions: adds to store and computes line groups.
 * For partial execution, merges new groups with non-overlapping existing groups.
 */
export function processExecutionResults(
  expressionStore: Map<number, Expression>,
  newExpressions: Expression[],
  options?: {
    currentLineGroups?: LineGroup[];
    lineRange?: { from: number; to: number };
  }
): {
  newStore: Map<number, Expression>;
  groups: LineGroup[];
} {
  const newStore = addExpressionsToStore(expressionStore, newExpressions);

  // Compute new groups from executed expressions
  const newGroups = computeLineGroups(newExpressions);

  // Reuse existing line groups with matching line ranges
  if (options?.currentLineGroups) {
    for (const newGroup of newGroups) {
      const matchingGroup = options.currentLineGroups.find(
        (group) =>
          group.lineStart === newGroup.lineStart &&
          group.lineEnd === newGroup.lineEnd
      );
      if (matchingGroup) {
        // Reuse existing group ID
        newGroup.id = matchingGroup.id;
        // Copy existing resultIds to previousResultIds
        newGroup.previousResultIds = matchingGroup.resultIds;
      }
    }
  }

  // If this is a partial execution, merge with non-overlapping existing groups
  if (options?.lineRange && options?.currentLineGroups) {
    const { from, to } = options.lineRange;

    // Keep existing groups that don't overlap with executed range
    const nonOverlappingGroups = options.currentLineGroups.filter(
      (group) => group.lineEnd < from || group.lineStart > to
    );

    // Merge and sort by lineStart
    const mergedGroups = [...nonOverlappingGroups, ...newGroups].sort(
      (a, b) => a.lineStart - b.lineStart
    );

    return { newStore, groups: mergedGroups };
  }

  // Full execution: use only new groups
  return { newStore, groups: newGroups };
}

/**
 * Mutable state for an ongoing execution.
 * Keyed by line range for easy lookup and merging.
 */
interface ExecutionState {
  /** Expressions keyed by line range */
  expressionsByRange: Map<string, Expression>;
  /** Line range being executed (for partial execution) */
  lineRange?: { from: number; to: number };
  /** Current line groups - tracked here to avoid stale closure issues */
  currentLineGroups: LineGroup[];
}

/**
 * Handle an 'expressions' event: initialize pending expressions, preserve old results.
 */
function handleExpressionsEvent(
  state: ExecutionState,
  expressions: Expression[],
  existingExpressions: Map<number, Expression>
): void {
  // Build lookup of existing expressions by current line range (from line groups)
  // Line groups have up-to-date positions, while expressions have stale line numbers
  const existingByRange = new Map<string, Expression>();
  for (const group of state.currentLineGroups) {
    const key = lineRangeKey(group.lineStart, group.lineEnd);
    // Get the most recent result from this group
    const resultId = group.resultIds[group.resultIds.length - 1];
    const expr = existingExpressions.get(resultId);
    if (expr) {
      existingByRange.set(key, expr);
    }
  }

  // Initialize all expressions - first one is executing, rest are pending
  for (let i = 0; i < expressions.length; i++) {
    const expr = expressions[i];
    const key = lineRangeKey(expr.lineStart, expr.lineEnd);
    const inferredState = i === 0 ? 'executing' : 'pending';

    // Preserve old result while pending/executing
    const existingExpr = existingByRange.get(key);
    state.expressionsByRange.set(key, {
      ...expr,
      state: inferredState,
      result: existingExpr?.result,
    });
  }
}

/**
 * Handle a 'done' event: update expression with result, advance executing state.
 */
function handleDoneEvent(
  state: ExecutionState,
  expression: Expression
): void {
  const key = lineRangeKey(expression.lineStart, expression.lineEnd);

  // Update this expression with its result
  state.expressionsByRange.set(key, expression);

  // Find first pending expression and mark it as executing
  for (const [k, expr] of state.expressionsByRange) {
    if (expr.state === 'pending') {
      state.expressionsByRange.set(k, { ...expr, state: 'executing' });
      break;
    }
  }
}

function handleCancelledEvent(
  state: ExecutionState,
  cancelledExpressions: Array<{ lineStart: number; lineEnd: number }>
): void {
  for (const exprInfo of cancelledExpressions) {
    const key = lineRangeKey(exprInfo.lineStart, exprInfo.lineEnd);
    const existing = state.expressionsByRange.get(key);
    if (!existing) {
      continue;
    }

    // Treat as if it never ran: keep any previous output, otherwise remove it
    // so the editor doesn't show a new group/border.
    if (existing.result) {
      state.expressionsByRange.set(key, { ...existing, state: "done" });
    } else {
      state.expressionsByRange.delete(key);
    }
  }
}

/**
 * Custom hook to manage expression store and line groups.
 */
export function useResults() {
  const [expressions, setExpressions] = useState<Map<number, Expression>>(
    new Map()
  );
  const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);

  // Mutable ref for ongoing execution state
  const executionStateRef = useRef<ExecutionState | null>(null);

  // Keep a ref to the latest lineGroups to avoid stale closures
  const lineGroupsRef = useRef<LineGroup[]>(lineGroups);
  lineGroupsRef.current = lineGroups;

  /**
   * Handle an execution event. Returns updated line groups and done expression IDs.
   */
  const handleExecutionEvent = useCallback(
    (
      event: ExecutionEvent,
      options?: { lineRange?: { from: number; to: number } }
    ): { lineGroups: LineGroup[]; doneIds: number[] } => {
      // Initialize execution state on first event
      if (!executionStateRef.current) {
        executionStateRef.current = {
          expressionsByRange: new Map(),
          lineRange: options?.lineRange,
          // Initialize from ref to get latest value and enable ID reuse
          currentLineGroups: lineGroupsRef.current,
        };
      }

      const state = executionStateRef.current;

      if (event.type === 'expressions') {
        handleExpressionsEvent(state, event.expressions, expressions);
      } else if (event.type === 'done') {
        handleDoneEvent(state, event.expression);
      } else if (event.type === 'cancelled') {
        handleCancelledEvent(state, event.cancelledExpressions);
      }

      // Get all expressions as array
      const allExpressions = Array.from(state.expressionsByRange.values());

      // Compute line groups - use state.currentLineGroups to avoid stale closure
      const { newStore, groups } = processExecutionResults(
        expressions,
        allExpressions,
        {
          currentLineGroups: state.currentLineGroups,
          lineRange: state.lineRange,
        }
      );

      // Update the ref with new groups for subsequent events
      state.currentLineGroups = groups;

      setExpressions(newStore);
      setLineGroups(groups);

      // Get IDs of done expressions
      const doneIds = allExpressions
        .filter((expr) => expr.state === 'done')
        .map((expr) => expr.id);

      if (event.type === "cancelled") {
        executionStateRef.current = null;
      }

      return { lineGroups: groups, doneIds };
    },
    [expressions]
  );

  /**
   * Reset execution state (call when execution completes or is cancelled).
   */
  const resetExecutionState = useCallback(() => {
    executionStateRef.current = null;
  }, []);

  // Legacy API for compatibility
  const addExpressions = useCallback(
    (
      newExpressions: Expression[],
      options?: {
        lineRange?: { from: number; to: number };
      }
    ) => {
      const { newStore, groups } = processExecutionResults(
        expressions,
        newExpressions,
        {
          currentLineGroups: lineGroups,
          lineRange: options?.lineRange,
        }
      );
      setExpressions(newStore);
      setLineGroups(groups);
      return { lineGroups: groups };
    },
    [expressions, lineGroups]
  );

  // Update both ref and state - ref is immediate, state triggers re-render
  const updateLineGroups = useCallback((groups: LineGroup[]) => {
    lineGroupsRef.current = groups;
    setLineGroups(groups);
  }, []);

  return {
    expressions,
    lineGroups,
    setLineGroups: updateLineGroups,
    addExpressions,
    handleExecutionEvent,
    resetExecutionState,
  };
}
