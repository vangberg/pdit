import './style.css'
import { Editor } from './Editor'
import { Preview, PreviewRef, PreviewHeight } from './Preview'
import { LineHeight } from './line-heights'
import React, { useRef, useEffect, useState } from 'react'

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
  const previewRef = useRef<PreviewRef>(null);
  const [editorHeights, setEditorHeights] = useState<LineHeight[]>([]);
  const [previewHeights, setPreviewHeights] = useState<PreviewHeight[]>([]);
  const [targetPreviewHeights, setTargetPreviewHeights] = useState<PreviewHeight[]>([
      { line: 2, height: 300 },  // Example initial target heights
      { line: 4, height: 200 },
  ]);
  const isSyncing = useRef<boolean>(false);

  const syncHeights = (newEditorHeights: LineHeight[], newPreviewHeights: PreviewHeight[]) => {
    if (isSyncing.current) return; // Prevent infinite loops
    
    isSyncing.current = true;
    
    const maxLines = Math.max(newEditorHeights.length, newPreviewHeights.length);
    const previewTargets: PreviewHeight[] = [];
    
    for (let line = 1; line <= maxLines; line++) {
      const editorHeight = newEditorHeights[line-1]?.height || 0;
      const previewHeight = newPreviewHeights[line-1]?.height || 0;
      const targetHeight = Math.max(editorHeight, previewHeight);
      
      if (targetHeight > 0) {
        previewTargets.push({ line, height: targetHeight });
      }
    }
    
    // Set target heights via props (declarative)
    setTargetPreviewHeights(previewTargets);
    
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  const handleEditorHeightChange = (heights: LineHeight[]) => {
    setEditorHeights(heights);
    syncHeights(heights, previewHeights);
  };

  const handlePreviewHeightChange = (heights: PreviewHeight[]) => {
    if (!isSyncing.current) {
      setPreviewHeights(heights);
      syncHeights(editorHeights, heights);
    }
  };

  const handleGetHeights = () => {
    if (previewRef.current) {
      const heights = previewRef.current.getPreviewHeights();
      console.log('Preview heights:', heights);
    }
    console.log('Get heights clicked');
  };

  const handleUpdateHeights = () => {
    // Test by setting some example target heights
    // setTargetPreviewHeights([
    //   { line: 2, height: 100 },
    //   { line: 4, height: 80 },
    //   { line: 7, height: 120 }
    // ]);
    console.log('Update heights clicked');
  };

  return (
    <div id="app">
      <div className="split-container">
        <div className="editor-half">
          <Editor 
            initialCode={initialCode}
            onGetHeights={handleGetHeights}
            onUpdateHeights={handleUpdateHeights}
            // onHeightChange={handleEditorHeightChange}
          />
        </div>
        <div className="preview-half">
          <Preview 
            ref={previewRef} 
            // onHeightChange={handlePreviewHeightChange}
            targetHeights={targetPreviewHeights}
          />
        </div>
      </div>
    </div>
  )
}

export default App