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
 * Fetches the executor.py file (same one used by server) from static assets.
 */
async function loadExecutor(): Promise<void> {
  if (executorLoaded) return;

  const pyodide = getPyodide();

  // Fetch executor.py from static assets
  // This is the same file used by the Python server backend
  const response = await fetch('/executor.py');
  if (!response.ok) {
    throw new Error(`Failed to load executor.py: ${response.statusText}`);
  }

  const executorCode = await response.text();

  // Load the executor module into Pyodide
  await pyodide.runPythonAsync(executorCode);

  console.log('[Pyodide] Loaded executor module from /executor.py');
  executorLoaded = true;
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
