import React, { useState, useEffect, useCallback } from "react";
import { Script } from "./Script";
import { extractAndStoreToken, removeTokenFromUrl, setAuthErrorCallback } from "./auth";
import { AuthErrorProvider, useAuthError } from "./auth-error-context";
import "./style.css";

function AppContent() {
  const { hasAuthError, setAuthError } = useAuthError();

  // Register auth error callback
  useEffect(() => {
    setAuthErrorCallback(setAuthError);
  }, [setAuthError]);

  // Extract and store auth token from URL BEFORE first render
  // This must happen synchronously so API calls have the token available
  const [{ scriptPath: initialScriptPath }] = useState(() => {
    const hasToken = extractAndStoreToken();
    if (hasToken) {
      // Remove token from URL for security (it's now in localStorage)
      removeTokenFromUrl();
    }

    const params = new URLSearchParams(window.location.search);
    return {
      scriptPath: params.get("script"),
    };
  });
  const [scriptPath, setScriptPath] = useState(initialScriptPath);

  useEffect(() => {
    const handlePopState = () => {
      const newPath = new URLSearchParams(window.location.search).get("script");
      setScriptPath(newPath);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handlePathChange = useCallback((newPath: string) => {
    const url = new URL(window.location.href);
    if (newPath) {
      url.searchParams.set("script", newPath);
    } else {
      url.searchParams.delete("script");
    }
    window.history.pushState({}, "", url);
    setScriptPath(newPath || null);
  }, []);

  return (
    <Script
      key={scriptPath || "no-script"}
      scriptPath={scriptPath}
      onPathChange={handlePathChange}
      hasAuthError={hasAuthError}
    />
  );
}

function App() {
  return (
    <AuthErrorProvider>
      <AppContent />
    </AuthErrorProvider>
  );
}

export default App;
