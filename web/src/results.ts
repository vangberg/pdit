import { useState, useCallback } from "react";
import { Expression } from "./execution";
import { computeLineGroups, LineGroup } from "./compute-line-groups";

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
 * Custom hook to manage expression store and line groups.
 */
export function useResults() {
  const [expressions, setExpressions] = useState<Map<number, Expression>>(
    new Map()
  );
  const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);

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

  const clearResults = useCallback(() => {
    setExpressions(new Map());
    setLineGroups([]);
  }, []);

  return {
    expressions,
    lineGroups,
    setLineGroups,
    addExpressions,
    clearResults,
  };
}
