import { useEffect, useState, useRef } from "react";

interface UseScriptFileOptions {
  onFileChange?: (newContent: string) => void; // Callback when file changes (enables watching)
}

interface UseScriptFileResult {
  code: string | null; // Initial code (from load)
  diskContent: string | null; // Latest content from disk
  isLoading: boolean; // Loading initial file
  isWatching: boolean; // SSE connection active
  error: Error | null; // Any errors
}

/**
 * Hook to load a script file and optionally watch for changes.
 *
 * Uses the unified /api/watch-file endpoint which sends initial content
 * via SSE, then streams file changes. This eliminates the need for a
 * separate /api/read-file endpoint.
 *
 * @param scriptPath - Absolute path to the script file (from URL query param)
 * @param defaultCode - Default code to use if no script path provided or on error
 * @param options - Optional configuration (provide onFileChange to enable watching)
 * @returns Object with code content, disk content, loading state, watching state, and error
 */
export function useScriptFile(
  scriptPath: string | null,
  defaultCode: string,
  options: UseScriptFileOptions = {}
): UseScriptFileResult {
  const { onFileChange } = options;
  const watchForChanges = !!onFileChange;

  const [code, setCode] = useState<string | null>(null);
  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const hasReceivedInitialContent = useRef(false);
  const onFileChangeRef = useRef(onFileChange);

  // Keep callback ref up to date
  useEffect(() => {
    onFileChangeRef.current = onFileChange;
  }, [onFileChange]);

  // Single effect for both loading AND watching
  useEffect(() => {
    // No script path → use default
    if (!scriptPath) {
      setCode(defaultCode);
      setDiskContent(defaultCode);
      setIsLoading(false);
      return;
    }

    // Reset state for new path
    hasReceivedInitialContent.current = false;
    setIsLoading(true);
    setError(null);

    try {
      // Create EventSource - handles both initial load AND watching!
      const eventSource = new EventSource(
        `/api/watch-file?path=${encodeURIComponent(scriptPath)}`
      );

      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "initial") {
          // First event - initial file content
          console.log("Received initial file content");
          setCode(data.content);
          setDiskContent(data.content);
          setIsLoading(false);
          hasReceivedInitialContent.current = true;

          // If not watching, close connection after initial load
          if (!watchForChanges) {
            eventSource.close();
          }
        } else if (data.type === "fileChanged") {
          // Subsequent events - file was modified
          console.log("File changed on disk");
          setDiskContent(data.content);
          if (onFileChangeRef.current) {
            onFileChangeRef.current(data.content);
          }
        } else if (data.type === "fileDeleted") {
          setError(new Error("File was deleted"));
          eventSource.close();
        } else if (data.type === "error") {
          setError(new Error(data.message));
          setIsLoading(false);
          eventSource.close();
        }
      };

      eventSource.onerror = (err) => {
        console.error("EventSource error:", err);

        // Close the connection to prevent automatic reconnection
        eventSource.close();

        // Only set error if we haven't received initial content yet
        if (!hasReceivedInitialContent.current) {
          setError(new Error("Failed to load file"));
          setIsLoading(false);
        } else {
          setError(new Error("Connection to file watcher lost"));
        }
        setIsWatching(false);
      };

      eventSource.onopen = () => {
        console.log("EventSource connection opened");
        setIsWatching(watchForChanges);
      };
    } catch (err) {
      console.error("Error setting up file watcher:", err);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false);
      setIsWatching(false);
    }

    // Cleanup: close EventSource on unmount or path change
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setIsWatching(false);
      }
    };
  }, [scriptPath, defaultCode, watchForChanges]);

  return { code, diskContent, isLoading, isWatching, error };
}
