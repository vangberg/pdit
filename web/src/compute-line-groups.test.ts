import { describe, it, expect } from 'vitest';
import { computeLineGroups } from './compute-line-groups';
import { Expression, OutputItem } from './execution';

// Helper to create expression with required fields
function expr(
  id: number,
  lineStart: number,
  lineEnd: number,
  output: OutputItem[] = []
): Expression {
  return { id, lineStart, lineEnd, state: 'done', result: { output } };
}

describe('computeLineGroups', () => {
  it('returns empty array for empty input', () => {
    const result = computeLineGroups([]);
    expect(result).toEqual([]);
  });

  it('creates single group for single result', () => {
    const results: Expression[] = [expr(1, 1, 1)];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[0].lineEnd).toBe(1);
  });

  it('creates separate groups for non-overlapping results', () => {
    const results: Expression[] = [expr(1, 1, 2), expr(2, 5, 6)];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(2);
    expect(groups[0].resultIds).toEqual([1]);
    expect(groups[1].resultIds).toEqual([2]);
  });

  it('merges results that share a line', () => {
    const results: Expression[] = [expr(1, 1, 3), expr(2, 3, 5)];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([1, 2]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[0].lineEnd).toBe(5);
  });

  it('merges transitively connected results', () => {
    const results: Expression[] = [expr(1, 1, 2), expr(2, 2, 3), expr(3, 3, 4)];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([1, 2, 3]);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[0].lineEnd).toBe(4);
  });

  it('creates mixed groups: some merged, some separate', () => {
    const results: Expression[] = [expr(1, 1, 2), expr(2, 2, 3), expr(3, 10, 11)];
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
    const results: Expression[] = [expr(1, 5, 5), expr(2, 5, 5), expr(3, 5, 5)];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(1);
    expect(groups[0].resultIds).toEqual([1, 2, 3]);
    expect(groups[0].lineStart).toBe(5);
    expect(groups[0].lineEnd).toBe(5);
  });

  it('sorts groups by lineStart', () => {
    const results: Expression[] = [expr(3, 20, 21), expr(1, 1, 2), expr(2, 10, 11)];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(3);
    expect(groups[0].lineStart).toBe(1);
    expect(groups[1].lineStart).toBe(10);
    expect(groups[2].lineStart).toBe(20);
  });

  it('marks groups with error output', () => {
    const results: Expression[] = [
      expr(1, 1, 1, [{ type: 'stderr', content: 'Boom' }]),
      expr(2, 3, 3, [{ type: 'text/plain', content: 'OK' }])
    ];
    const groups = computeLineGroups(results);
    expect(groups).toHaveLength(2);
    expect(groups[0].hasError).toBe(true);
    expect(groups[1].hasError).toBe(false);
  });
});
