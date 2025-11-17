import { describe, it, expect, beforeAll } from 'vitest';
import { executeScript, Expression } from './execution';
import { initializeWebR } from './webr-instance';

// Helper function to collect all results from the async generator
async function collectResults(
  script: string,
  options?: { lineRange?: { from: number; to: number } }
): Promise<Expression[]> {
  const results: Expression[] = [];
  for await (const result of executeScript(script, options)) {
    results.push(result);
  }
  return results;
}

describe('executeScript', () => {
  beforeAll(async () => {
    // Ensure webR is initialized before running tests
    await initializeWebR();
  }, 30000); // 30 second timeout for webR initialization

  describe('without lineRange', () => {
    it('executes all expressions in the script', async () => {
      const script = 'x <- 1\ny <- 2\nz <- 3';
      const results = await collectResults(script);

      // Should execute all three expressions with invisible output
      expect(results).toHaveLength(3);
      expect(results[0].result?.isInvisible).toBe(true);
      expect(results[1].result?.isInvisible).toBe(true);
      expect(results[2].result?.isInvisible).toBe(true);
    });

    it('executes all expressions with output', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const results = await collectResults(script);

      expect(results).toHaveLength(3);
      expect(results[0].lineStart).toBe(1);
      expect(results[0].lineEnd).toBe(1);
      expect(results[1].lineStart).toBe(2);
      expect(results[1].lineEnd).toBe(2);
      expect(results[2].lineStart).toBe(3);
      expect(results[2].lineEnd).toBe(3);
    });
  });

  describe('with lineRange - single line', () => {
    it('executes only the expression on the specified line', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const results = await collectResults(script, { lineRange: { from: 2, to: 2 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(2);
      expect(results[0].lineEnd).toBe(2);
      expect(results[0].result?.output[0].text).toContain('second');
    });

    it('executes expression on line 1', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const results = await collectResults(script, { lineRange: { from: 1, to: 1 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(1);
      expect(results[0].result?.output[0].text).toContain('first');
    });

    it('executes expression on last line', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const results = await collectResults(script, { lineRange: { from: 3, to: 3 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(3);
      expect(results[0].result?.output[0].text).toContain('third');
    });
  });

  describe('with lineRange - multiple expressions per line', () => {
    it('executes all expressions on the same line (semicolon-separated)', async () => {
      const script = 'x <- 1; y <- 2; print("done")';
      const results = await collectResults(script, { lineRange: { from: 1, to: 1 } });

      // All three expressions should execute
      expect(results).toHaveLength(3);
      expect(results[0].result?.isInvisible).toBe(true);
      expect(results[1].result?.isInvisible).toBe(true);
      expect(results[2].result?.isInvisible).toBe(false); // print has visible output
      expect(results[2].lineStart).toBe(1);
      expect(results[2].result?.output[0].text).toContain('done');
    });
  });

  describe('with lineRange - multi-line expressions', () => {
    it('executes entire multi-line expression when cursor is on first line', async () => {
      const script = `my_func <- function() {
  print("hello from function")
}
print("outside")`;
      const results = await collectResults(script, { lineRange: { from: 1, to: 1 } });

      // Should execute the function definition (lines 1-3) with invisible output
      expect(results).toHaveLength(1);
      expect(results[0].result?.isInvisible).toBe(true);
    });

    it('executes entire multi-line expression when cursor is on middle line', async () => {
      const script = `my_func <- function() {
  print("hello from function")
}
print("outside")`;
      const results = await collectResults(script, { lineRange: { from: 2, to: 2 } });

      // Should execute the function definition (lines 1-3) with invisible output
      expect(results).toHaveLength(1);
      expect(results[0].result?.isInvisible).toBe(true);
    });

    it('executes entire multi-line expression when cursor is on last line', async () => {
      const script = `my_func <- function() {
  print("hello from function")
}
print("outside")`;
      const results = await collectResults(script, { lineRange: { from: 3, to: 3 } });

      // Should execute the function definition (lines 1-3) with invisible output
      expect(results).toHaveLength(1);
      expect(results[0].result?.isInvisible).toBe(true);
    });
  });

  describe('with lineRange - selection spanning multiple expressions', () => {
    it('executes all expressions in the selected range', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")\nprint("fourth")';
      const results = await collectResults(script, { lineRange: { from: 2, to: 3 } });

      expect(results).toHaveLength(2);
      expect(results[0].lineStart).toBe(2);
      expect(results[0].result?.output[0].text).toContain('second');
      expect(results[1].lineStart).toBe(3);
      expect(results[1].result?.output[0].text).toContain('third');
    });

    it('executes expressions partially overlapping the range', async () => {
      const script = `x <- 1
my_func <- function() {
  print("in function")
}
print("after")`;
      const results = await collectResults(script, { lineRange: { from: 2, to: 4 } });

      // Should execute the function definition (lines 2-4) with invisible output
      expect(results).toHaveLength(1);
      expect(results[0].result?.isInvisible).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty results when range has no expressions', async () => {
      const script = 'print("first")\n\n\nprint("second")';
      const results = await collectResults(script, { lineRange: { from: 2, to: 3 } });

      expect(results).toHaveLength(0);
    });

    it('handles empty lines in range', async () => {
      const script = 'print("first")\n\nprint("second")';
      const results = await collectResults(script, { lineRange: { from: 1, to: 3 } });

      expect(results).toHaveLength(2);
    });

    it('handles range beyond script length', async () => {
      const script = 'print("only line")';
      const results = await collectResults(script, { lineRange: { from: 5, to: 10 } });

      expect(results).toHaveLength(0);
    });

    it('handles comments within range', async () => {
      const script = '# This is a comment\nprint("hello")\n# Another comment';
      const results = await collectResults(script, { lineRange: { from: 1, to: 3 } });

      // Comments don't generate output, only the print statement
      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(2);
    });
  });

  describe('overlap detection', () => {
    it('includes expression that starts before and ends within range', async () => {
      const script = `x <- function() {
  print("in function")
}
print("after")`;
      const results = await collectResults(script, { lineRange: { from: 2, to: 4 } });

      // Function (lines 1-3) overlaps with range [2-4], plus print statement on line 4
      expect(results).toHaveLength(2);
      expect(results[0].result?.isInvisible).toBe(true); // Function definition
      expect(results[1].result?.isInvisible).toBe(false); // Print statement
      expect(results[1].lineStart).toBe(4);
    });

    it('includes expression that starts within and ends after range', async () => {
      const script = `print("before")
x <- function() {
  print("in function")
}`;
      const results = await collectResults(script, { lineRange: { from: 1, to: 2 } });

      // Function (lines 2-4) overlaps with range [1-2], plus print statement on line 1
      expect(results).toHaveLength(2);
      expect(results[0].result?.isInvisible).toBe(false); // Print statement
      expect(results[0].lineStart).toBe(1);
      expect(results[1].result?.isInvisible).toBe(true); // Function definition
    });

    it('includes expression fully contained within range', async () => {
      const script = `print("before")
print("middle")
print("after")`;
      const results = await collectResults(script, { lineRange: { from: 1, to: 3 } });

      expect(results).toHaveLength(3);
    });

    it('excludes expression completely before range', async () => {
      const script = 'print("before")\nprint("target")\nprint("after")';
      const results = await collectResults(script, { lineRange: { from: 2, to: 2 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(2);
    });

    it('excludes expression completely after range', async () => {
      const script = 'print("before")\nprint("target")\nprint("after")';
      const results = await collectResults(script, { lineRange: { from: 1, to: 1 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(1);
    });
  });
});
