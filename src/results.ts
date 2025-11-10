import { useState, useCallback } from "react";
import { ExecutionOutput } from "./execution";
import { computeLineGroups, LineGroup } from "./compute-line-groups";

/**
 * Adds new results to the result store (non-destructive).
 */
export function addResultsToStore(
  resultStore: Map<number, ExecutionOutput>,
  newResults: ExecutionOutput[]
): Map<number, ExecutionOutput> {
  const newStore = new Map(resultStore);
  for (const r of newResults) {
    newStore.set(r.id, r);
  }
  return newStore;
}

/**
 * Processes execution results: adds to store and computes line groups.
 */
export function processExecutionResults(
  resultStore: Map<number, ExecutionOutput>,
  newResults: ExecutionOutput[]
): {
  newStore: Map<number, ExecutionOutput>;
  groups: LineGroup[];
} {
  const newStore = addResultsToStore(resultStore, newResults);
  const groups = computeLineGroups(newResults);

  return { newStore, groups };
}

/**
 * Custom hook to manage result store and line groups.
 */
export function useResults() {
  const [results, setResults] = useState<Map<number, ExecutionOutput>>(
    new Map()
  );
  const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);

  const addResults = useCallback(
    (newResults: ExecutionOutput[]) => {
      const { newStore, groups } = processExecutionResults(
        results,
        newResults
      );
      setResults(newStore);
      setLineGroups(groups);
      return { lineGroups: groups };
    },
    [results]
  );

  return {
    results,
    lineGroups,
    setLineGroups,
    addResults,
  };
}
