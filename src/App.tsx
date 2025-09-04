import './style.css'
import { Editor } from './Editor'
import { Preview, PreviewRef } from './Preview'
import React, { useRef, useEffect } from 'react'

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

  useEffect(() => {
    // Set heights on render using requestAnimationFrame
    requestAnimationFrame(() => {
      if (previewRef.current) {
        previewRef.current.setPreviewHeights([
          { line: 2, height: 100 },
          { line: 4, height: 80 },
          { line: 7, height: 120 }
        ]);
      }
    });
  }, []);

  const handleGetHeights = () => {
    if (previewRef.current) {
      const heights = previewRef.current.getPreviewHeights();
      console.log('Preview heights:', heights);
    }
    console.log('Get heights clicked');
  };

  const handleUpdateHeights = () => {
    if (previewRef.current) {
      previewRef.current.setPreviewHeights([
        { line: 2, height: 100 },
        { line: 4, height: 80 },
        { line: 7, height: 120 }
      ]);
    }
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
          />
        </div>
        <div className="preview-half">
          <Preview ref={previewRef} />
        </div>
      </div>
    </div>
  )
}

export default App