import './style.css'
import { Editor } from './Editor'
import { Preview, PreviewHeight } from './Preview'
import { LineHeight } from './line-heights'
import { DebugPanel } from './DebugPanel'
import React, { useRef, useState, useCallback, useEffect } from 'react'

const initialCode = `// Welcome to CodeMirror, this is a very long, long line!
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));

// Try editing this code!
const greeting = "Hello, CodeMirror!";
console.log(greeting);`

function App() {
  const [editorHeights, setEditorHeights] = useState<LineHeight[]>([]);
  const [previewHeights, setPreviewHeights] = useState<PreviewHeight[]>([]);
  const [targetPreviewHeights, setTargetPreviewHeights] = useState<PreviewHeight[]>([
      { line: 2, height: 300 },  // Example initial target heights
      { line: 4, height: 200 },
  ]);
  const [targetEditorHeights, setTargetEditorHeights] = useState<LineHeight[]>([]);
  const isSyncing = useRef<boolean>(false);

  // Declarative height syncing - runs automatically when heights change
  useEffect(() => {
    if (editorHeights.length === 0 || previewHeights.length === 0) return;
    if (isSyncing.current) return;
    
    isSyncing.current = true;
    
    const maxLines = Math.max(editorHeights.length, previewHeights.length);
    const editorTargets: LineHeight[] = [];
    const previewTargets: PreviewHeight[] = [];
    
    for (let line = 1; line <= maxLines; line++) {
      const editorHeight = editorHeights[line-1]?.height || 0;
      const previewHeight = previewHeights[line-1]?.height || 0;
      const targetHeight = Math.max(editorHeight, previewHeight);
      
      if (targetHeight > 0) {
        editorTargets.push({ line, height: targetHeight });
        previewTargets.push({ line, height: targetHeight });
      }
    }
    
    // Set target heights via props (declarative)
    setTargetEditorHeights(editorTargets);
    setTargetPreviewHeights(previewTargets);
    
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [editorHeights, previewHeights]);

  const handleEditorHeightChange = useCallback((heights: LineHeight[]) => {
    console.log('App received editor heights:', heights.slice(0, 5));
    setEditorHeights(heights);
  }, []);

  const handlePreviewHeightChange = useCallback((heights: PreviewHeight[]) => {
    console.log('App received preview heights:', heights.slice(0, 5));
    setPreviewHeights(heights);
  }, []);

  return (
    <div id="app">
      <div className="split-container">
        <div className="editor-half">
          <Editor 
            initialCode={initialCode}
            onHeightChange={handleEditorHeightChange}
            targetHeights={targetEditorHeights}
          />
        </div>
        <div className="preview-half">
          <Preview 
            onHeightChange={handlePreviewHeightChange}
            targetHeights={targetPreviewHeights}
          />
        </div>
      </div>
      
      {/* <DebugPanel
        editorHeights={editorHeights}
        previewHeights={previewHeights}
        targetEditorHeights={targetEditorHeights}
        targetPreviewHeights={targetPreviewHeights}
        isSyncing={isSyncing.current}
      /> */}
    </div>
  )
}

export default App