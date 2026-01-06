/**
 * Python server backend using WebSocket.
 * Connects to local Python server for code execution with real-time results.
 */

export interface OutputItem {
  // MIME types: 'text/plain', 'text/html', 'text/markdown', 'image/png', 'application/json'
  // Stream types: 'stdout', 'stderr', 'error'
  type: string;
  content: string;
}

export type ExpressionState = 'pending' | 'executing' | 'done';

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

// Events yielded by executeScript
export type ExecutionEvent =
  | { type: 'expressions'; expressions: Expression[] }
  | { type: 'done'; expression: Expression }
  | {
      type: 'cancelled';
      cancelledExpressions: Array<{
        nodeIndex: number;
        lineStart: number;
        lineEnd: number;
      }>;
    };

// Global counter for expression IDs
let globalIdCounter = 1;

// Message types
interface ClientMessage {
  type: 'init' | 'execute' | 'cancel' | 'get-state' | 'reset' | 'ping' | 'interrupt';
  [key: string]: any;
}

interface ServerMessage {
  type: string;
  [key: string]: any;
}

export class PythonServerBackend {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private messageHandlers = new Map<string, (msg: ServerMessage) => void>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;

  /**
   * Connect to WebSocket server and initialize session.
   */
  private async connect(sessionId: string): Promise<void> {
    // If already connecting, wait for that connection
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    // If already connected to this session, reuse connection
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionId === sessionId) {
      return;
    }

    this.isConnecting = true;
    this.sessionId = sessionId;

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/execute`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        // Send init message
        this.send({ type: 'init', sessionId });

        // Wait for init-ack
        const ackHandler = (msg: ServerMessage) => {
          if (msg.type === 'init-ack') {
            this.messageHandlers.delete('init-ack-promise');
            this.reconnectAttempts = 0;
            this.isConnecting = false;
            resolve();
          }
        };
        this.messageHandlers.set('init-ack-promise', ackHandler);
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;

        // Route to all handlers (allows multiple listeners)
        this.messageHandlers.forEach((handler) => {
          try {
            handler(msg);
          } catch (e) {
            console.error('Handler error:', e);
          }
        });
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
      };

      this.ws.onerror = (error) => {
        this.isConnecting = false;
        reject(error);
      };
    });

    return this.connectionPromise;
  }

  private async handleDisconnect() {
    this.ws = null;
    this.connectionPromise = null;

    // Exponential backoff reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.sessionId) {
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
      this.reconnectAttempts++;

      await new Promise(resolve => setTimeout(resolve, delay));

      try {
        await this.connect(this.sessionId);
      } catch (e) {
        console.error('Reconnection failed:', e);
      }
    }
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.error('WebSocket not connected, cannot send:', msg);
    }
  }

  private on(handlerId: string, handler: (msg: ServerMessage) => void) {
    this.messageHandlers.set(handlerId, handler);
  }

  private off(handlerId: string) {
    this.messageHandlers.delete(handlerId);
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
    // Ensure connected
    await this.connect(options.sessionId);

    const executionId = crypto.randomUUID();
    const events: ExecutionEvent[] = [];
    let done = false;
    let error: Error | null = null;

    // Track expressions for ID assignment
    const expressionList: Expression[] = [];

    // Set up handlers for this execution
    const handlerId = `exec-${executionId}`;

    this.on(handlerId, (msg) => {
      // Only handle messages for this execution
      if (msg.executionId !== executionId) return;

      if (msg.type === 'execution-started') {
        const expressions: Expression[] = msg.expressions.map(
          (expr: { nodeIndex: number; lineStart: number; lineEnd: number }) => {
            const id = globalIdCounter++;
            return {
              id,
              lineStart: expr.lineStart,
              lineEnd: expr.lineEnd,
              state: 'pending' as const,
            };
          }
        );
        expressionList.push(...expressions);
        events.push({ type: 'expressions', expressions });
      } else if (msg.type === 'expression-done') {
        // Find the expression by line range
        const expr = expressionList.find(
          e => e.lineStart === msg.lineStart && e.lineEnd === msg.lineEnd
        );
        const id = expr?.id ?? globalIdCounter++;

        events.push({
          type: 'done',
          expression: {
            id,
            lineStart: msg.lineStart,
            lineEnd: msg.lineEnd,
            state: 'done' as const,
            result: {
              output: msg.output,
              isInvisible: msg.isInvisible,
            },
          },
        });
      } else if (msg.type === 'execution-complete') {
        done = true;
      } else if (msg.type === 'execution-cancelled') {
        events.push({
          type: 'cancelled',
          cancelledExpressions: (msg.cancelledExpressions ?? []) as Array<{
            nodeIndex: number;
            lineStart: number;
            lineEnd: number;
          }>,
        });
        done = true;
      } else if (msg.type === 'execution-error') {
        error = new Error(msg.error);
        done = true;
      }
    });

    // Send execute message
    this.send({
      type: 'execute',
      executionId,
      script,
      scriptName: options.scriptName,
      lineRange: options.lineRange,
      reset: options.reset,
    });

    // Yield events as they arrive
    try {
      while (!done) {
        if (events.length > 0) {
          yield events.shift()!;
        } else {
          // Wait a bit for more events
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Yield remaining events
      while (events.length > 0) {
        yield events.shift()!;
      }

      if (error) {
        throw error;
      }
    } finally {
      // Clean up handler
      this.off(handlerId);
    }
  }

  /**
   * Cancel a running execution.
   */
  cancelExecution(executionId: string) {
    this.send({ type: 'cancel', executionId });
  }

  /**
   * Interrupt the kernel (send SIGINT).
   */
  interrupt() {
    this.send({ type: 'interrupt' });
  }

  /**
   * Reset the execution namespace.
   */
  async reset(): Promise<void> {
    this.send({ type: 'reset' });
  }

  /**
   * Check if the server is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch('/api/health', {
        signal: AbortSignal.timeout(1000), // 1 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Close the WebSocket connection.
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
