/**
 * CommManager - Bidirectional communication manager for Jupyter widgets.
 * 
 * Handles WebSocket communication between the frontend and the kernel
 * for widget state synchronization.
 */

export interface CommMessageData {
  method?: string;
  state?: Record<string, unknown>;
  buffer_paths?: string[];
}

export interface CommMessage {
  type: 'comm_msg';
  comm_id: string;
  data: CommMessageData;
}

export type StateChangeCallback = (state: Record<string, unknown>) => void;

/**
 * Model class that tracks widget state and communicates with the kernel.
 */
export class WidgetModel {
  private _state: Record<string, unknown>;
  private _callbacks: Map<string, StateChangeCallback[]> = new Map();
  private _commManager: CommManager;
  readonly commId: string;

  constructor(commId: string, initialState: Record<string, unknown>, commManager: CommManager) {
    this.commId = commId;
    this._state = { ...initialState };
    this._commManager = commManager;
  }

  /**
   * Get a value from the model state.
   */
  get(key: string): unknown {
    return this._state[key];
  }

  /**
   * Set a value in the model state.
   * This triggers local callbacks but does NOT sync to kernel until save_changes() is called.
   */
  set(key: string, value: unknown): void {
    const oldValue = this._state[key];
    if (oldValue !== value) {
      this._state[key] = value;
      this._triggerCallbacks(`change:${key}`);
    }
  }

  /**
   * Save changes to the kernel.
   * Sends all pending state changes via the CommManager.
   */
  save_changes(): void {
    this._commManager.sendCommMsg(this.commId, {
      method: 'update',
      state: this._state
    });
  }

  /**
   * Register a callback for state changes.
   */
  on(event: string, callback: StateChangeCallback): void {
    const callbacks = this._callbacks.get(event) || [];
    callbacks.push(callback);
    this._callbacks.set(event, callbacks);
  }

  /**
   * Remove a callback for state changes.
   */
  off(event: string, callback?: StateChangeCallback): void {
    if (!callback) {
      this._callbacks.delete(event);
    } else {
      const callbacks = this._callbacks.get(event) || [];
      const index = callbacks.indexOf(callback);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Update state from kernel (called by CommManager when receiving updates).
   */
  _updateFromKernel(state: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(state)) {
      const oldValue = this._state[key];
      if (oldValue !== value) {
        this._state[key] = value;
        this._triggerCallbacks(`change:${key}`);
      }
    }
  }

  private _triggerCallbacks(event: string): void {
    const callbacks = this._callbacks.get(event) || [];
    for (const callback of callbacks) {
      try {
        callback(this._state);
      } catch (err) {
        console.error(`Error in widget callback for ${event}:`, err);
      }
    }
  }
}

/**
 * CommManager - Manages WebSocket connection and widget models.
 */
export class CommManager {
  private ws: WebSocket | null = null;
  private models: Map<string, WidgetModel> = new Map();
  private sessionId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pendingMessages: CommMessage[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.connect();
  }

  /**
   * Connect to the WebSocket endpoint.
   */
  private connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/comm/${this.sessionId}`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('[CommManager] WebSocket connected');
      this.reconnectAttempts = 0;
      // Send any pending messages
      for (const msg of this.pendingMessages) {
        this.ws?.send(JSON.stringify(msg));
      }
      this.pendingMessages = [];
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (err) {
        console.error('[CommManager] Error parsing message:', err);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('[CommManager] WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('[CommManager] WebSocket closed');
      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`[CommManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
      }
    };
  }

  /**
   * Handle incoming message from WebSocket.
   */
  private handleMessage(data: { type: string; comm_id?: string; state?: Record<string, unknown> }): void {
    if (data.type === 'comm_msg_ack') {
      // Acknowledgment received, nothing to do
      console.log('[CommManager] Received ack for comm_id:', data.comm_id);
    } else if (data.type === 'comm_update' && data.comm_id && data.state) {
      // State update from kernel
      const model = this.models.get(data.comm_id);
      if (model) {
        model._updateFromKernel(data.state);
      }
    }
  }

  /**
   * Register a widget model with the CommManager.
   */
  registerModel(commId: string, initialState: Record<string, unknown>): WidgetModel {
    const model = new WidgetModel(commId, initialState, this);
    this.models.set(commId, model);
    return model;
  }

  /**
   * Get a registered model by comm ID.
   */
  getModel(commId: string): WidgetModel | undefined {
    return this.models.get(commId);
  }

  /**
   * Send a comm_msg to the kernel.
   */
  sendCommMsg(commId: string, data: CommMessageData): void {
    const message: CommMessage = {
      type: 'comm_msg',
      comm_id: commId,
      data
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is ready
      this.pendingMessages.push(message);
    }
  }

  /**
   * Close the WebSocket connection.
   */
  close(): void {
    this.maxReconnectAttempts = 0; // Prevent reconnection
    this.ws?.close();
    this.ws = null;
    this.models.clear();
  }
}

// Global CommManager instances by session ID
const commManagers: Map<string, CommManager> = new Map();

/**
 * Get or create a CommManager for a session.
 */
export function getCommManager(sessionId: string): CommManager {
  let manager = commManagers.get(sessionId);
  if (!manager) {
    manager = new CommManager(sessionId);
    commManagers.set(sessionId, manager);
  }
  return manager;
}

/**
 * Close and remove a CommManager for a session.
 */
export function closeCommManager(sessionId: string): void {
  const manager = commManagers.get(sessionId);
  if (manager) {
    manager.close();
    commManagers.delete(sessionId);
  }
}
