import { describe, it, expect } from 'vitest';
import { computeLineGroups } from './compute-line-groups';
import { Expression } from './execution';

describe('computeLineGroups', () => {
  it('returns empty array for empty input', () => {
    const result = computeLineGroups([]);
    expect(result).toEqual([]);
  });

  it('creates single group for single result', () => {
    const results: Expression[] = [
      { id: 1, lineStart: 1, lineEnd: 1, result: { output: [] } },
    ];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[0].lineEnd).toBe(1);
  });

  it('creates separate groups for non-overlapping results', () => {
    const results: Expression[] = [
      { id: 1, lineStart: 1, lineEnd: 2, result: { output: [] } },
      { id: 2, lineStart: 5, lineEnd: 6, result: { output: [] } },
    ];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(2);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[1].resultIds).toEqual([2]);
  });

  it('merges results that share a line', () => {
    const results: Expression[] = [
      { id: 1, lineStart: 1, lineEnd: 3, result: { output: [] } },
      { id: 2, lineStart: 3, lineEnd: 5, result: { output: [] } },
    ];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([1, 2]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[0].lineEnd).toBe(5);
  });

  it('merges transitively connected results', () => {
    const results: Expression[] = [
      { id: 1, lineStart: 1, lineEnd: 2, result: { output: [] } },
      { id: 2, lineStart: 2, lineEnd: 3, result: { output: [] } },
      { id: 3, lineStart: 3, lineEnd: 4, result: { output: [] } },
    ];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([1, 2, 3]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[0].lineEnd).toBe(4);
  });

  it('creates mixed groups: some merged, some separate', () => {
    const results: Expression[] = [
      { id: 1, lineStart: 1, lineEnd: 2, result: { output: [] } },
      { id: 2, lineStart: 2, lineEnd: 3, result: { output: [] } },
      { id: 3, lineStart: 10, lineEnd: 11, result: { output: [] } },
    ];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(2);
    expect(groups[0].resultIds).toEqual([1, 2]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[0].lineEnd).toBe(3);
    expect(groups[1].resultIds).toEqual([3]);
    expect(groups[1].lineStart).toBe(10);
    expect(groups[1].lineEnd).toBe(11);
  });

  it('handles multiple results on exact same lines', () => {
    const results: Expression[] = [
      { id: 1, lineStart: 5, lineEnd: 5, result: { output: [] } },
      { id: 2, lineStart: 5, lineEnd: 5, result: { output: [] } },
      { id: 3, lineStart: 5, lineEnd: 5, result: { output: [] } },
    ];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([1, 2, 3]);
    expect(groups[0].lineStart).toBe(5);
    expect(groups[0].lineEnd).toBe(5);
  });

  it('sorts groups by lineStart', () => {
    const results: Expression[] = [
      { id: 3, lineStart: 20, lineEnd: 21, result: { output: [] } },
      { id: 1, lineStart: 1, lineEnd: 2, result: { output: [] } },
      { id: 2, lineStart: 10, lineEnd: 11, result: { output: [] } },
    ];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(3);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[1].lineStart).toBe(10);
    expect(groups[2].lineStart).toBe(20);
  });
});
