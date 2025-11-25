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

  const abortControllerRef = useRef<AbortController | null>(null);

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

    const watchFile = async () => {
      // Create abort controller for this watch session
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        setIsWatching(true);

        const response = await fetch(
          `/api/watch-file?path=${encodeURIComponent(scriptPath)}`,
          {
            signal: abortController.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to watch file: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));

              if (data.type === "fileChanged") {
                setDiskContent(data.content);
                if (onFileChange) {
                  onFileChange(data.content);
                }
              } else if (data.type === "fileDeleted") {
                setError(new Error("File was deleted"));
                break;
              } else if (data.type === "error") {
                setError(new Error(data.message));
                break;
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Expected when component unmounts
          return;
        }
        console.error("Error watching file:", err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
      } finally {
        setIsWatching(false);
      }
    };

    watchFile();

    // Cleanup: abort the fetch on unmount or path change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [watchForChanges, scriptPath, isLoading, onFileChange]);

  return { code, diskContent, isLoading, isWatching, error };
}
