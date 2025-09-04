import './style.css'
import { Editor } from './Editor'
import { Preview } from './Preview'
import React from 'react'

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
  return (
    <div id="app">
      <div className="split-container">
        <div className="editor-half">
          <Editor 
            initialCode={initialCode}
            onGetHeights={() => console.log('Get heights clicked')}
            onUpdateHeights={() => console.log('Update heights clicked')}
          />
        </div>
        <div className="preview-half">
          <Preview />
        </div>
      </div>
    </div>
  )
}

export default App