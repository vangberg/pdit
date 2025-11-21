/**
 * Python server backend for local Python execution.
 * Communicates with a FastAPI server running locally.
 */

import type {
  ExecutionBackend,
  Expression,
  OutputItem,
  Statement
} from './execution-backend';

let globalIdCounter = 1;

interface ExecuteResponse {
  results: Array<{
    nodeIndex: number;
    lineStart: number;
    lineEnd: number;
    output: OutputItem[];
    isInvisible: boolean;
  }>;
}

export class PythonServerBackend implements ExecutionBackend {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://127.0.0.1:8888') {
    this.baseUrl = baseUrl;
  }

  async *executeStatements(
    statements: Statement[],
    options?: {
      lineRange?: { from: number; to: number };
    }
  ): AsyncGenerator<Expression, void, unknown> {
    try {
      // Send all statements to the server
      const response = await fetch(`${this.baseUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statements: statements.map(stmt => ({
            code: stmt.code,
            nodeIndex: stmt.nodeIndex,
            lineStart: stmt.lineStart,
            lineEnd: stmt.lineEnd,
            isExpr: stmt.isExpr,
          })),
          lineRange: options?.lineRange,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const data: ExecuteResponse = await response.json();

      // Yield results
      for (const result of data.results) {
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
    } catch (error) {
      console.error('Error executing code on Python server:', error);
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/reset`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error resetting Python server:', error);
      throw error;
    }
  }

  /**
   * Execute a script directly (server will parse it).
   * This is more efficient than parsing client-side and sending statements.
   */
  async *executeScript(
    script: string,
    options?: {
      lineRange?: { from: number; to: number };
    }
  ): AsyncGenerator<Expression, void, unknown> {
    try {
      const response = await fetch(`${this.baseUrl}/execute-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script,
          lineRange: options?.lineRange,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const data: ExecuteResponse = await response.json();

      // Yield results
      for (const result of data.results) {
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
    } catch (error) {
      console.error('Error executing script on Python server:', error);
      throw error;
    }
  }

  /**
   * Check if the Python server is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
