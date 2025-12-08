import { describe, it, expect } from 'vitest';
import { adjustLineGroupsForDiff } from './diff-line-groups';
import { LineGroup } from './compute-line-groups';

function group(lineStart: number, lineEnd: number): LineGroup {
  return {
    id: `lg-${lineStart}`,
    resultIds: [1],
    lineStart,
    lineEnd,
    state: 'done',
  };
}

describe('adjustLineGroupsForDiff', () => {
  it('returns empty array for empty input', () => {
    const result = adjustLineGroupsForDiff('a\nb\n', 'a\nb\nc\n', []);
    expect(result).toEqual([]);
  });

  it('keeps groups unchanged when content is identical', () => {
    const content = 'line1\nline2\nline3\n';
    const groups = [group(1, 2)];
    const result = adjustLineGroupsForDiff(content, content, groups);
    expect(result).toHaveLength(1);
    expect(result[0].lineStart).toBe(1);
    expect(result[0].lineEnd).toBe(2);
  });

  it('adjusts line numbers when lines are inserted before group', () => {
    const oldContent = 'a\nb\nc\n';
    const newContent = 'new\na\nb\nc\n';
    const groups = [group(2, 3)]; // lines b-c
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toHaveLength(1);
    expect(result[0].lineStart).toBe(3);
    expect(result[0].lineEnd).toBe(4);
  });

  it('adjusts line numbers when lines are deleted before group', () => {
    const oldContent = 'a\nb\nc\nd\n';
    const newContent = 'c\nd\n';
    const groups = [group(3, 4)]; // lines c-d
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toHaveLength(1);
    expect(result[0].lineStart).toBe(1);
    expect(result[0].lineEnd).toBe(2);
  });

  it('drops group when any line in range is deleted', () => {
    const oldContent = 'a\nb\nc\n';
    const newContent = 'a\nc\n';
    const groups = [group(1, 3)]; // lines a-c, but b is deleted
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toEqual([]);
  });

  it('drops group when line inside range is deleted', () => {
    const oldContent = 'a\nb\nc\nd\n';
    const newContent = 'a\nc\nd\n';
    const groups = [group(2, 3)]; // lines b-c, but b is deleted
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toEqual([]);
  });

  it('drops group when lines become non-contiguous due to insertion', () => {
    // Original group: lines 5-7
    // After insertion between 6 and 7: old 5->5, 6->6, 7->9
    // Result: group DROPPED because 5,6,9 is not contiguous
    const oldContent = 'a\nb\nc\nd\ne\nf\ng\n';
    const newContent = 'a\nb\nc\nd\ne\nf\ninserted1\ninserted2\ng\n';
    const groups = [group(5, 7)]; // lines e, f, g
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toEqual([]);
  });

  it('keeps group when lines remain contiguous after insertion', () => {
    const oldContent = 'a\nb\nc\n';
    const newContent = 'a\nb\nc\nd\n';
    const groups = [group(1, 3)]; // lines a-c
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toHaveLength(1);
    expect(result[0].lineStart).toBe(1);
    expect(result[0].lineEnd).toBe(3);
  });

  it('handles single-line groups', () => {
    const oldContent = 'a\nb\nc\n';
    const newContent = 'new\na\nb\nc\n';
    const groups = [group(2, 2)]; // line b
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toHaveLength(1);
    expect(result[0].lineStart).toBe(3);
    expect(result[0].lineEnd).toBe(3);
  });

  it('drops single-line group when line is deleted', () => {
    const oldContent = 'a\nb\nc\n';
    const newContent = 'a\nc\n';
    const groups = [group(2, 2)]; // line b
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toEqual([]);
  });

  it('handles multiple groups', () => {
    const oldContent = 'a\nb\nc\nd\ne\n';
    const newContent = 'new\na\nb\nc\nd\ne\n';
    const groups = [group(1, 2), group(4, 5)];
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toHaveLength(2);
    expect(result[0].lineStart).toBe(2);
    expect(result[0].lineEnd).toBe(3);
    expect(result[1].lineStart).toBe(5);
    expect(result[1].lineEnd).toBe(6);
  });

  it('preserves group properties other than line numbers', () => {
    const oldContent = 'a\nb\nc\n';
    const newContent = 'x\na\nb\nc\n';
    const groups: LineGroup[] = [{
      id: 'test-id',
      resultIds: [1, 2, 3],
      lineStart: 1,
      lineEnd: 2,
      allInvisible: true,
      state: 'executing',
    }];
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test-id');
    expect(result[0].resultIds).toEqual([1, 2, 3]);
    expect(result[0].allInvisible).toBe(true);
    expect(result[0].state).toBe('executing');
    expect(result[0].lineStart).toBe(2);
    expect(result[0].lineEnd).toBe(3);
  });

  it('handles content without trailing newlines', () => {
    const oldContent = 'a\nb\nc';
    const newContent = 'x\na\nb\nc';
    const groups = [group(2, 3)];
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    expect(result).toHaveLength(1);
    expect(result[0].lineStart).toBe(3);
    expect(result[0].lineEnd).toBe(4);
  });

  it('drops group when trailing newline is removed (line change)', () => {
    // When trailing newline changes, diffLines sees last line as modified
    const oldContent = 'a\nb\nc\n';
    const newContent = 'a\nb\nc';
    const groups = [group(1, 3)];
    const result = adjustLineGroupsForDiff(oldContent, newContent, groups);
    // The last line is seen as deleted (old c\n) and replaced (new c)
    // so group spanning line 3 should be dropped
    expect(result).toEqual([]);
  });
});
