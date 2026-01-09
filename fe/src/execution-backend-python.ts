/**
 * Python server backend using WebSocket streaming.
 * Connects to local Python server for code execution with real-time results.
 */

import { WebSocketClient } from "./websocket-client";

export interface OutputItem {
  // MIME types: 'text/plain', 'text/html', 'text/markdown', 'image/png', 'application/json'
  // Stream types: 'stdout', 'stderr', 'error'
  type: string;
  content: string;
}

export type ExpressionState = "pending" | "executing" | "done" | "cancelled";

export interface Expression {
  id: number;
  lineStart: number;
  lineEnd: number;
  state: ExpressionState;
  result?: ExpressionResult;
}

export interface ExpressionResult {
  output: OutputItem[];
  isInvisible?: boolean;
}

export interface CancelledExpression {
  lineStart: number;
  lineEnd: number;
}

// Events yielded by executeScript
export type ExecutionEvent =
  | { type: "expressions"; expressions: Expression[] }
  | { type: "done"; expression: Expression }
  | { type: "cancelled"; expressions: CancelledExpression[] };

// Global counter for expression IDs
let globalIdCounter = 1;

export class PythonServerBackend {
  private wsClient: WebSocketClient | null = null;

  /**
   * Set the WebSocket client to use for execution.
   * This should be called with the client from useScriptFile.
   */
  setWebSocketClient(client: WebSocketClient | null): void {
    this.wsClient = client;
  }

  /**
   * Execute a Python script with WebSocket streaming.
   * Yields events as execution progresses: pending, executing, done.
   */
  async *executeScript(
    script: string,
    options: {
      sessionId: string;
      lineRange?: { from: number; to: number };
      scriptName?: string;
      reset?: boolean;
    }
  ): AsyncGenerator<ExecutionEvent, void, unknown> {
    if (!this.wsClient) {
      throw new Error("WebSocket client not set");
    }

    if (!this.wsClient.isConnected) {
      throw new Error("WebSocket not connected");
    }

    // Track expressions by their order for correlating results
    const expressionList: Expression[] = [];
    let nextResultIndex = 0;

    try {
      for await (const msg of this.wsClient.executeStream({
        script,
        lineRange: options.lineRange,
        scriptName: options.scriptName,
        reset: options.reset,
      })) {
        // Handle expressions list (first event from backend)
        if (msg.type === "expressions") {
          const expressions: Expression[] = msg.expressions.map(
            (expr: { lineStart: number; lineEnd: number }) => {
              const id = globalIdCounter++;
              return {
                id,
                lineStart: expr.lineStart,
                lineEnd: expr.lineEnd,
                state: "pending" as const,
              };
            }
          );
          expressionList.push(...expressions);
          yield { type: "expressions", expressions };
          continue;
        }

        if (msg.type === "cancelled") {
          const cancelled: CancelledExpression[] = msg.expressions.map(
            (expr: { lineStart: number; lineEnd: number }) => ({
              lineStart: expr.lineStart,
              lineEnd: expr.lineEnd,
            })
          );
          yield { type: "cancelled", expressions: cancelled };
          continue;
        }

        // Handle result event (statement execution complete)
        if (msg.type === "result") {
          const expr = expressionList[nextResultIndex++];
          const id = expr?.id ?? globalIdCounter++;
          yield {
            type: "done",
            expression: {
              id,
              lineStart: msg.lineStart,
              lineEnd: msg.lineEnd,
              state: "done" as const,
              result: {
                output: msg.output,
                isInvisible: msg.isInvisible,
              },
            },
          };
        }
      }
    } catch (err) {
      // Re-throw with more context
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(String(err));
    }
  }

  /**
   * Reset the execution namespace.
   */
  async reset(): Promise<void> {
    if (this.wsClient?.isConnected) {
      this.wsClient.send({ type: "reset" });
    }
  }

  /**
   * Interrupt the current execution.
   */
  interrupt(): void {
    if (this.wsClient?.isConnected) {
      this.wsClient.send({ type: "interrupt" });
    }
  }

  /**
   * Check if the WebSocket is connected.
   */
  isAvailable(): boolean {
    return this.wsClient?.isConnected ?? false;
  }
}
