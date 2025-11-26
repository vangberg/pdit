import { useEffect, useState, useRef } from "react";

interface UseScriptFileOptions {
  watchForChanges?: boolean;
  onFileChange?: (newContent: string) => void;
}

interface UseScriptFileResult {
  code: string | null;
  diskContent: string | null;
  isLoading: boolean;
  isWatching: boolean;
  error: Error | null;
}

/**
 * Hook to load a script file from the backend and optionally watch for changes.
 *
 * @param scriptPath - Absolute path to the script file (from URL query param)
 * @param defaultCode - Default code to use if no script path provided or on error
 * @param options - Configuration options
 * @returns Object with code content, disk content, loading state, and error
 */
export function useScriptFile(
  scriptPath: string | null,
  defaultCode: string,
  options: UseScriptFileOptions = {}
): UseScriptFileResult {
  const { watchForChanges = false, onFileChange } = options;

  const [code, setCode] = useState<string | null>(null);
  const [diskContent, setDiskContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Load initial file content
  useEffect(() => {
    const loadScript = async () => {
      // No script path provided, use default code
      if (!scriptPath) {
        setCode(defaultCode);
        setDiskContent(defaultCode);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/read-file?path=${encodeURIComponent(scriptPath)}`
        );

        console.log("Fetch response:", response);

        if (!response.ok) {
          throw new Error(`File not found: ${scriptPath}`);
        }

        const data = await response.json();
        setCode(data.content);
        setDiskContent(data.content);
      } catch (err) {
        console.error("Error loading script:", err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
      } finally {
        setIsLoading(false);
      }
    };

    loadScript();
  }, [scriptPath, defaultCode]);

  // Watch for file changes
  useEffect(() => {
    if (!watchForChanges || !scriptPath || isLoading) {
      return;
    }

    try {
      setIsWatching(true);

      // Create EventSource for SSE
      const eventSource = new EventSource(
        `/api/watch-file?path=${encodeURIComponent(scriptPath)}`
      );

      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "fileChanged") {
          setDiskContent(data.content);
          if (onFileChange) {
            onFileChange(data.content);
          }
        } else if (data.type === "fileDeleted") {
          setError(new Error("File was deleted"));
          eventSource.close();
        } else if (data.type === "error") {
          setError(new Error(data.message));
          eventSource.close();
        }
      };

      eventSource.onerror = (err) => {
        console.error("EventSource error:", err);
        setError(new Error("Connection to file watcher lost"));
        setIsWatching(false);
      };

      eventSource.onopen = () => {
        setIsWatching(true);
      };
    } catch (err) {
      console.error("Error watching file:", err);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
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
  }, [watchForChanges, scriptPath, isLoading, onFileChange]);

  return { code, diskContent, isLoading, isWatching, error };
}
