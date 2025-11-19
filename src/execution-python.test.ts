import { describe, it, expect, beforeAll } from 'vitest';
import { executeScript, Expression } from './execution-python';
import { initializePyodide } from './pyodide-instance';

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

describe('executeScript (Python)', () => {
  beforeAll(async () => {
    // Ensure Pyodide is initialized before running tests
    await initializePyodide();
  }, 30000); // 30 second timeout for Pyodide initialization

  describe('without lineRange', () => {
    it('executes all statements in the script', async () => {
      const script = 'x = 1\ny = 2\nz = 3';
      const results = await collectResults(script);

      // Should execute all three statements with invisible output
      expect(results).toHaveLength(3);
      expect(results[0].result?.isInvisible).toBe(true);
      expect(results[1].result?.isInvisible).toBe(true);
      expect(results[2].result?.isInvisible).toBe(true);
    });

    it('executes all statements with output', async () => {
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

    it('displays expression values (REPL behavior)', async () => {
      const script = 'x = 5\nx';
      const results = await collectResults(script);

      expect(results).toHaveLength(2);
      expect(results[0].result?.isInvisible).toBe(true); // Assignment
      expect(results[1].result?.isInvisible).toBe(false); // Expression evaluation
      expect(results[1].result?.output[0].text).toContain('5');
    });
  });

  describe('with lineRange - single line', () => {
    it('executes only the statement on the specified line', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const results = await collectResults(script, { lineRange: { from: 2, to: 2 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(2);
      expect(results[0].lineEnd).toBe(2);
      expect(results[0].result?.output[0].text).toContain('second');
    });

    it('executes statement on line 1', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const results = await collectResults(script, { lineRange: { from: 1, to: 1 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(1);
      expect(results[0].result?.output[0].text).toContain('first');
    });

    it('executes statement on last line', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")';
      const results = await collectResults(script, { lineRange: { from: 3, to: 3 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(3);
      expect(results[0].result?.output[0].text).toContain('third');
    });
  });

  describe('with lineRange - multi-line statements', () => {
    it('executes entire multi-line statement when cursor is on first line', async () => {
      const script = `def my_func():
    print("hello from function")
    return 42
print("outside")`;
      const results = await collectResults(script, { lineRange: { from: 1, to: 1 } });

      // Should execute the function definition (lines 1-3) with invisible output
      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(1);
      expect(results[0].lineEnd).toBe(3);
      expect(results[0].result?.isInvisible).toBe(true);
    });

    it('executes entire multi-line statement when cursor is on middle line', async () => {
      const script = `def my_func():
    print("hello from function")
    return 42
print("outside")`;
      const results = await collectResults(script, { lineRange: { from: 2, to: 2 } });

      // Should execute the function definition (lines 1-3) with invisible output
      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(1);
      expect(results[0].lineEnd).toBe(3);
      expect(results[0].result?.isInvisible).toBe(true);
    });

    it('executes entire multi-line statement when cursor is on last line', async () => {
      const script = `def my_func():
    print("hello from function")
    return 42
print("outside")`;
      const results = await collectResults(script, { lineRange: { from: 3, to: 3 } });

      // Should execute the function definition (lines 1-3) with invisible output
      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(1);
      expect(results[0].lineEnd).toBe(3);
      expect(results[0].result?.isInvisible).toBe(true);
    });
  });

  describe('with lineRange - selection spanning multiple statements', () => {
    it('executes all statements in the selected range', async () => {
      const script = 'print("first")\nprint("second")\nprint("third")\nprint("fourth")';
      const results = await collectResults(script, { lineRange: { from: 2, to: 3 } });

      expect(results).toHaveLength(2);
      expect(results[0].lineStart).toBe(2);
      expect(results[0].result?.output[0].text).toContain('second');
      expect(results[1].lineStart).toBe(3);
      expect(results[1].result?.output[0].text).toContain('third');
    });

    it('executes statements partially overlapping the range', async () => {
      const script = `x = 1
def my_func():
    print("in function")
    return 42
print("after")`;
      const results = await collectResults(script, { lineRange: { from: 2, to: 4 } });

      // Should execute the function definition (lines 2-4) with invisible output
      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(2);
      expect(results[0].lineEnd).toBe(4);
      expect(results[0].result?.isInvisible).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty results when range has no statements', async () => {
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
    it('includes statement that starts before and ends within range', async () => {
      const script = `def func():
    print("in function")
    return 42
print("after")`;
      const results = await collectResults(script, { lineRange: { from: 2, to: 4 } });

      // Function (lines 1-3) overlaps with range [2-4], plus print statement on line 4
      expect(results).toHaveLength(2);
      expect(results[0].result?.isInvisible).toBe(true); // Function definition
      expect(results[0].lineStart).toBe(1);
      expect(results[1].result?.isInvisible).toBe(false); // Print statement
      expect(results[1].lineStart).toBe(4);
    });

    it('includes statement that starts within and ends after range', async () => {
      const script = `print("before")
def func():
    print("in function")
    return 42`;
      const results = await collectResults(script, { lineRange: { from: 1, to: 2 } });

      // Function (lines 2-4) overlaps with range [1-2], plus print statement on line 1
      expect(results).toHaveLength(2);
      expect(results[0].result?.isInvisible).toBe(false); // Print statement
      expect(results[0].lineStart).toBe(1);
      expect(results[1].result?.isInvisible).toBe(true); // Function definition
      expect(results[1].lineStart).toBe(2);
    });

    it('includes statement fully contained within range', async () => {
      const script = `print("before")
print("middle")
print("after")`;
      const results = await collectResults(script, { lineRange: { from: 1, to: 3 } });

      expect(results).toHaveLength(3);
    });

    it('excludes statement completely before range', async () => {
      const script = 'print("before")\nprint("target")\nprint("after")';
      const results = await collectResults(script, { lineRange: { from: 2, to: 2 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(2);
    });

    it('excludes statement completely after range', async () => {
      const script = 'print("before")\nprint("target")\nprint("after")';
      const results = await collectResults(script, { lineRange: { from: 1, to: 1 } });

      expect(results).toHaveLength(1);
      expect(results[0].lineStart).toBe(1);
    });
  });

  describe('Python-specific features', () => {
    it('handles list comprehensions', async () => {
      const script = 'squares = [i**2 for i in range(5)]\nsquares';
      const results = await collectResults(script);

      expect(results).toHaveLength(2);
      expect(results[0].result?.isInvisible).toBe(true); // Assignment
      expect(results[1].result?.isInvisible).toBe(false); // Expression
      expect(results[1].result?.output[0].text).toContain('[0, 1, 4, 9, 16]');
    });

    it('handles f-strings', async () => {
      const script = 'name = "Python"\ngreeting = f"Hello, {name}!"\nprint(greeting)';
      const results = await collectResults(script);

      expect(results).toHaveLength(3);
      expect(results[2].result?.output[0].text).toContain('Hello, Python!');
    });

    it('handles class definitions', async () => {
      const script = `class MyClass:
    def __init__(self, value):
        self.value = value

    def get_value(self):
        return self.value

obj = MyClass(42)
obj.get_value()`;
      const results = await collectResults(script);

      expect(results).toHaveLength(3);
      expect(results[0].result?.isInvisible).toBe(true); // Class definition
      expect(results[1].result?.isInvisible).toBe(true); // Object creation
      expect(results[2].result?.isInvisible).toBe(false); // Method call
      expect(results[2].result?.output[0].text).toContain('42');
    });

    it('handles lambda functions', async () => {
      const script = 'square = lambda x: x**2\nsquare(5)';
      const results = await collectResults(script);

      expect(results).toHaveLength(2);
      expect(results[1].result?.output[0].text).toContain('25');
    });

    it('handles try-except blocks', async () => {
      const script = `try:
    result = 10 / 0
except ZeroDivisionError:
    result = "error caught"
result`;
      const results = await collectResults(script);

      expect(results).toHaveLength(2);
      expect(results[1].result?.output[0].text).toContain('error caught');
    });

    it('captures stderr output', async () => {
      const script = 'import sys\nprint("error message", file=sys.stderr)';
      const results = await collectResults(script);

      expect(results).toHaveLength(2);
      expect(results[1].result?.output.some(o => o.type === 'stderr')).toBe(true);
      expect(results[1].result?.output.find(o => o.type === 'stderr')?.text).toContain('error message');
    });
  });

  describe('error handling', () => {
    it('captures syntax errors', async () => {
      const script = 'x = 1\nif True\nprint("hello")';
      const results = await collectResults(script);

      // Due to AST parsing, the entire script is treated as one statement on syntax error
      expect(results).toHaveLength(1);
      expect(results[0].result?.output.some(o => o.type === 'error')).toBe(true);
    });

    it('captures runtime errors', async () => {
      const script = 'x = 1\ny = x / 0';
      const results = await collectResults(script);

      expect(results).toHaveLength(2);
      expect(results[0].result?.isInvisible).toBe(true); // First statement succeeds
      expect(results[1].result?.output.some(o => o.type === 'error')).toBe(true);
      expect(results[1].result?.output.find(o => o.type === 'error')?.text).toMatch(/ZeroDivisionError/i);
    });

    it('continues execution after error', async () => {
      const script = 'print("before")\nx = 1 / 0\nprint("after")';
      const results = await collectResults(script);

      expect(results).toHaveLength(3);
      expect(results[0].result?.output[0].text).toContain('before');
      expect(results[1].result?.output.some(o => o.type === 'error')).toBe(true);
      expect(results[2].result?.output[0].text).toContain('after');
    });

    it('captures NameError', async () => {
      const script = 'print(undefined_variable)';
      const results = await collectResults(script);

      expect(results).toHaveLength(1);
      expect(results[0].result?.output.some(o => o.type === 'error')).toBe(true);
      expect(results[0].result?.output.find(o => o.type === 'error')?.text).toMatch(/NameError/i);
    });
  });

  describe('statement parsing', () => {
    it('correctly parses multi-line dictionary', async () => {
      const script = `data = {
    "name": "Python",
    "version": 3.11
}
data["name"]`;
      const results = await collectResults(script);

      expect(results).toHaveLength(2);
      expect(results[0].lineStart).toBe(1);
      expect(results[0].lineEnd).toBe(4);
      expect(results[1].lineStart).toBe(5);
      expect(results[1].result?.output[0].text).toContain('Python');
    });

    it('correctly parses multi-line list', async () => {
      const script = `items = [
    1,
    2,
    3
]
len(items)`;
      const results = await collectResults(script);

      expect(results).toHaveLength(2);
      expect(results[0].lineStart).toBe(1);
      expect(results[0].lineEnd).toBe(5);
      expect(results[1].result?.output[0].text).toContain('3');
    });

    it('correctly parses for loops', async () => {
      const script = `total = 0
for i in range(5):
    total += i
total`;
      const results = await collectResults(script);

      expect(results).toHaveLength(3);
      expect(results[1].lineStart).toBe(2);
      expect(results[1].lineEnd).toBe(3);
      expect(results[2].result?.output[0].text).toContain('10');
    });
  });
});
