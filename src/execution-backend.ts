/**
 * Abstract backend interface for Python execution.
 * Allows switching between Pyodide (browser) and Python server (local) backends.
 */

export interface OutputItem {
  type: 'stdout' | 'stderr' | 'error' | 'warning' | 'message';
  text: string;
}

export interface Statement {
  nodeIndex: number;
  lineStart: number;
  lineEnd: number;
  code: string;
  isExpr: boolean;
}

export interface ExpressionResult {
  output: OutputItem[];
  images?: ImageBitmap[];
  isInvisible?: boolean;
}

export interface Expression {
  id: number;
  lineStart: number;
  lineEnd: number;
  result?: ExpressionResult;
}

export interface ExecutionBackend {
  /**
   * Execute Python statements and yield results.
   */
  executeStatements(
    statements: Statement[],
    options?: {
      lineRange?: { from: number; to: number };
    }
  ): AsyncGenerator<Expression, void, unknown>;

  /**
   * Reset the execution environment.
   */
  reset(): Promise<void>;
}
