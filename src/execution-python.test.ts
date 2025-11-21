import { describe, it, expect, beforeAll } from 'vitest';
import { executeScript, Expression } from './execution-python';
import { initializePyodide } from './pyodide-instance';

describe('executeScript', () => {
  beforeAll(async () => {
    // Initialize Pyodide before running tests
    await initializePyodide();
  }, 60000); // 60 second timeout for Pyodide initialization

  it('executes a simple expression and returns result', async () => {
    const script = '2 + 2';
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(1);
    expect(results[0].lineStart).toBe(1);
    expect(results[0].lineEnd).toBe(1);
    expect(results[0].result?.output).toHaveLength(1);
    expect(results[0].result?.output[0].type).toBe('stdout');
    expect(results[0].result?.output[0].text).toBe('4\n');
  });

  it('executes an assignment statement with no visible output', async () => {
    const script = 'x = 10';
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(1);
    expect(results[0].result?.output).toHaveLength(0);
    expect(results[0].result?.isInvisible).toBe(true);
  });

  it('captures print statement output', async () => {
    const script = 'print("Hello, World!")';
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(1);
    expect(results[0].result?.output).toHaveLength(1);
    expect(results[0].result?.output[0].type).toBe('stdout');
    expect(results[0].result?.output[0].text).toBe('Hello, World!\n');
  });

  it('executes multiple statements in sequence', async () => {
    const script = `x = 5
y = 10
x + y`;
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(3);
    expect(results[0].lineStart).toBe(1);
    expect(results[0].lineEnd).toBe(1);
    expect(results[0].result?.isInvisible).toBe(true);

    expect(results[1].lineStart).toBe(2);
    expect(results[1].lineEnd).toBe(2);
    expect(results[1].result?.isInvisible).toBe(true);

    expect(results[2].lineStart).toBe(3);
    expect(results[2].lineEnd).toBe(3);
    expect(results[2].result?.output[0].text).toBe('15\n');
  });

  it('captures error messages', async () => {
    const script = '1 / 0';
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(1);
    // Should have at least one output (error, and/or stderr traceback)
    expect(results[0].result?.output.length).toBeGreaterThan(0);

    // Check that error information is captured (either in error type or stderr)
    const allOutput = results[0].result?.output.map(o => o.text).join('\n') || '';
    expect(allOutput.toLowerCase()).toContain('zerodivision');
  });

  it('handles syntax errors gracefully', async () => {
    const script = 'if True\n  print("missing colon")';
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    // Syntax errors result in a single expression being returned
    // The exact error handling behavior may vary, but at minimum
    // we should get an expression back without crashing
    expect(results).toHaveLength(1);
    expect(results[0].lineStart).toBe(1);
  });

  it('filters statements by line range', async () => {
    const script = `x = 1
y = 2
z = 3
x + y + z`;
    const results: Expression[] = [];

    for await (const expr of executeScript(script, { lineRange: { from: 2, to: 3 } })) {
      results.push(expr);
    }

    expect(results).toHaveLength(2);
    expect(results[0].lineStart).toBe(2);
    expect(results[1].lineStart).toBe(3);
  });

  it('maintains state across statements', async () => {
    const script = `x = 5
x = x * 2
x`;
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(3);
    expect(results[2].result?.output[0].text).toBe('10\n');
  });

  it('handles multi-line statements', async () => {
    const script = `def greet(name):
    return f"Hello, {name}!"

greet("Python")`;
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(2);
    expect(results[0].lineStart).toBe(1);
    expect(results[0].lineEnd).toBe(2);
    expect(results[0].result?.isInvisible).toBe(true);

    expect(results[1].lineStart).toBe(4);
    expect(results[1].lineEnd).toBe(4);
    expect(results[1].result?.output[0].text).toBe("'Hello, Python!'\n");
  });

  it('handles list comprehensions', async () => {
    const script = '[i**2 for i in range(5)]';
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(1);
    expect(results[0].result?.output[0].text).toBe('[0, 1, 4, 9, 16]\n');
  });

  it('handles expressions that return None', async () => {
    const script = 'None';
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(1);
    expect(results[0].result?.output).toHaveLength(0);
    expect(results[0].result?.isInvisible).toBe(true);
  });

  it('generates unique IDs for each expression', async () => {
    const script = `1
2
3`;
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(3);
    expect(results[0].id).toBeDefined();
    expect(results[1].id).toBeDefined();
    expect(results[2].id).toBeDefined();
    expect(results[0].id).not.toBe(results[1].id);
    expect(results[1].id).not.toBe(results[2].id);
  });

  it('handles import statements', async () => {
    const script = `import math
math.pi`;
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(2);
    expect(results[0].result?.isInvisible).toBe(true);
    expect(results[1].result?.output[0].text).toContain('3.14');
  });

  it('handles mixed stdout and expressions', async () => {
    const script = `print("Starting")
x = 5 + 3
print("Result:")
x`;
    const results: Expression[] = [];

    for await (const expr of executeScript(script)) {
      results.push(expr);
    }

    expect(results).toHaveLength(4);
    expect(results[0].result?.output[0].text).toBe('Starting\n');
    expect(results[1].result?.isInvisible).toBe(true);
    expect(results[2].result?.output[0].text).toBe('Result:\n');
    expect(results[3].result?.output[0].text).toBe('8\n');
  });
});
