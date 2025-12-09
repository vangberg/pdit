import { describe, it, expect } from 'vitest';
import { executeScript, Expression, ExecutionEvent } from './execution-python';

// Test session ID - each test file uses a unique session
const TEST_SESSION_ID = 'test-session-execution-python';

// Helper to collect done expressions from execution events
async function collectExpressions(
  script: string,
  options?: { lineRange?: { from: number; to: number }; scriptName?: string }
): Promise<Expression[]> {
  const results: Expression[] = [];
  for await (const event of executeScript(script, { sessionId: TEST_SESSION_ID, ...options })) {
    if (event.type === 'done') {
      results.push(event.expression);
    }
  }
  return results;
}

describe('executeScript', () => {

  it('executes a simple expression and returns result', async () => {
    const results = await collectExpressions('2 + 2');

    expect(results).toHaveLength(1);
    expect(results[0].lineStart).toBe(1);
    expect(results[0].lineEnd).toBe(1);
    expect(results[0].result?.output).toHaveLength(1);
    expect(results[0].result?.output[0].type).toBe('stdout');
    expect(results[0].result?.output[0].content).toBe('4\n');
  });

  it('executes an assignment statement with no visible output', async () => {
    const results = await collectExpressions('x = 10');

    expect(results).toHaveLength(1);
    expect(results[0].result?.output).toHaveLength(0);
    expect(results[0].result?.isInvisible).toBe(true);
  });

  it('captures print statement output', async () => {
    const results = await collectExpressions('print("Hello, World!")');

    expect(results).toHaveLength(1);
    expect(results[0].result?.output).toHaveLength(1);
    expect(results[0].result?.output[0].type).toBe('stdout');
    expect(results[0].result?.output[0].content).toBe('Hello, World!\n');
  });

  it('executes multiple statements in sequence', async () => {
    const script = `x = 5
y = 10
x + y`;
    const results = await collectExpressions(script);

    expect(results).toHaveLength(3);
    expect(results[0].lineStart).toBe(1);
    expect(results[0].lineEnd).toBe(1);
    expect(results[0].result?.isInvisible).toBe(true);

    expect(results[1].lineStart).toBe(2);
    expect(results[1].lineEnd).toBe(2);
    expect(results[1].result?.isInvisible).toBe(true);

    expect(results[2].lineStart).toBe(3);
    expect(results[2].lineEnd).toBe(3);
    expect(results[2].result?.output[0].content).toBe('15\n');
  });

  it('captures error messages', async () => {
    const results = await collectExpressions('1 / 0');

    expect(results).toHaveLength(1);
    // Should have at least one output (error, and/or stderr traceback)
    expect(results[0].result?.output.length).toBeGreaterThan(0);

    // Check that error information is captured (either in error type or stderr)
    const allOutput = results[0].result?.output.map(o => o.content).join('\n') || '';
    expect(allOutput.toLowerCase()).toContain('zerodivision');
  });

  it('handles syntax errors gracefully', async () => {
    const results = await collectExpressions('if True\n  print("missing colon")');

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
    const results = await collectExpressions(script, { lineRange: { from: 2, to: 3 } });

    expect(results).toHaveLength(2);
    expect(results[0].lineStart).toBe(2);
    expect(results[1].lineStart).toBe(3);
  });

  it('maintains state across statements', async () => {
    const script = `x = 5
x = x * 2
x`;
    const results = await collectExpressions(script);

    expect(results).toHaveLength(3);
    expect(results[2].result?.output[0].content).toBe('10\n');
  });

  it('handles multi-line statements', async () => {
    const script = `def greet(name):
    return f"Hello, {name}!"

greet("Python")`;
    const results = await collectExpressions(script);

    expect(results).toHaveLength(2);
    expect(results[0].lineStart).toBe(1);
    expect(results[0].lineEnd).toBe(2);
    expect(results[0].result?.isInvisible).toBe(true);

    expect(results[1].lineStart).toBe(4);
    expect(results[1].lineEnd).toBe(4);
    expect(results[1].result?.output[0].content).toBe("'Hello, Python!'\n");
  });

  it('handles list comprehensions', async () => {
    const results = await collectExpressions('[i**2 for i in range(5)]');

    expect(results).toHaveLength(1);
    expect(results[0].result?.output[0].content).toBe('[0, 1, 4, 9, 16]\n');
  });

  it('handles expressions that return None', async () => {
    const results = await collectExpressions('None');

    expect(results).toHaveLength(1);
    expect(results[0].result?.output).toHaveLength(0);
    expect(results[0].result?.isInvisible).toBe(true);
  });

  it('generates unique IDs for each expression', async () => {
    const script = `1
2
3`;
    const results = await collectExpressions(script);

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
    const results = await collectExpressions(script);

    expect(results).toHaveLength(2);
    expect(results[0].result?.isInvisible).toBe(true);
    expect(results[1].result?.output[0].content).toContain('3.14');
  });

  it('handles mixed stdout and expressions', async () => {
    const script = `print("Starting")
x = 5 + 3
print("Result:")
x`;
    const results = await collectExpressions(script);

    expect(results).toHaveLength(4);
    expect(results[0].result?.output[0].content).toBe('Starting\n');
    expect(results[1].result?.isInvisible).toBe(true);
    expect(results[2].result?.output[0].content).toBe('Result:\n');
    expect(results[3].result?.output[0].content).toBe('8\n');
  });

  it('emits expressions event before results', async () => {
    const script = `x = 1
y = 2`;
    const events: ExecutionEvent[] = [];
    for await (const event of executeScript(script, { sessionId: TEST_SESSION_ID })) {
      events.push(event);
    }

    // First event should be expressions with all pending expressions
    expect(events[0].type).toBe('expressions');
    if (events[0].type === 'expressions') {
      expect(events[0].expressions).toHaveLength(2);
      expect(events[0].expressions[0].state).toBe('pending');
      expect(events[0].expressions[1].state).toBe('pending');
    }
    // Followed by done events for each expression
    expect(events.filter(e => e.type === 'done')).toHaveLength(2);
  });

  it('expressions event only includes filtered expressions', async () => {
    const script = `x = 1
y = 2
z = 3`;
    const events: ExecutionEvent[] = [];
    for await (const event of executeScript(script, { sessionId: TEST_SESSION_ID, lineRange: { from: 2, to: 2 } })) {
      events.push(event);
    }

    expect(events[0].type).toBe('expressions');
    if (events[0].type === 'expressions') {
      // Only y = 2 should be included
      expect(events[0].expressions).toHaveLength(1);
      expect(events[0].expressions[0].lineStart).toBe(2);
    }
  });
});
