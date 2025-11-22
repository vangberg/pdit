/**
 * Pyodide backend for browser-based Python execution.
 * Uses the shared executor module for consistency with server backend.
 */

import { getPyodide } from './pyodide-instance';
import type {
  ExecutionBackend,
  Expression,
  OutputItem,
  Statement
} from './execution-backend';

let globalIdCounter = 1;
let executorLoaded = false;

/**
 * Load the shared executor module into Pyodide.
 * This is the same Python code used by the server backend.
 */
async function loadExecutor(): Promise<void> {
  if (executorLoaded) return;

  const pyodide = getPyodide();

  // Fetch the executor module from the server if available,
  // otherwise use embedded version
  let executorCode: string;

  try {
    // Try to fetch from server (if running local Python backend)
    const response = await fetch('http://127.0.0.1:8888/executor.py');
    if (response.ok) {
      const data = await response.json();
      executorCode = data.code;
      console.log('[Pyodide] Loaded executor from server');
    } else {
      executorCode = getEmbeddedExecutor();
      console.log('[Pyodide] Using embedded executor');
    }
  } catch {
    // Server not available, use embedded version
    executorCode = getEmbeddedExecutor();
    console.log('[Pyodide] Server unavailable, using embedded executor');
  }

  // Load the executor module
  await pyodide.runPythonAsync(executorCode);

  executorLoaded = true;
}

/**
 * Get embedded version of executor for when server is not available.
 * This is a fallback that allows Pyodide to work standalone.
 */
function getEmbeddedExecutor(): string {
  // Embedded executor module - same code as python/src/rdit/executor.py
  return `
# Embedded executor module for Pyodide
import ast
import io
import sys
import traceback
from contextlib import redirect_stdout, redirect_stderr


class OutputItem:
    def __init__(self, type, text):
        self.type = type
        self.text = text

    def to_dict(self):
        return {"type": self.type, "text": self.text}


class Statement:
    def __init__(self, code, node_index, line_start, line_end, is_expr):
        self.code = code
        self.node_index = node_index
        self.line_start = line_start
        self.line_end = line_end
        self.is_expr = is_expr


class ExecutionResult:
    def __init__(self, node_index, line_start, line_end, output, is_invisible):
        self.node_index = node_index
        self.line_start = line_start
        self.line_end = line_end
        self.output = output
        self.is_invisible = is_invisible

    def to_dict(self):
        return {
            "nodeIndex": self.node_index,
            "lineStart": self.line_start,
            "lineEnd": self.line_end,
            "output": [o.to_dict() for o in self.output],
            "isInvisible": self.is_invisible
        }


class PythonExecutor:
    def __init__(self):
        self.namespace = {'__builtins__': __builtins__}

    def reset(self):
        self.namespace.clear()
        self.namespace['__builtins__'] = __builtins__

    def parse_script(self, script):
        try:
            tree = ast.parse(script)
            statements = []

            for i, node in enumerate(tree.body):
                line_start = node.lineno
                line_end = node.end_lineno if hasattr(node, 'end_lineno') and node.end_lineno else node.lineno
                lines = script.split('\\n')
                code_lines = lines[line_start - 1:line_end]
                code = '\\n'.join(code_lines)
                is_expr = isinstance(node, ast.Expr)

                statements.append(Statement(
                    code=code,
                    node_index=i,
                    line_start=line_start,
                    line_end=line_end,
                    is_expr=is_expr
                ))

            return statements

        except SyntaxError:
            return [Statement(
                code=script,
                node_index=0,
                line_start=1,
                line_end=len(script.split('\\n')),
                is_expr=False
            )]

    def execute_statement(self, code, is_expr):
        output = []
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()

        try:
            with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
                mode = 'eval' if is_expr else 'exec'
                compiled = compile(code, '<rdit>', mode)

                if is_expr:
                    result = eval(compiled, self.namespace)
                    if result is not None:
                        print(repr(result))
                else:
                    exec(compiled, self.namespace)

        except Exception:
            error_buffer = io.StringIO()
            traceback.print_exc(file=error_buffer)
            output.append(OutputItem(type="error", text=error_buffer.getvalue()))

        stdout_content = stdout_buffer.getvalue()
        if stdout_content:
            output.append(OutputItem(type="stdout", text=stdout_content))

        stderr_content = stderr_buffer.getvalue()
        if stderr_content:
            output.append(OutputItem(type="stderr", text=stderr_content))

        return output

    def execute_script(self, script, line_range=None):
        statements = self.parse_script(script)
        return self.execute_statements(statements, line_range)

    def execute_statements(self, statements, line_range=None):
        results = []

        for stmt in statements:
            if line_range:
                from_line = line_range.get("from", 0)
                to_line = line_range.get("to", float("inf"))
                if stmt.line_end < from_line or stmt.line_start > to_line:
                    continue

            output = self.execute_statement(stmt.code, stmt.is_expr)
            has_visible_output = len(output) > 0

            results.append(ExecutionResult(
                node_index=stmt.node_index,
                line_start=stmt.line_start,
                line_end=stmt.line_end,
                output=output,
                is_invisible=not has_visible_output
            ))

        return results


_global_executor = None


def get_executor():
    global _global_executor
    if _global_executor is None:
        _global_executor = PythonExecutor()
    return _global_executor


def reset_executor():
    executor = get_executor()
    executor.reset()
`;
}

