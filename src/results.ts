import { ExecutionOutput } from "./execution";

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
