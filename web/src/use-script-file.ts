import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  WebSocketClient,
  ConnectionState,
  ServerMessage,
} from "./websocket-client";

interface UseScriptFileOptions {
  onFileChange?: (newContent: string) => void; // Callback when file changes (enables watching)
}

interface UseScriptFileResult {
  code: string | null; // Initial code (from load)
  diskContent: string | null; // Latest content from disk
  isLoading: boolean; // Loading initial file
  connectionState: ConnectionState; // WebSocket connection state
  error: Error | null; // Any errors
  sessionId: string; // Unique session ID for this page load
  wsClient: WebSocketClient | null; // WebSocket client for execution
}

/**
 * Hook to load a script file and optionally watch for changes.
 *
 * Uses a unified WebSocket connection for file watching and code execution.
 * The WebSocket connection lifecycle is tied to the session.
 *
 * @param scriptPath - Absolute path to the script file (from URL query param)
 * @param defaultCode - Default code to use if no script path provided or on error
 * @param options - Optional configuration (provide onFileChange to enable watching)
 * @returns Object with code content, disk content, loading state, connection state, error, and WebSocket client
 */
export function useScriptFile(
  scriptPath: string | null,
  defaultCode: string,
  options: UseScriptFileOptions = {}
): UseScriptFileResult {
  const { onFileChange } = options;

  // Generate stable session ID once on hook init
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  const [code, setCode] = useState<string | null>(null);
  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);

  const hasReceivedInitialContent = useRef(false);
  const onFileChangeRef = useRef(onFileChange);
  const scriptPathRef = useRef(scriptPath);
  const watchRequestSent = useRef(false);

  // Keep refs up to date
  useEffect(() => {
    onFileChangeRef.current = onFileChange;
  }, [onFileChange]);

  useEffect(() => {
    scriptPathRef.current = scriptPath;
    watchRequestSent.current = false; // Reset when path changes
  }, [scriptPath]);

  // Handle WebSocket messages
  const handleMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === "initial") {
      console.log("Received initial file content");
      setCode(msg.content);
      setDiskContent(msg.content);
      setIsLoading(false);
      hasReceivedInitialContent.current = true;
    } else if (msg.type === "fileChanged") {
      console.log("File changed on disk");
      setDiskContent(msg.content);
      if (onFileChangeRef.current) {
        onFileChangeRef.current(msg.content);
      }
    } else if (msg.type === "fileDeleted") {
      setError(new Error("File was deleted"));
    } else if (msg.type === "error") {
      // Only handle file-related errors, not execution errors
      if (!hasReceivedInitialContent.current) {
        setError(new Error(msg.message));
        setIsLoading(false);
      }
    }
  }, []);

  // Handle connection state changes
  const handleConnectionChange = useCallback((state: ConnectionState) => {
    setConnectionState(state);

    if (state === "disconnected" && !hasReceivedInitialContent.current) {
      setError(new Error("Failed to connect to server"));
      setIsLoading(false);
    }

    // When reconnected, re-send watch request
    if (state === "connected") {
      watchRequestSent.current = false;
    }
  }, []);

  // Single effect for WebSocket connection
  useEffect(() => {
    // Reset state
    hasReceivedInitialContent.current = false;
    watchRequestSent.current = false;
    setError(null);

    // No script path -> use default (scratchpad mode)
    if (!scriptPath) {
      setCode(defaultCode);
      setDiskContent(defaultCode);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    // Create WebSocket client
    const client = new WebSocketClient({
      sessionId,
      onConnectionChange: handleConnectionChange,
      onMessage: handleMessage,
    });

    setWsClient(client);
    client.connect();

    // Cleanup: close WebSocket on unmount
    return () => {
      client.close();
      setWsClient(null);
    };
  }, [sessionId, defaultCode, handleMessage, handleConnectionChange]);

  // Send watch request when connected and we have a path
  useEffect(() => {
    if (
      wsClient?.isConnected &&
      scriptPath &&
      !watchRequestSent.current &&
      !hasReceivedInitialContent.current
    ) {
      watchRequestSent.current = true;
      wsClient.send({ type: "watch", path: scriptPath });
    }
  }, [connectionState, scriptPath, wsClient]);

  // Handle scriptPath changes after initial connection
  useEffect(() => {
    if (wsClient?.isConnected && scriptPath) {
      hasReceivedInitialContent.current = false;
      watchRequestSent.current = false;
      setIsLoading(true);
      setError(null);
    }
  }, [scriptPath]);

  return {
    code,
    diskContent,
    isLoading,
    connectionState,
    error,
    sessionId,
    wsClient,
  };
}
