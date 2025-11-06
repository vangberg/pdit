import { ExecutionOutput } from "./execution";

/**
 * Computes the set of line numbers that were executed in the given results.
 */
export function getExecutedLines(results: ExecutionOutput[]): Set<number> {
  const executedLines = new Set<number>();
  for (const r of results) {
    for (let line = r.lineStart; line <= r.lineEnd; line++) {
      executedLines.add(line);
    }
  }
  return executedLines;
}

/**
 * Gets the set of line numbers covered by a single result.
 */
export function getResultLines(result: ExecutionOutput): Set<number> {
  const lines = new Set<number>();
  for (let line = result.lineStart; line <= result.lineEnd; line++) {
    lines.add(line);
  }
  return lines;
}

/**
 * Finds all result IDs that overlap with the given set of lines.
 */
export function getOverlappingResultIds(
  resultIds: Set<number>,
  resultStore: Map<number, ExecutionOutput>,
  lines: Set<number>
): Set<number> {
  const overlapping = new Set<number>();
  for (const id of resultIds) {
    const result = resultStore.get(id);
    if (result) {
      const resultLines = getResultLines(result);
      if (resultLines.intersection(lines).size > 0) {
        overlapping.add(id);
      }
    }
  }
  return overlapping;
}

/**
 * Updates the active result set by:
 * 1. Removing results that overlap with newly executed lines
 * 2. Adding the new results
 */
export function updateActiveResults(
  activeResultIds: Set<number>,
  resultStore: Map<number, ExecutionOutput>,
  newResults: ExecutionOutput[]
): Set<number> {
  const executedLines = getExecutedLines(newResults);
  const overlappingIds = getOverlappingResultIds(
    activeResultIds,
    resultStore,
    executedLines
  );

  // Remove overlapping results, add new result IDs
  const newResultIds = new Set(newResults.map(r => r.id));
  return activeResultIds.difference(overlappingIds).union(newResultIds);
}

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
