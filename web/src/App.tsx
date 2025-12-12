import React, { useState, useEffect, useCallback } from "react";
import { Script } from "./Script";
import "./style.css";

function App() {
  // Parse URL params once on mount
  const [{ scriptPath: initialScriptPath, autorun: initialAutorun }] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      scriptPath: params.get("script"),
      autorun: params.has("autorun"),
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

  return <Script scriptPath={scriptPath} onPathChange={handlePathChange} initialAutorun={initialAutorun} />;
}

export default App;