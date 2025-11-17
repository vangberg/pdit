import { useState, useCallback } from "react";
import { Expression } from "./execution";
import { computeLineGroups, LineGroup } from "./compute-line-groups";

/**
 * Adds new results to the result store (non-destructive).
 */
export function addResultsToStore(
  resultStore: Map<number, Expression>,
  newResults: Expression[]
): Map<number, Expression> {
  const newStore = new Map(resultStore);
  for (const r of newResults) {
    newStore.set(r.id, r);
  }
  return newStore;
}

/**
 * Processes execution results: adds to store and computes line groups.
 * For partial execution, merges new groups with non-overlapping existing groups.
 */
export function processExecutionResults(
  resultStore: Map<number, Expression>,
  newResults: Expression[],
  options?: {
    currentLineGroups?: LineGroup[];
    lineRange?: { from: number; to: number };
  }
): {
  newStore: Map<number, Expression>;
  groups: LineGroup[];
} {
  const newStore = addResultsToStore(resultStore, newResults);

  // Compute new groups from executed results
  const newGroups = computeLineGroups(newResults);

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
 * Custom hook to manage result store and line groups.
 */
export function useResults() {
  const [results, setResults] = useState<Map<number, Expression>>(
    new Map()
  );
  const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);

  const addResults = useCallback(
    (
      newResults: Expression[],
      options?: {
        lineRange?: { from: number; to: number };
      }
    ) => {
      const { newStore, groups } = processExecutionResults(
        results,
        newResults,
        {
          currentLineGroups: lineGroups,
          lineRange: options?.lineRange,
        }
      );
      setResults(newStore);
      setLineGroups(groups);
      return { lineGroups: groups };
    },
    [results, lineGroups]
  );

  return {
    results,
    lineGroups,
    setLineGroups,
    addResults,
  };
}
