import React from "react";
import { Script } from "./Script";
import "./style.css";

function App() {
  // Load script file from URL query parameter
  const scriptPath = new URLSearchParams(window.location.search).get("script");

  return <Script path={scriptPath} />;
}

export default App;