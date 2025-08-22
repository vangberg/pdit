import './style.css'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import {lineHeightExtension, setLineHeights} from "./line-heights"

const initialCode = `// Welcome to CodeMirror!
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
    EditorView.theme({
      '&': {
        height: '400px'
      },
      '.cm-scroller': {
        fontFamily: 'Fira Code, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      }
    })
  ]
})

const updateLineHeights = () => {
  const previews = document.getElementById("editor-preview")!
  const linePreviews = Array.from(previews.children)
  const heights = []
  for (let i = 0; i < state.doc.lines; i++) {
    const previewLineHeight = linePreviews[i].scrollHeight
    console.log(linePreviews[i])
    heights.push({ line: i + 1, height: previewLineHeight })
  }
  setLineHeights(view, heights)
}

document.getElementById('update-heights-btn')!.addEventListener('click', updateLineHeights)

const view = new EditorView({
  state,
  parent: document.getElementById('editor')!
})

console.log('CodeMirror editor initialized!')