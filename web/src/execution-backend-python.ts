/**
 * Python server backend using SSE streaming.
 * Connects to local Python server for code execution with real-time results.
 */

export interface OutputItem {
  type: 'stdout' | 'stderr' | 'error' | 'warning' | 'message' | 'markdown' | 'dataframe';
  content: string;
}

export interface Expression {
  id: number;
  lineStart: number;
  lineEnd: number;
  result?: ExpressionResult;
}

export interface ExpressionResult {
  output: OutputItem[];
  images?: ImageBitmap[];
  isInvisible?: boolean;
}

// Global counter for expression IDs
let globalIdCounter = 1;

export class PythonServerBackend {
  private baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:8888') {
    this.baseUrl = baseUrl;
  }

  /**
   * Execute a Python script with SSE streaming.
   * Yields results as each statement completes.
   */
  async *executeScript(
    script: string,
    options?: {
      lineRange?: { from: number; to: number };
      scriptName?: string;
    }
  ): AsyncGenerator<Expression, void, unknown> {
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

          // Handle result event (statement execution result)
          // Convert base64 image data URLs to ImageBitmap objects
          let images: ImageBitmap[] | undefined;
          if (data.images && data.images.length > 0) {
            images = await Promise.all(
              data.images.map(async (dataUrl: string) => {
                // Convert data URL to Blob
                const response = await fetch(dataUrl);
                const blob = await response.blob();
                // Convert Blob to ImageBitmap
                return await createImageBitmap(blob);
              })
            );
          }

          yield {
            id: globalIdCounter++,
            lineStart: data.lineStart,
            lineEnd: data.lineEnd,
            result: {
              output: data.output,
              isInvisible: data.isInvisible,
              images,
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
