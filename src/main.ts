import './style.css'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import {lineHeightExtension, setLineHeights, getLineHeights, lineHeightChangeListener} from "./line-heights"

const initialCode = `// Welcome to CodeMirror, this is a very long, long line!
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));

// Try editing this code!
const greeting = "Hello, CodeMirror!";
console.log(greeting);`

const state = EditorState.create({
  doc: initialCode,
  extensions: [
    basicSetup,
    javascript(),
    lineHeightExtension,
    lineHeightChangeListener((heights) => {
      console.log('Line heights changed:', heights.slice(0, 5)) // Log first 5 lines to avoid spam
      window.requestAnimationFrame(() => {
        setLineHeights(view, [
          { line: 2, height: 40 },
          { line: 5, height: 60 },
          { line: 8, height: 50 }
        ])
      })
    }),
    EditorView.theme({
      '&': {
        height: '400px'
      },
      '.cm-scroller': {
        fontFamily: 'Fira Code, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      }
    }),
    EditorView.lineWrapping
  ]
})

const view = new EditorView({
  state,
  parent: document.getElementById('editor')!
})

document.getElementById('update-heights-btn')?.addEventListener('click', () => {
  setLineHeights(view, [
    { line: 2, height: 40 },
    { line: 5, height: 60 },
    { line: 8, height: 50 }
  ])
})

document.getElementById('get-heights-btn')?.addEventListener('click', () => {
  const heights = getLineHeights(view)
  console.table(heights)
})

console.log('CodeMirror editor initialized!')