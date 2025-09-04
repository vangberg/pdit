import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { lineHeightExtension, setLineHeights, getLineHeights, lineHeightChangeListener, LineHeight } from './line-heights'
import React from 'react'

interface EditorProps {
  initialCode: string
  onGetHeights?: () => void
  onUpdateHeights?: () => void
}

export function Editor({ initialCode, onGetHeights, onUpdateHeights }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: initialCode,
      extensions: [
        basicSetup,
        javascript(),
        lineHeightExtension,
        lineHeightChangeListener((heights) => {
          console.log('Line heights changed:', heights.slice(0, 5))
          window.requestAnimationFrame(() => {
            if (viewRef.current) {
              setLineHeights(viewRef.current, [
                { line: 2, height: 40 },
                { line: 5, height: 60 },
                { line: 8, height: 50 }
              ])
            }
          })
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            width: '100%'
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
      parent: editorRef.current
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [initialCode])

  const handleUpdateHeights = () => {
    if (viewRef.current) {
      setLineHeights(viewRef.current, [
        { line: 2, height: 40 },
        { line: 5, height: 60 },
        { line: 8, height: 50 }
      ])
    }
    onUpdateHeights?.()
  }

  const handleGetHeights = () => {
    if (viewRef.current) {
      const heights = getLineHeights(viewRef.current)
      console.table(heights)
    }
    onGetHeights?.()
  }

  return (
    <div id="editor" ref={editorRef} />
  )
}