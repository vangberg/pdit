import { useEffect, useState } from "react";

interface UseScriptFileResult {
  code: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to load a script file from the backend.
 *
 * @param scriptPath - Absolute path to the script file (from URL query param)
 * @param defaultCode - Default code to use if no script path provided or on error
 * @returns Object with code content, loading state, and error
 */
export function useScriptFile(
  scriptPath: string | null,
  defaultCode: string
): UseScriptFileResult {
  const [code, setCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadScript = async () => {
      // No script path provided, use default code
      if (!scriptPath) {
        setCode(defaultCode);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `/api/read-file?path=${encodeURIComponent(scriptPath)}`
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load script: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        setCode(data.content);
      } catch (err) {
        console.error("Error loading script:", err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        // Fall back to default code on error
        setCode(defaultCode);
      } finally {
        setIsLoading(false);
      }
    };

    loadScript();
  }, [scriptPath, defaultCode]);

  return { code, isLoading, error };
}
