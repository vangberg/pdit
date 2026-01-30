/**
 * WebSocket client for unified session communication.
 * Handles file watching, code execution, and interrupts.
 */

import { getAuthToken } from "./api-auth";
import type { OutputItem } from "./execution-backend-python";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected";

// Messages from server to client
export type ServerMessage =
  | { type: "initial"; path: string; content: string; timestamp: number }
  | { type: "fileChanged"; path: string; content: string; timestamp: number }
  | { type: "fileDeleted"; path: string; timestamp: number }
  | { type: "expressions"; expressions: Array<{ lineStart: number; lineEnd: number }> }
  | { type: "stream"; lineStart: number; lineEnd: number; output: OutputItem[] }
  | { type: "result"; lineStart: number; lineEnd: number; output: OutputItem[]; isInvisible: boolean }
  | { type: "cancelled"; expressions: Array<{ lineStart: number; lineEnd: number }> }
  | { type: "complete" }
  | { type: "busy" }
  | { type: "error"; message: string };

// Messages from client to server
export type ClientMessage =
  | { type: "watch"; path: string }
  | { type: "execute"; script: string; lineRange?: { from: number; to: number }; scriptName?: string; reset?: boolean }
  | { type: "interrupt" }
  | { type: "reset" };

export interface WebSocketClientOptions {
  sessionId: string;
  onConnectionChange?: (state: ConnectionState) => void;
  onMessage?: (message: ServerMessage) => void;
}

type MessageHandler = (msg: ServerMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private connectionState: ConnectionState = "disconnected";
  private messageHandlers = new Map<string, MessageHandler>();
  private onConnectionChange?: (state: ConnectionState) => void;
  private intentionallyClosed = false;
  private pendingWatchPath: string | null = null;

  constructor(options: WebSocketClientOptions) {
    this.sessionId = options.sessionId;
    this.onConnectionChange = options.onConnectionChange;
    if (options.onMessage) {
      this.addMessageHandler("default", options.onMessage);
    }
  }

  connect(): void {
    this.intentionallyClosed = false;
    this.setConnectionState("connecting");

    const token = getAuthToken();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = new URL(`${protocol}//${window.location.host}/ws/session`);
    url.searchParams.set("sessionId", this.sessionId);
    if (token) {
      url.searchParams.set("token", token);
    }

    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      this.setConnectionState("connected");

      // Re-send watch request if we were watching before
      if (this.pendingWatchPath) {
        this.send({ type: "watch", path: this.pendingWatchPath });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        this.messageHandlers.forEach((handler) => handler(msg));
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      if (!this.intentionallyClosed && event.code !== 1000) {
        this.setConnectionState("disconnected");
        return;
      }
      this.setConnectionState("disconnected");
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Track watch path for reconnection
      if (message.type === "watch") {
        this.pendingWatchPath = message.path;
      }
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Execute code and yield results as an async generator.
   * Throws if already busy.
   */
  async *executeStream(options: {
    script: string;
    lineRange?: { from: number; to: number };
    scriptName?: string;
    reset?: boolean;
  }): AsyncGenerator<ServerMessage, void, unknown> {
    const messageQueue: ServerMessage[] = [];
    let resolveWait: (() => void) | null = null;
    let done = false;
    let error: Error | null = null;

    const handlerId = `execute-${Date.now()}-${Math.random()}`;

    const handler: MessageHandler = (msg) => {
      // Filter to execution-related messages
      if (
        msg.type === "expressions" ||
        msg.type === "stream" ||
        msg.type === "result" ||
        msg.type === "cancelled" ||
        msg.type === "complete" ||
        msg.type === "busy" ||
        msg.type === "error"
      ) {
        if (msg.type === "busy") {
          error = new Error("Execution already in progress");
          done = true;
        } else if (msg.type === "error") {
          error = new Error(msg.message);
          done = true;
        } else if (msg.type === "complete") {
          done = true;
        } else {
          messageQueue.push(msg);
        }

        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      }
    };

    this.addMessageHandler(handlerId, handler);

    try {
      // Send execute request
      this.send({
        type: "execute",
        script: options.script,
        lineRange: options.lineRange,
        scriptName: options.scriptName,
        reset: options.reset,
      });

      // Yield messages as they arrive
      while (!done || messageQueue.length > 0) {
        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        } else if (!done) {
          await new Promise<void>((r) => {
            resolveWait = r;
          });
        }
      }

      if (error) {
        throw error;
      }
    } finally {
      this.removeMessageHandler(handlerId);
    }
  }

  addMessageHandler(id: string, handler: MessageHandler): void {
    this.messageHandlers.set(id, handler);
  }

  removeMessageHandler(id: string): void {
    this.messageHandlers.delete(id);
  }

  close(): void {
    this.intentionallyClosed = true;
    this.pendingWatchPath = null;
    this.ws?.close(1000);
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.onConnectionChange?.(state);
  }

  get state(): ConnectionState {
    return this.connectionState;
  }

  get isConnected(): boolean {
    return this.connectionState === "connected";
  }
}
