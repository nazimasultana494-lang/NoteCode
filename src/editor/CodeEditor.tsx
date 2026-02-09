import React, { useEffect, useRef } from 'react'
import { EditorState, Extension, Compartment } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { history, historyKeymap } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'

export type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
  language: 'plaintext' | 'html' | 'css' | 'javascript' | 'java' | 'c' | 'cpp'
  theme: 'dark' | 'light'
  fontSize?: number
  className?: string
}

function getLanguageExt(lang: CodeEditorProps['language']): Extension[] {
  switch (lang) {
    case 'html': return [html()]
    case 'css': return [css()]
    case 'javascript': return [javascript({ jsx: true })]
    case 'java': return [java()]
    case 'c': return [cpp()] // CodeMirror's cpp covers C/C++ highlighting
    case 'cpp': return [cpp()]
    default: return []
  }
}

const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, language, theme, fontSize = 14, className }) => {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageCompartmentRef = useRef(new Compartment())
  const themeCompartmentRef = useRef(new Compartment())
  const styleCompartmentRef = useRef(new Compartment())

  useEffect(() => {
    if (!parentRef.current) return

    const extensions: Extension[] = [
      history(),
      keymap.of([...historyKeymap, ...searchKeymap]),
      syntaxHighlighting(defaultHighlightStyle),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        spellcheck: 'false',
        autocapitalize: 'off',
        autocomplete: 'off',
        autocorrect: 'off',
        dir: 'ltr'
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChange(update.state.doc.toString())
        }
      }),
      styleCompartmentRef.current.of(EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: `${fontSize}px` },
        '.cm-content': { padding: '12px', direction: 'ltr', textAlign: 'left', unicodeBidi: 'isolate-override' },
        '.cm-line': { direction: 'ltr', textAlign: 'left', unicodeBidi: 'isolate-override' }
      })),
      languageCompartmentRef.current.of(getLanguageExt(language)),
      themeCompartmentRef.current.of(theme === 'dark' ? oneDark : [])
    ]

    const state = EditorState.create({ doc: value, extensions })
    const view = new EditorView({ state, parent: parentRef.current })
    viewRef.current = view

    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur === value) return
    view.dispatch({ changes: { from: 0, to: cur.length, insert: value } })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: styleCompartmentRef.current.reconfigure(EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: `${fontSize}px` },
      '.cm-content': { padding: '12px' }
    })) })
  }, [fontSize])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: languageCompartmentRef.current.reconfigure(getLanguageExt(language)) })
  }, [language])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: themeCompartmentRef.current.reconfigure(theme === 'dark' ? oneDark : []) })
  }, [theme])

  return <div ref={parentRef} className={className} />
}

export default CodeEditor