export class PyodideBackend implements ExecutionBackend {
  private isInitialized = false;

  async *executeStatements(
    statements: Statement[],
    options?: {
      lineRange?: { from: number; to: number };
    }
  ): AsyncGenerator<Expression, void, unknown> {
    if (!this.isInitialized) {
      await loadExecutor();
      this.isInitialized = true;
    }

    const pyodide = getPyodide();

    // Convert statements to Python list
    const statementsJson = JSON.stringify(
      statements.map(stmt => ({
        code: stmt.code,
        node_index: stmt.nodeIndex,
        line_start: stmt.lineStart,
        line_end: stmt.lineEnd,
        is_expr: stmt.isExpr,
      }))
    );

    const lineRangeJson = options?.lineRange ? JSON.stringify(options.lineRange) : 'None';

    // Execute using the shared executor
    const resultsJson = await pyodide.runPythonAsync(`
import json

executor = get_executor()

# Parse statements from JSON
statements_data = json.loads(${JSON.stringify(statementsJson)})
statements = [
    Statement(
        code=s['code'],
        node_index=s['node_index'],
        line_start=s['line_start'],
        line_end=s['line_end'],
        is_expr=s['is_expr']
    )
    for s in statements_data
]

# Execute statements
line_range = ${lineRangeJson}
results = executor.execute_statements(statements, line_range)

# Convert to JSON
json.dumps([r.to_dict() for r in results])
`);

    const results = JSON.parse(resultsJson as string);

    // Yield results
    for (const result of results) {
      yield {
        id: globalIdCounter++,
        lineStart: result.lineStart,
        lineEnd: result.lineEnd,
        result: {
          output: result.output,
          isInvisible: result.isInvisible,
        },
      };
    }
  }

  /**
   * Execute a script directly (more efficient than pre-parsed statements).
   */
  async *executeScript(
    script: string,
    options?: {
      lineRange?: { from: number; to: number };
    }
  ): AsyncGenerator<Expression, void, unknown> {
    if (!this.isInitialized) {
      await loadExecutor();
      this.isInitialized = true;
    }

    const pyodide = getPyodide();

    const lineRangeJson = options?.lineRange ? JSON.stringify(options.lineRange) : 'None';

    // Execute using the shared executor
    const resultsJson = await pyodide.runPythonAsync(`
import json

executor = get_executor()

script = ${JSON.stringify(script)}
line_range = ${lineRangeJson}

# Execute script
results = executor.execute_script(script, line_range)

# Convert to JSON
json.dumps([r.to_dict() for r in results])
`);

    const results = JSON.parse(resultsJson as string);

    // Yield results
    for (const result of results) {
      yield {
        id: globalIdCounter++,
        lineStart: result.lineStart,
        lineEnd: result.lineEnd,
        result: {
          output: result.output,
          isInvisible: result.isInvisible,
        },
      };
    }
  }

  async reset(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    const pyodide = getPyodide();
    await pyodide.runPythonAsync('reset_executor()');
  }
}
