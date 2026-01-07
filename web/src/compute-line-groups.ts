import { Expression } from "./execution";

export type LineGroupState = 'pending' | 'executing' | 'done';

export interface LineGroup {
  id: string;
  resultIds: number[];
  previousResultIds?: number[];
  lineStart: number;
  lineEnd: number;
  allInvisible?: boolean;
  hasError?: boolean;
  state: LineGroupState;
}

let lineGroupIdCounter = 0;

/**
 * Groups API execution results that share any lines using a union-find structure.
 * Results that touch the same line belong to the same group.
 */
export function computeLineGroups(results: Expression[]): LineGroup[] {
  if (results.length === 0) {
    return [];
  }

  const expressionHasError = (result: Expression): boolean =>
    result.result?.output?.some(
      (item) => item.type === 'error' || item.type === 'stderr'
    ) ?? false;

  // Build a mapping of line number to the result IDs that cover that line.
  const lineToResults = new Map<number, Set<number>>();
  for (const result of results) {
    for (let line = result.lineStart; line <= result.lineEnd; line++) {
      if (!lineToResults.has(line)) {
        lineToResults.set(line, new Set());
      }
      lineToResults.get(line)!.add(result.id);
    }
  }

  const parent = new Map<number, number>();

  const find = (id: number): number => {
    if (!parent.has(id)) {
      parent.set(id, id);
    }
    const current = parent.get(id)!;
    if (current !== id) {
      const root = find(current);
      parent.set(id, root);
      return root;
    }
    return current;
  };

  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  };

  for (const resultIds of lineToResults.values()) {
    const ids = Array.from(resultIds);
    for (let i = 1; i < ids.length; i++) {
      union(ids[0], ids[i]);
    }
  }

  const grouped = new Map<number, number[]>();
  for (const result of results) {
    const root = find(result.id);
    if (!grouped.has(root)) {
      grouped.set(root, []);
    }
    grouped.get(root)!.push(result.id);
  }

  const groups: LineGroup[] = [];
  for (const resultIds of grouped.values()) {
    let minLine = Number.POSITIVE_INFINITY;
    let maxLine = Number.NEGATIVE_INFINITY;
    const groupResults: Expression[] = [];

    for (const id of resultIds) {
      const result = results.find((item) => item.id === id);
      if (!result) {
        continue;
      }
      groupResults.push(result);
      minLine = Math.min(minLine, result.lineStart);
      maxLine = Math.max(maxLine, result.lineEnd);
    }

    if (minLine !== Number.POSITIVE_INFINITY && maxLine !== Number.NEGATIVE_INFINITY) {
      // Check if all results in this group are invisible
      const allInvisible = groupResults.every(
        (result) => result.result?.isInvisible === true
      );
      const hasError = groupResults.some(expressionHasError);

      // Compute group state from expression states:
      // - Any executing → executing
      // - All done → done
      // - Otherwise → pending
      let groupState: LineGroupState = 'done';
      for (const result of groupResults) {
        if (result.state === 'executing') {
          groupState = 'executing';
          break;
        }
        if (result.state === 'pending') {
          groupState = 'pending';
        }
      }

      groups.push({
        id: `lg-${lineGroupIdCounter++}`,
        resultIds: [...resultIds].sort((a, b) => a - b),
        lineStart: minLine,
        lineEnd: maxLine,
        allInvisible,
        hasError,
        state: groupState,
      });
    }
  }

  return groups.sort((a, b) => a.lineStart - b.lineStart);
}
