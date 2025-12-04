/**
 * Python server backend using SSE streaming.
 * Connects to local Python server for code execution with real-time results.
 */

export interface OutputItem {
  type: 'stdout' | 'stderr' | 'error' | 'warning' | 'message' | 'markdown' | 'dataframe' | 'image';
  content: string;
}

export type ExpressionState = 'pending' | 'executing' | 'done';

export interface Expression {
  id: number;
  nodeIndex: number;
  lineStart: number;
  lineEnd: number;
  state: ExpressionState;
  result?: ExpressionResult;
}

export interface ExpressionResult {
  output: OutputItem[];
  isInvisible?: boolean;
}

// Events yielded by executeScript
export type ExecutionEvent =
  | { type: 'pending'; expressions: Expression[] }
  | { type: 'executing'; nodeIndex: number }
  | { type: 'done'; expression: Expression };

// Global counter for expression IDs
let globalIdCounter = 1;

export class PythonServerBackend {
  private baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:8888') {
    this.baseUrl = baseUrl;
  }

  /**
   * Execute a Python script with SSE streaming.
   * Yields events as execution progresses: pending, executing, done.
   */
  async *executeScript(
    script: string,
    options?: {
      lineRange?: { from: number; to: number };
      scriptName?: string;
    }
  ): AsyncGenerator<ExecutionEvent, void, unknown> {
    // Use Fetch API with POST (EventSource only supports GET)
    const response = await fetch(`${this.baseUrl}/api/execute-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        script,
        scriptName: options?.scriptName,
        lineRange: options?.lineRange,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Parse SSE stream manually
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Map nodeIndex to expression ID for correlation
    const nodeIndexToId = new Map<number, number>();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (delimited by \n\n)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (!message.trim()) continue;

          // Parse SSE format: "data: <json>"
          const dataMatch = message.match(/^data: (.+)$/m);
          if (!dataMatch) continue;

          const data = JSON.parse(dataMatch[1]);

          // Handle completion event
          if (data.type === 'complete') {
            return;
          }

          // Handle error event
          if (data.type === 'error') {
            throw new Error(data.message);
          }

          // Handle pending batch - all expressions before execution starts
          if (data.type === 'pending') {
            const expressions: Expression[] = data.expressions.map(
              (expr: { nodeIndex: number; lineStart: number; lineEnd: number }) => {
                const id = globalIdCounter++;
                nodeIndexToId.set(expr.nodeIndex, id);
                return {
                  id,
                  nodeIndex: expr.nodeIndex,
                  lineStart: expr.lineStart,
                  lineEnd: expr.lineEnd,
                  state: 'pending' as const,
                };
              }
            );
            yield { type: 'pending', expressions };
            continue;
          }

          // Handle executing notification
          if (data.type === 'executing') {
            yield { type: 'executing', nodeIndex: data.nodeIndex };
            continue;
          }

          // Handle result event (statement execution complete)
          const id = nodeIndexToId.get(data.nodeIndex) ?? globalIdCounter++;
          yield {
            type: 'done',
            expression: {
              id,
              nodeIndex: data.nodeIndex,
              lineStart: data.lineStart,
              lineEnd: data.lineEnd,
              state: 'done' as const,
              result: {
                output: data.output,
                isInvisible: data.isInvisible,
              },
            },
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Reset the execution namespace.
   */
  async reset(): Promise<void> {
    await fetch(`${this.baseUrl}/api/reset`, { method: 'POST' });
  }

  /**
   * Check if the server is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1000), // 1 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
