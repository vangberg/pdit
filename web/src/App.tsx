import React, { useState, useEffect, useCallback } from "react";
import { Script } from "./Script";
import "./style.css";

function App() {
  // Manage script path in state to support client-side navigation
  const [scriptPath, setScriptPath] = useState(() =>
    new URLSearchParams(window.location.search).get("script")
  );

  // Print mode: clean output-only view for PDF generation
  const [printMode] = useState(() =>
    new URLSearchParams(window.location.search).get("print") === "true"
  );

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

  return <Script scriptPath={scriptPath} onPathChange={handlePathChange} printMode={printMode} />;
}

export default App;