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
  onHeightChange?: (heights: LineHeight[]) => void
  targetHeights?: LineHeight[]
}

export function Editor({ initialCode, onGetHeights, onUpdateHeights, onHeightChange, targetHeights }: EditorProps) {
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
          console.log('Editor line heights changed:', heights.slice(0, 5))
          if (onHeightChange) {
            onHeightChange(heights);
          }
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
  }, [initialCode, onHeightChange])

  // Apply target heights when prop changes
  useEffect(() => {
    if (targetHeights && targetHeights.length > 0 && viewRef.current) {
      requestAnimationFrame(() => {
        if (viewRef.current) {
          setLineHeights(viewRef.current, targetHeights);
        }
      });
    }
  }, [targetHeights])

  return (
    <div id="editor" ref={editorRef} />
  )
}