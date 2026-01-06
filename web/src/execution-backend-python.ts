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

type ClientMessage =
  | { type: 'init'; sessionId: string }
  | {
      type: 'execute';
      executionId: string;
      script: string;
      lineRange?: { from: number; to: number };
    }
  | { type: 'interrupt' }
  | { type: 'reset' }
  | { type: 'ping' };

type ServerMessage = Record<string, any> & { type: string };

export class PythonServerBackend {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private initAckResolver: ((msg: ServerMessage) => void) | null = null;
  private activeExecution: {
    executionId: string;
    onMessage: (msg: ServerMessage) => void;
    signal: () => void;
  } | null = null;

  /**
   * Connect to WebSocket server and initialize session.
   */
  private async connect(sessionId: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionId === sessionId) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.sessionId = sessionId;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/execute`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.send({ type: 'init', sessionId });
        this.initAckResolver = (msg: ServerMessage) => {
          if (msg.type !== 'init-ack') return;
          if (msg.sessionId !== sessionId) return;
          this.initAckResolver = null;
          resolve();
        };
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (this.initAckResolver) {
          this.initAckResolver(msg);
          return;
        }
        if (this.activeExecution) {
          this.activeExecution.onMessage(msg);
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.sessionId = null;
        this.connectPromise = null;
        if (this.activeExecution) {
          this.activeExecution.signal();
        }
      };

      this.ws.onerror = (error) => {
        this.ws = null;
        this.sessionId = null;
        this.connectPromise = null;
        reject(error);
      };
    });

    return this.connectPromise;
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    this.ws.send(JSON.stringify(msg));
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
      reset?: boolean;
    }
  ): AsyncGenerator<ExecutionEvent, void, unknown> {
    await this.connect(options.sessionId);

    if (this.activeExecution) {
      throw new Error('Execution already in progress');
    }

    if (options.reset) {
      await this.reset();
    }

    const executionId = crypto.randomUUID();
    const events: ExecutionEvent[] = [];
    let done = false;
    let error: Error | null = null;

    const expressionList: Expression[] = [];
    let notify: (() => void) | null = null;
    const waitForSignal = () =>
      new Promise<void>((resolve) => {
        notify = resolve;
      });
    const signal = () => {
      if (!notify) return;
      const resolve = notify;
      notify = null;
      resolve();
    };

    const onMessage = (msg: ServerMessage) => {
      if (msg.type === 'error') {
        error = new Error(msg.error);
        done = true;
        signal();
        return;
      }

      if (msg.executionId !== executionId) {
        return;
      }

      if (msg.type === 'execution-started') {
        const expressions: Expression[] = (msg.expressions ?? []).map(
          (expr: { nodeIndex: number; lineStart: number; lineEnd: number }) => ({
            id: globalIdCounter++,
            lineStart: expr.lineStart,
            lineEnd: expr.lineEnd,
            state: 'pending' as const,
          })
        );
        expressionList.push(...expressions);
        events.push({ type: 'expressions', expressions });
        signal();
        return;
      }

      if (msg.type === 'expression-done') {
        const expr = expressionList.find(
          (e) => e.lineStart === msg.lineStart && e.lineEnd === msg.lineEnd
        );
        const id = expr?.id ?? globalIdCounter++;
        events.push({
          type: 'done',
          expression: {
            id,
            lineStart: msg.lineStart,
            lineEnd: msg.lineEnd,
            state: 'done' as const,
            result: { output: msg.output ?? [], isInvisible: msg.isInvisible },
          },
        });
        signal();
        return;
      }

      if (msg.type === 'execution-cancelled') {
        events.push({
          type: 'cancelled',
          cancelledExpressions: (msg.cancelledExpressions ?? []) as Array<{
            nodeIndex: number;
            lineStart: number;
            lineEnd: number;
          }>,
        });
        done = true;
        signal();
        return;
      }

      if (msg.type === 'execution-error') {
        error = new Error(msg.error);
        done = true;
        signal();
        return;
      }

      if (msg.type === 'execution-complete') {
        done = true;
        signal();
      }
    };

    this.activeExecution = { executionId, onMessage, signal };

    try {
      this.send({ type: 'execute', executionId, script, lineRange: options.lineRange });

      while (true) {
        while (events.length > 0) {
          yield events.shift()!;
        }

        if (done) {
          if (error) {
            throw error;
          }
          return;
        }

        await waitForSignal();
      }
    } finally {
      if (this.activeExecution?.executionId === executionId) {
        this.activeExecution = null;
      }
    }
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
      this.sessionId = null;
      this.connectPromise = null;
    }
  }
}
