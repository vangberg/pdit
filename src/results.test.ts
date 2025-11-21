import { describe, it, expect } from 'vitest';
import { processExecutionResults } from './results';
import { Expression } from './execution-python';
import { LineGroup } from './compute-line-groups';

describe('processExecutionResults', () => {
  it('computes line groups from new expressions without options', () => {
    const store = new Map<number, Expression>();
    const newExpressions: Expression[] = [
      { id: 1, lineStart: 1, lineEnd: 1, result: { output: [] } },
      { id: 2, lineStart: 3, lineEnd: 3, result: { output: [] } },
    ];

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
    store.set(1, { id: 1, lineStart: 1, lineEnd: 1, result: { output: [] } });
    store.set(2, { id: 2, lineStart: 3, lineEnd: 3, result: { output: [] } });
    store.set(3, { id: 3, lineStart: 5, lineEnd: 5, result: { output: [] } });

    const currentLineGroups: LineGroup[] = [
      { id: 'g1', resultIds: [1], lineStart: 1, lineEnd: 1 },
      { id: 'g2', resultIds: [2], lineStart: 3, lineEnd: 3 },
      { id: 'g3', resultIds: [3], lineStart: 5, lineEnd: 5 },
    ];

    const newExpressions: Expression[] = [
      { id: 4, lineStart: 3, lineEnd: 3, result: { output: [] } },
    ];

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
      { id: 'g1', resultIds: [1], lineStart: 1, lineEnd: 2 },
      { id: 'g2', resultIds: [2], lineStart: 5, lineEnd: 6 },
    ];

    const newExpressions: Expression[] = [
      { id: 3, lineStart: 1, lineEnd: 1, result: { output: [] } },
    ];

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
      { id: 'g1', resultIds: [1], lineStart: 1, lineEnd: 2 },
      { id: 'g2', resultIds: [2], lineStart: 5, lineEnd: 6 },
    ];

    const newExpressions: Expression[] = [
      { id: 3, lineStart: 5, lineEnd: 5, result: { output: [] } },
    ];

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
      { id: 'g1', resultIds: [1], lineStart: 1, lineEnd: 2 },
      { id: 'g2', resultIds: [2], lineStart: 3, lineEnd: 4 },
      { id: 'g3', resultIds: [3], lineStart: 5, lineEnd: 6 },
      { id: 'g4', resultIds: [4], lineStart: 10, lineEnd: 11 },
    ];

    const newExpressions: Expression[] = [
      { id: 5, lineStart: 3, lineEnd: 5, result: { output: [] } },
    ];

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
      { id: 'g1', resultIds: [1], lineStart: 1, lineEnd: 2 },
      { id: 'g2', resultIds: [2], lineStart: 10, lineEnd: 11 },
    ];

    const newExpressions: Expression[] = [
      { id: 3, lineStart: 5, lineEnd: 5, result: { output: [] } },
    ];

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
      { id: 'g1', resultIds: [1], lineStart: 1, lineEnd: 2 },
      { id: 'g2', resultIds: [2], lineStart: 5, lineEnd: 6 },
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
      { id: 'g1', resultIds: [1], lineStart: 2, lineEnd: 3 },
      { id: 'g2', resultIds: [2], lineStart: 5, lineEnd: 6 },
    ];

    const newExpressions: Expression[] = [
      { id: 3, lineStart: 1, lineEnd: 1, result: { output: [] } },
    ];

    const { groups } = processExecutionResults(store, newExpressions, {
      currentLineGroups,
      lineRange: { from: 1, to: 10 },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([3]);
  });
});
