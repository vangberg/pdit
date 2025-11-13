import { describe, it, expect, beforeAll } from 'vitest';
import { executeScript } from './execution';
import { initializeWebR } from './webr-instance';

describe('executeScript', () => {
  beforeAll(async () => {
    // Ensure webR is initialized before running tests
    await initializeWebR();
  }, 30000); // 30 second timeout for webR initialization

  describe('without lineRange', () => {
    it('executes all expressions in the script', async () => {
      const script = 'x <- 1\ny <- 2\nz <- 3';
      const result = await executeScript(script);

      // Should execute all three expressions
      expect(result.results).toHaveLength(0); // No output generated for assignments
    });

    it('executes all expressions with output', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const result = await executeScript(script);

      expect(result.results).toHaveLength(3);
      expect(result.results[0].lineStart).toBe(1);
      expect(result.results[0].lineEnd).toBe(1);
      expect(result.results[1].lineStart).toBe(2);
      expect(result.results[1].lineEnd).toBe(2);
      expect(result.results[2].lineStart).toBe(3);
      expect(result.results[2].lineEnd).toBe(3);
    });
  });

  describe('with lineRange - single line', () => {
    it('executes only the expression on the specified line', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const result = await executeScript(script, { lineRange: { from: 2, to: 2 } });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(2);
      expect(result.results[0].lineEnd).toBe(2);
      expect(result.results[0].output[0].text).toContain('second');
    });

    it('executes expression on line 1', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const result = await executeScript(script, { lineRange: { from: 1, to: 1 } });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(1);
      expect(result.results[0].output[0].text).toContain('first');
    });

    it('executes expression on last line', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const result = await executeScript(script, { lineRange: { from: 3, to: 3 } });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(3);
      expect(result.results[0].output[0].text).toContain('third');
    });
  });

  describe('with lineRange - multiple expressions per line', () => {
    it('executes all expressions on the same line (semicolon-separated)', async () => {
      const script = 'x <- 1; y <- 2; print("done")';
      const result = await executeScript(script, { lineRange: { from: 1, to: 1 } });

      // All three expressions should execute, but only print produces output
      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(1);
      expect(result.results[0].output[0].text).toContain('done');
    });
  });

  describe('with lineRange - multi-line expressions', () => {
    it('executes entire multi-line expression when cursor is on first line', async () => {
      const script = `my_func <- function() {
  print("hello from function")
}
print("outside")`;
      const result = await executeScript(script, { lineRange: { from: 1, to: 1 } });

      // Should execute the function definition (lines 1-3) but not produce output
      expect(result.results).toHaveLength(0);
    });

    it('executes entire multi-line expression when cursor is on middle line', async () => {
      const script = `my_func <- function() {
  print("hello from function")
}
print("outside")`;
      const result = await executeScript(script, { lineRange: { from: 2, to: 2 } });

      // Should execute the function definition (lines 1-3) but not produce output
      expect(result.results).toHaveLength(0);
    });

    it('executes entire multi-line expression when cursor is on last line', async () => {
      const script = `my_func <- function() {
  print("hello from function")
}
print("outside")`;
      const result = await executeScript(script, { lineRange: { from: 3, to: 3 } });

      // Should execute the function definition (lines 1-3) but not produce output
      expect(result.results).toHaveLength(0);
    });
  });

  describe('with lineRange - selection spanning multiple expressions', () => {
    it('executes all expressions in the selected range', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")\nprint("fourth")';
      const result = await executeScript(script, { lineRange: { from: 2, to: 3 } });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].lineStart).toBe(2);
      expect(result.results[0].output[0].text).toContain('second');
      expect(result.results[1].lineStart).toBe(3);
      expect(result.results[1].output[0].text).toContain('third');
    });

    it('executes expressions partially overlapping the range', async () => {
      const script = `x <- 1
my_func <- function() {
  print("in function")
}
print("after")`;
      const result = await executeScript(script, { lineRange: { from: 2, to: 4 } });

      // Should execute the function definition (lines 2-4) and the print statement (line 5 is not in range)
      expect(result.results).toHaveLength(0); // Function definition has no output
    });
  });

  describe('edge cases', () => {
    it('returns empty results when range has no expressions', async () => {
      const script = 'print("first")\n\n\nprint("second")';
      const result = await executeScript(script, { lineRange: { from: 2, to: 3 } });

      expect(result.results).toHaveLength(0);
    });

    it('handles empty lines in range', async () => {
      const script = 'print("first")\n\nprint("second")';
      const result = await executeScript(script, { lineRange: { from: 1, to: 3 } });

      expect(result.results).toHaveLength(2);
    });

    it('handles range beyond script length', async () => {
      const script = 'print("only line")';
      const result = await executeScript(script, { lineRange: { from: 5, to: 10 } });

      expect(result.results).toHaveLength(0);
    });

    it('handles comments within range', async () => {
      const script = '# This is a comment\nprint("hello")\n# Another comment';
      const result = await executeScript(script, { lineRange: { from: 1, to: 3 } });

      // Comments don't generate output, only the print statement
      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(2);
    });
  });

  describe('overlap detection', () => {
    it('includes expression that starts before and ends within range', async () => {
      const script = `x <- function() {
  print("in function")
}
print("after")`;
      const result = await executeScript(script, { lineRange: { from: 2, to: 4 } });

      // Function (lines 1-3) overlaps with range [2-4]
      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(4);
    });

    it('includes expression that starts within and ends after range', async () => {
      const script = `print("before")
x <- function() {
  print("in function")
}`;
      const result = await executeScript(script, { lineRange: { from: 1, to: 2 } });

      // Function (lines 2-4) overlaps with range [1-2]
      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(1);
    });

    it('includes expression fully contained within range', async () => {
      const script = `print("before")
print("middle")
print("after")`;
      const result = await executeScript(script, { lineRange: { from: 1, to: 3 } });

      expect(result.results).toHaveLength(3);
    });

    it('excludes expression completely before range', async () => {
      const script = 'print("before")\nprint("target")\nprint("after")';
      const result = await executeScript(script, { lineRange: { from: 2, to: 2 } });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(2);
    });

    it('excludes expression completely after range', async () => {
      const script = 'print("before")\nprint("target")\nprint("after")';
      const result = await executeScript(script, { lineRange: { from: 1, to: 1 } });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].lineStart).toBe(1);
    });
  });
});
