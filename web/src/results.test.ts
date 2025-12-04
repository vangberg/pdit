import { describe, it, expect } from 'vitest';
import { processExecutionResults } from './results';
import { Expression } from './execution-python';
import { LineGroup } from './compute-line-groups';

// Helper to create expression with required fields
function expr(id: number, lineStart: number, lineEnd: number): Expression {
  return { id, nodeIndex: id, lineStart, lineEnd, state: 'done', result: { output: [] } };
}

// Helper to create line group with required fields
function lg(id: string, resultIds: number[], lineStart: number, lineEnd: number): LineGroup {
  return { id, resultIds, lineStart, lineEnd, state: 'done' };
}

describe('processExecutionResults', () => {
  it('computes line groups from new expressions without options', () => {
    const store = new Map<number, Expression>();
    const newExpressions: Expression[] = [expr(1, 1, 1), expr(2, 3, 3)];

    const { newStore, groups } = processExecutionResults(store, newExpressions);

    expect(newStore.size).toBe(2);
    expect(newStore.get(1)).toEqual(newExpressions[0]);
    expect(newStore.get(2)).toEqual(newExpressions[1]);
    expect(groups).toHaveLength(2);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[1].resultIds).toEqual([2]);
  });

  it('preserves non-overlapping groups during partial execution', () => {
    const store = new Map<number, Expression>();
    store.set(1, expr(1, 1, 1));
    store.set(2, expr(2, 3, 3));
    store.set(3, expr(3, 5, 5));

    const currentLineGroups: LineGroup[] = [
      lg('g1', [1], 1, 1),
      lg('g2', [2], 3, 3),
      lg('g3', [3], 5, 5),
    ];

    const newExpressions: Expression[] = [expr(4, 3, 3)];

    const { newStore, groups } = processExecutionResults(store, newExpressions, {
      currentLineGroups,
      lineRange: { from: 3, to: 3 },
    });

    expect(newStore.size).toBe(4);
    expect(groups).toHaveLength(3);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[1].resultIds).toEqual([4]);
    expect(groups[1].lineStart).toBe(3);
    expect(groups[2].resultIds).toEqual([3]);
    expect(groups[2].lineStart).toBe(5);
  });

  it('removes overlapping group when lineEnd < from', () => {
    const store = new Map<number, Expression>();
    const currentLineGroups: LineGroup[] = [
      lg('g1', [1], 1, 2),
      lg('g2', [2], 5, 6),
    ];

    const newExpressions: Expression[] = [expr(3, 1, 1)];

    const { groups } = processExecutionResults(store, newExpressions, {
      currentLineGroups,
      lineRange: { from: 1, to: 2 },
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].resultIds).toEqual([3]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[1].resultIds).toEqual([2]);
    expect(groups[1].lineStart).toBe(5);
  });

  it('removes overlapping group when lineStart > to', () => {
    const store = new Map<number, Expression>();
    const currentLineGroups: LineGroup[] = [
      lg('g1', [1], 1, 2),
      lg('g2', [2], 5, 6),
    ];

    const newExpressions: Expression[] = [expr(3, 5, 5)];

    const { groups } = processExecutionResults(store, newExpressions, {
      currentLineGroups,
      lineRange: { from: 5, to: 6 },
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[1].resultIds).toEqual([3]);
    expect(groups[1].lineStart).toBe(5);
  });

  it('removes multiple overlapping groups', () => {
    const store = new Map<number, Expression>();
    const currentLineGroups: LineGroup[] = [
      lg('g1', [1], 1, 2),
      lg('g2', [2], 3, 4),
      lg('g3', [3], 5, 6),
      lg('g4', [4], 10, 11),
    ];

    const newExpressions: Expression[] = [expr(5, 3, 5)];

    const { groups } = processExecutionResults(store, newExpressions, {
      currentLineGroups,
      lineRange: { from: 3, to: 6 },
    });

    expect(groups).toHaveLength(3);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[1].resultIds).toEqual([5]);
    expect(groups[1].lineStart).toBe(3);
    expect(groups[2].resultIds).toEqual([4]);
    expect(groups[2].lineStart).toBe(10);
  });

  it('sorts merged groups by lineStart', () => {
    const store = new Map<number, Expression>();
    const currentLineGroups: LineGroup[] = [
      lg('g1', [1], 1, 2),
      lg('g2', [2], 10, 11),
    ];

    const newExpressions: Expression[] = [expr(3, 5, 5)];

    const { groups } = processExecutionResults(store, newExpressions, {
      currentLineGroups,
      lineRange: { from: 5, to: 5 },
    });

    expect(groups).toHaveLength(3);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[1].lineStart).toBe(5);
    expect(groups[2].lineStart).toBe(10);
  });

  it('handles empty new results with partial execution', () => {
    const store = new Map<number, Expression>();
    const currentLineGroups: LineGroup[] = [
      lg('g1', [1], 1, 2),
      lg('g2', [2], 5, 6),
    ];

    const newExpressions: Expression[] = [];

    const { groups } = processExecutionResults(store, newExpressions, {
      currentLineGroups,
      lineRange: { from: 3, to: 4 },
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[1].resultIds).toEqual([2]);
  });

  it('replaces all groups when lineRange covers everything', () => {
    const store = new Map<number, Expression>();
    const currentLineGroups: LineGroup[] = [
      lg('g1', [1], 2, 3),
      lg('g2', [2], 5, 6),
    ];

    const newExpressions: Expression[] = [expr(3, 1, 1)];

    const { groups } = processExecutionResults(store, newExpressions, {
      currentLineGroups,
      lineRange: { from: 1, to: 10 },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([3]);
  });
});
