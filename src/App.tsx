import React, { useEffect, useMemo, useRef, useState } from 'react'
import CodeEditor from './editor/CodeEditor'

const LANGS = [
  { id: 'plaintext', name: 'Plain Text' },
  { id: 'html', name: 'HTML' },
  { id: 'css', name: 'CSS' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'java', name: 'Java' },
  { id: 'c', name: 'C' },
  { id: 'cpp', name: 'C++' },
]

type LangId = typeof LANGS[number]['id']

const defaultSamples: Record<LangId, string> = {
  plaintext: 'Welcome to NoteCode! Select a language above.',
  html: '<!doctype html>\n<html>\n  <head><title>NoteCode</title></head>\n  <body>\n    <h1>Hello from NoteCode</h1>\n  </body>\n</html>\n',
  css: 'body {\n  font-family: system-ui;\n  color: #333;\n}\n',
  javascript: 'function greet(name) {\n  console.log(`Hello, ${name}`);\n}\n\nexport default greet;\n',
  java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello NoteCode");\n  }\n}\n',
  c: '#include <stdio.h>\n\nint main() {\n  printf("Hello NoteCode\\n");\n  return 0;\n}\n',
  cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n  cout << "Hello NoteCode" << endl;\n  return 0;\n}\n',
}

function App() {
  const [language, setLanguage] = useState<LangId>('html')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [fontSize, setFontSize] = useState<number>(14)
  const [doc, setDoc] = useState<string>(defaultSamples['html'])
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [showRun, setShowRun] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'console'>('preview')
  const [logs, setLogs] = useState<Array<{ level: 'log' | 'warn' | 'error', message: string }>>([])
  const [stdinInput, setStdinInput] = useState<string>('')
  const [runSessionId, setRunSessionId] = useState<string>('')
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  useEffect(() => {
    setDoc(defaultSamples[language])
  }, [language])

  function isElectronEnv() {
    const hasApi = typeof (window as any).api !== 'undefined'
    const ua = navigator.userAgent || ''
    const looksElectron = /Electron\//.test(ua)
    return hasApi || looksElectron
  }

  async function onNew() {
    setDoc('')
    setFileHandle(null)
  }

  function insertHtmlTemplate() {
    setLanguage('html')
    setDoc(defaultSamples['html'])
    setShowRun(true)
    setActiveTab('preview')
  }

  async function onOpen() {
    try {
      if (isElectronEnv()) {
        const res = await (window as any).api.openFile()
        if (res) {
          setDoc(res.content)
          setFileHandle(null)
        }
      } else if ('showOpenFilePicker' in window) {
        const [handle] = await (window as any).showOpenFilePicker({ types: [{ description: 'Text / Code', accept: { 'text/plain': ['.txt', '.html', '.css', '.js', '.java', '.c', '.cpp'] } }] })
        const file = await handle.getFile()
        const text = await file.text()
        setDoc(text)
        setFileHandle(handle)
      } else {
        const input = document.createElement('input')
        input.type = 'file'
        input.onchange = async () => {
          const file = (input.files?.[0])
          if (!file) return
          const text = await file.text()
          setDoc(text)
        }
        input.click()
      }
    } catch (e) {
      console.error(e)
      alert('Failed to open file')
    }
  }

  async function writeToHandle(handle: FileSystemFileHandle, content: string) {
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async function onSave() {
    try {
      if (isElectronEnv()) {
        await (window as any).api.saveFile({ content: doc })
        return
      }
      if (fileHandle) {
        await writeToHandle(fileHandle, doc)
      } else {
        await onSaveAs()
      }
    } catch (e) {
      console.error(e)
      alert('Failed to save file')
    }
  }

  async function onSaveAs() {
    try {
      if (isElectronEnv()) {
        await (window as any).api.saveFile({ content: doc, saveAs: true })
        return
      }
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({ suggestedName: `note.${language === 'plaintext' ? 'txt' : language}` })
        await writeToHandle(handle, doc)
        setFileHandle(handle)
      } else {
        const blob = new Blob([doc], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `note.${language === 'plaintext' ? 'txt' : language}`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      console.error(e)
      alert('Failed to save file')
    }
  }

  function appendLog(level: 'log' | 'warn' | 'error', message: string) {
    setLogs(prev => [...prev, { level, message }])
  }
  
  async function onDownloadApp() {
    const releasesPage = 'https://github.com/iteducationcenter77-pixel/NoteCode/releases'
    const releasesLatestPage = 'https://github.com/iteducationcenter77-pixel/NoteCode/releases/latest'
    try {
      const isWindows = navigator.userAgent.toLowerCase().includes('windows')
      if (!isWindows) {
        window.open(releasesPage, '_blank', 'noopener,noreferrer')
        return
      }
      // Try GitHub API for the latest release asset
      const apiUrl = 'https://api.github.com/repos/iteducationcenter77-pixel/NoteCode/releases/latest'
      const resp = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' } })
      if (resp.ok) {
        const data = await resp.json()
        const assets = Array.isArray(data?.assets) ? data.assets : []
        const exe = assets.find((a: any) => {
          const name = String(a?.name || '').toLowerCase()
          return name.endsWith('.exe') && name.includes('notecode')
        })
        const downloadUrl = exe?.browser_download_url
        if (downloadUrl) {
          const a = document.createElement('a')
          a.href = String(downloadUrl)
          a.setAttribute('download', 'NoteCode-Setup.exe')
          a.style.display = 'none'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          return
        }
      }
      // Fallback: open releases page silently if no asset yet
      window.open(releasesPage, '_blank', 'noopener,noreferrer')
    } catch {
      window.open(releasesPage, '_blank', 'noopener,noreferrer')
    }
  }

  async function runWebCompile(lang: 'java' | 'c' | 'cpp', source: string, stdin: string) {
    try {
      const runtimesUrl = 'https://emkc.org/api/v2/piston/runtimes'
      const execUrl = 'https://emkc.org/api/v2/piston/execute'
      const pistonLang = lang === 'cpp' ? 'c++' : (lang === 'c' ? 'c' : 'java')
      let version = 'latest'
      try {
        const rtResp = await fetch(runtimesUrl, { headers: { 'Accept': 'application/json' } })
        if (rtResp.ok) {
          const rts = await rtResp.json()
          const match = (Array.isArray(rts) ? rts : []).find((r: any) => String(r?.language || '').toLowerCase() === pistonLang)
          if (match && match.version) version = String(match.version)
        }
      } catch (_) {
        // ignore, fallback to 'latest'
      }
      const files = [
        {
          name: lang === 'java' ? 'Main.java' : (lang === 'cpp' ? 'main.cpp' : 'main.c'),
          content: source
        }
      ]
      const body = {
        language: pistonLang,
        version,
        files,
        stdin: stdin || ''
      }
      const resp = await fetch(execUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body)
      })
      if (!resp.ok) {
        return { stdout: '', stderr: 'Web run failed (HTTP ' + resp.status + '). Please try again or use the desktop app.', exitCode: resp.status }
      }
      const json = await resp.json()
      let out = ''
      let err = ''
      if (json?.compile?.stdout) out += json.compile.stdout
      if (json?.compile?.stderr) err += json.compile.stderr
      if (json?.run?.stdout) out += json.run.stdout
      if (json?.run?.stderr) err += json.run.stderr
      const exitCode = typeof json?.run?.code === 'number' ? json.run.code : 0
      return { stdout: out, stderr: err, exitCode }
    } catch (e: any) {
      return { stdout: '', stderr: 'Network error: ' + String(e?.message || e), exitCode: -1 }
    }
  }

  async function onCheckTools() {
    if (!isElectronEnv()) {
      appendLog('warn', 'Compiler check requires desktop app. Launch via npm run electron:dev.')
      setShowRun(true)
      setActiveTab('console')
      return
    }
    try {
      setShowRun(true)
      setActiveTab('console')
      const res = await (window as any).api.checkTools()
      const lines: string[] = []
      function line(name: string, present: boolean, path: string) {
        lines.push(`${name}: ${present ? 'FOUND' : 'MISSING'}${present ? ' (' + path + ')' : ''}`)
      }
      line('javac', !!res?.javac?.present, res?.javac?.path || '')
      line('gcc', !!res?.gcc?.present, res?.gcc?.path || '')
      line('g++', !!res?.gpp?.present, res?.gpp?.path || '')
      appendLog('log', 'Compiler status:\n' + lines.join('\n'))
      if (!res?.gcc?.present) {
        appendLog('warn', 'GCC not found. Install MSYS2 (mingw-w64-ucrt-x86_64-gcc) or Chocolatey (mingw) and add bin to PATH, then restart PowerShell.')
      }
      if (!res?.gpp?.present) {
        appendLog('warn', 'G++ not found. Install with GCC package and ensure bin is in PATH.')
      }
      if (!res?.javac?.present) {
        appendLog('warn', 'Javac not found. Install JDK and ensure javac/java are in PATH.')
      }
    } catch (e: any) {
      appendLog('error', 'Tool check failed: ' + String(e?.message || e))
    }
  }

  useEffect(() => {
    function handler(ev: MessageEvent) {
      const data = ev.data
      if (data && data.type === 'nc-console') {
        const msg = (data.args || []).join(' ')
        appendLog(data.level, msg)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  function htmlWrapper(body: string, extraHead: string = '', bodyAttrs: string = '') {
    return '<!doctype html><html><head><meta charset="utf-8">' +
      extraHead +
      '<script>(function(){function s(l,a){parent.postMessage({type:\'nc-console\',level:l,args:Array.from(a).map(x=>{try{return typeof x===\'object\'?JSON.stringify(x):String(x)}catch(e){return String(x)}})},\'*\')}[\'log\',\'warn\',\'error\'].forEach(l=>{const o=console[l];console[l]=function(){s(l,arguments);o&&o.apply(console,arguments)}});window.onerror=function(m){parent.postMessage({type:\'nc-console\',level:\'error\',args:[String(m)]},\'*\');};})();</script></head><body ' + bodyAttrs + '>' +
      body +
      '</body></html>'
  }

  function stripAnsi(text: string) {
    try {
      return text
        // Remove CSI sequences
        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PR-TZcf-ntqry=><~]/g, '')
        // Remove OSC (title) sequences: ESC ] ... BEL
        .replace(/\u001b\][^\u0007]*\u0007/g, '')
        // Remove OSC terminated by ST: ESC ] ... ESC \\
        .replace(/\u001b\][^\u001b]*\u001b\\/g, '')
        .replace(/\r\n/g, '\n')
    } catch { return text }
  }

  function injectConsoleCaptureIntoHtml(html: string) {
    const capture = '<script>(function(){function s(l,a){parent.postMessage({type:\'nc-console\',level:l,args:Array.from(a).map(x=>{try{return typeof x===\'object\'?JSON.stringify(x):String(x)}catch(e){return String(x)}})},\'*\')}[\'log\',\'warn\',\'error\'].forEach(l=>{const o=console[l];console[l]=function(){s(l,arguments);o&&o.apply(console,arguments)}});window.onerror=function(m){parent.postMessage({type:\'nc-console\',level:\'error\',args:[String(m)]},\'*\');};})();</script>'
    // If there's a <head>, inject capture right after it
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, match => match + '<meta charset="utf-8">' + capture)
    }
    // If there's <html> but no head, create one before closing </html>
    if (/<html[^>]*>/i.test(html)) {
      return html.replace(/<html([^>]*)>/i, '<html$1>')
                 .replace(/<body([^>]*)>/i, match => '<head><meta charset="utf-8">' + capture + '</head>' + match)
    }
    // Otherwise, wrap the body content
    return htmlWrapper(html)
  }

  function sanitizeUserHtml(raw: string) {
    let s = raw
    // Fix common typos like trailing commas in closing tags
    s = s.replace(/<\/html\s*,\s*>/gi, '</html>')
         .replace(/<\/body\s*,\s*>/gi, '</body>')
         .replace(/<\/head\s*,\s*>/gi, '</head>')
    // If missing <!doctype>, add it for standards mode
    if (!/<!doctype/i.test(s)) s = '<!doctype html>\n' + s
    return s
  }

  function extractBodyInner(html: string) {
    const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    return m ? m[1] : html
  }

  function buildSrcdocFromHtml(input: string) {
    try {
      const parser = new DOMParser()
      const docParsed = parser.parseFromString(input, 'text/html')
      const hasHtml = /<html[^>]*>/i.test(input)
      if (hasHtml && docParsed) {
        const head = docParsed.head?.innerHTML || ''
        const bodyEl = docParsed.body
        const bodyAttrs = bodyEl ? bodyEl.getAttributeNames().map(n => `${n}="${bodyEl.getAttribute(n) || ''}"`).join(' ') : ''
        const bodyInner = bodyEl?.innerHTML || ''
        return htmlWrapper(bodyInner, head, bodyAttrs)
      }
    } catch (_) {
      // fallthrough to wrapper below
    }
    // Partial HTML or plain text
    if (/<\w|<\/\w/i.test(input)) {
      return htmlWrapper(input)
    }
    return htmlWrapper('<pre>' + input.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</pre>')
  }

  function runInIframe() {
    setShowRun(true)
    setActiveTab('preview')
    setLogs([])
    const iframe = iframeRef.current
    if (!iframe) {
      // Retry after the preview pane mounts
      setTimeout(() => {
        try { runInIframe() } catch (_) { /* noop */ }
      }, 0)
      return
    }
    let srcdoc = ''
    let rawInputForFallback: string | null = null
    if (language === 'html') {
      const raw = sanitizeUserHtml((doc || '').trim())
      rawInputForFallback = raw
        if (!raw) {
          srcdoc = htmlWrapper('<h2>HTML Preview</h2><p>Type some HTML and click Run.</p>')
      } else if (/<html[^>]*>/i.test(raw)) {
        // Use the user's full document verbatim for maximum compatibility
        srcdoc = raw
        } else if (/<\w|<\/\w/i.test(raw)) {
          // Partial HTML -> wrap
          srcdoc = htmlWrapper(raw)
        } else {
          srcdoc = htmlWrapper('<pre>' + raw.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</pre>')
      }
    } else if (language === 'css') {
      const body = '<h1>CSS Preview</h1><p>Edit CSS to see changes.</p>'
      srcdoc = htmlWrapper(body, '<style>' + doc + '</style>')
    } else if (language === 'javascript') {
      const body = '<h1>JS Runner</h1>'
      const encoded = btoa(doc)
      srcdoc = htmlWrapper(body, '<script>try{eval(atob("' + encoded + '"))}catch(e){console.error(e)}</script>')
    } else {
      appendLog('warn', 'Preview only supports HTML/CSS/JavaScript. For Java/C/C++, use desktop app run with compilers installed.')
      setActiveTab('console')
      return
    }
    // Assign srcdoc and verify load renders something
    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument
        const body = doc?.body
        const hasContent = !!(body && (body.innerText?.trim() || body.innerHTML?.trim()))
        if (!hasContent) {
          appendLog('warn', 'Preview rendered empty. Check HTML tags or use HTML Template.')
          // Fallback: force simple wrapper if full-doc path failed
          if (rawInputForFallback) {
            const bodyInner = extractBodyInner(rawInputForFallback)
            iframe.srcdoc = htmlWrapper(bodyInner)
          }
          setActiveTab('console')
        }
      } catch (e) {
        appendLog('error', 'Preview failed to load: ' + String(e))
        setActiveTab('console')
      }
    }
    iframe.srcdoc = srcdoc
  }

  // Auto-run preview when editing HTML/CSS/JS and the run pane is open
  useEffect(() => {
    if (!showRun) return
    if (language === 'html' || language === 'css' || language === 'javascript') {
      runInIframe()
    }
  }, [doc, language, showRun])

  async function onRun() {
    if (language === 'html' || language === 'css' || language === 'javascript') {
      runInIframe()
      return
    }
    // Compiled languages: web fallback via Piston API
    setShowRun(true)
    setActiveTab('console')
    setLogs([])
    const api = (window as any).api
    if (api && typeof api.startRun === 'function') {
      try {
        // Start interactive run and subscribe to output
        const res = await api.startRun({ language, source: doc })
        if (res?.supported === false) {
          const msg = (res.stderr && String(res.stderr).trim()) || 'Run not supported for this language in current environment.'
          appendLog('error', msg)
          return
        }
        if (!res?.sessionId) {
          appendLog('error', 'Run failed to start.')
          return
        }
        setRunSessionId(res.sessionId)
        setIsRunning(true)
        const offOutput = api.onRunOutput((msg: any) => {
          if (!msg || msg.sessionId !== res.sessionId) return
          const text = stripAnsi(String(msg.text || ''))
          const level = msg.kind === 'stderr' ? 'error' : 'log'
          if (text) appendLog(level as any, text)
        })
        const offExit = api.onRunExit((msg: any) => {
          if (!msg || msg.sessionId !== res.sessionId) return
          setIsRunning(false)
          // Minimal output: do not print exit code on success
          // Clean listeners
          try { offOutput && offOutput() } catch {}
          try { offExit && offExit() } catch {}
        })
      } catch (e: any) {
        appendLog('error', String(e?.message || e))
      }
    } else {
      const ua = navigator.userAgent || ''
      if (/Electron\//.test(ua)) {
        appendLog('warn', 'Desktop detected but API missing. Preload may have failed; try restarting Electron.')
      } else {
        // Try web compile via Piston
        const res = await runWebCompile(language as any, doc, stdinInput)
        if (res.stderr) appendLog('error', res.stderr)
        if (res.stdout) appendLog('log', res.stdout)
        if (!res.stdout && !res.stderr) appendLog('warn', 'No output. If issues persist, use the NoteCode desktop app for full compiler support.')
      }
    }
  }

  function onConsoleEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    try {
      if (e.key !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      if (!isRunning || !runSessionId) return
      const inputEl = e.currentTarget as HTMLInputElement
      const val = String(inputEl && typeof inputEl.value === 'string' ? inputEl.value : '')
      const api = (window as any).api
      if (api && typeof api.sendInput === 'function') {
        api.sendInput({ sessionId: runSessionId, data: val + '\r\n' }).catch(() => {})
      }
      if (inputEl) inputEl.value = ''
      setStdinInput('')
    } catch (_) {
      // ignore
    }
  }

  return (
    <div className="app">
      <div className="toolbar">
        <div className="title">NoteCode</div>
        <button className="button" onClick={onNew}>New</button>
        <button className="button" onClick={onOpen}>Open</button>
        <button className="button" onClick={onSave}>Save</button>
        <button className="button" onClick={onSaveAs}>Save As</button>
        <button className="button" onClick={onDownloadApp} title="Download the desktop app for Windows">Download App</button>
        <button
          className="button"
          onClick={onRun}
          title={!isElectronEnv() && (language === 'java' || language === 'c' || language === 'cpp') ? 'Runs via web API (Piston). For full features, use desktop app.' : 'Run'}
        >Run</button>
        <select className="select" value={language} onChange={e => setLanguage(e.target.value as LangId)}>
          {LANGS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select className="select" value={theme} onChange={e => setTheme(e.target.value as 'dark' | 'light')}>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
        <input className="input" type="number" min={10} max={28} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} />
      </div>
      <div className="content">
        <div className="editor-wrap">
          <CodeEditor
            className="editor"
            value={doc}
            onChange={setDoc}
            language={language}
            theme={theme}
            fontSize={fontSize}
          />
        </div>
        {showRun && (
          <div className="run-pane side">
            <div className="run-tabs">
              <button className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>Preview</button>
              <button className={`tab-btn ${activeTab === 'console' ? 'active' : ''}`} onClick={() => setActiveTab('console')}>Console</button>
            </div>
            <div className="run-content">
              {activeTab === 'preview' ? (
                <iframe ref={iframeRef} className="preview-frame" />
              ) : (
                <div className="console">
                  {((isRunning) || (!isElectronEnv() && (language === 'java' || language === 'c' || language === 'cpp'))) && (
                    <div className="stdin-input">
                      <label>{isRunning ? 'Type input and press Enter:' : 'Program input (stdin):'}</label>
                      <input
                        className="input"
                        placeholder={isRunning ? 'e.g. 5 7' : 'Provide input for scanf/cin/System.in here'}
                        onKeyDown={onConsoleEnter}
                        value={stdinInput}
                        onChange={e => setStdinInput(e.target.value)}
                        autoFocus
                      />
                      {/* hint removed per user request */}
                    </div>
                  )}
                  {logs.length === 0 ? <div className="log">No output yet.</div> : logs.map((l, i) => (
                    <div key={i} className={l.level}>{l.message}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="footer">
        <div className="footer-left">
          <span className="sig-text">
            Developed by <strong>Hamidul Islam</strong>, M.Sc IT, Founder of
            <a href="https://redonline.in" target="_blank" rel="noopener noreferrer"> RED AI (redonline.in)</a>
          </span>
          <div className="sig-links">
            <a className="icon-link" href="https://wa.me/918638373298" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
              <svg viewBox="0 0 32 32" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M19.11 17.11c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.62.14-.18.27-.71.88-.87 1.06-.16.18-.32.2-.59.07-.27-.14-1.12-.41-2.14-1.31-.79-.7-1.32-1.55-1.47-1.82-.16-.27-.02-.42.12-.55.12-.12.27-.32.41-.5.14-.18.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.62-1.5-.85-2.06-.22-.53-.45-.46-.62-.46h-.53c-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.28s.98 2.64 1.12 2.82c.14.18 1.93 2.95 4.68 4.13.65.28 1.16.45 1.56.58.65.21 1.24.18 1.7.11.52-.08 1.6-.65 1.83-1.27.23-.62.23-1.15.16-1.27-.07-.11-.25-.18-.52-.32z"/>
                <path d="M27.5 14.5c0 7.18-5.82 13-13 13-2.28 0-4.42-.6-6.27-1.66L2.5 27.5l1.73-5.59A12.94 12.94 0 0 1 1.5 14.5C1.5 7.32 7.32 1.5 14.5 1.5S27.5 7.32 27.5 14.5zm-2 0c0-5.52-4.48-10-10-10s-10 4.48-10 10c0 2.12.67 4.08 1.82 5.69l-1.19 3.86 3.98-1.14A9.95 9.95 0 0 0 15.5 24.5c5.52 0 10-4.48 10-10z"/>
              </svg>
            </a>
            <a className="icon-link" href="https://www.instagram.com/hamidul.io?igsh=cjI4YmE1MXh0eHpi" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.9.2 2.4.4.6.2 1 .5 1.5 1 .5.5.8.9 1 1.5.2.5.3 1.2.4 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.9-.4 2.4-.2.6-.5 1-1 1.5s-.9.8-1.5 1c-.5.2-1.2.3-2.4.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.9-.2-2.4-.4-.6-.2-1-.5-1.5-1-.5-.5-.8-.9-1-1.5-.2-.5-.3-1.2-.4-2.4C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.9.4-2.4.2-.6.5-1 1-1.5.5-.5.9-.8 1.5-1 .5-.2 1.2-.3 2.4-.4C8.4 2.2 8.8 2.2 12 2.2m0 1.8c-3.1 0-3.5 0-4.8.1-1 .1-1.5.2-1.9.3-.5.2-.8.4-1.1.9-.3.3-.6.6-.9 1.1-.1.4-.2.9-.3 1.9-.1 1.3-.1 1.7-.1 4.8s0 3.5.1 4.8c.1 1 .2 1.5.3 1.9.2.6.4.8.9 1.1.3.3.6.6 1.1.9.4.1.9.2 1.9.3 1.3.1 1.7.1 4.8.1s3.5 0 4.8-.1c1-.1 1.5-.2 1.9-.3.4-.2.8-.4 1.1-.9.3-.3.6-.6.9-1.1.1-.4.2-.9.3-1.9.1-1.3.1-1.7.1-4.8s0-3.5-.1-4.8c-.1-1-.2-1.5-.3-1.9-.2-.6-.4-.8-.9-1.1-.3-.3-.6-.6-1.1-.9-.4-.1-.9-.2-1.9-.3-1.3-.1-1.7-.1-4.8-.1m0 3.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8m0 1.8a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2m5-2.1a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6"/>
              </svg>
            </a>
            <a className="icon-link" href="https://www.linkedin.com/in/hamidul-islam-a85961376?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M19 3A2.94 2.94 0 0 1 22 6v12a2.94 2.94 0 0 1-3 3H5a2.94 2.94 0 0 1-3-3V6a2.94 2.94 0 0 1 3-3Zm-9.5 15.5v-7H7v7ZM8 10a1.25 1.25 0 1 0 0-2.5A1.25 1.25 0 1 0 8 10ZM17 18.5v-3.78c0-1.88-1-2.72-2.28-2.72a1.97 1.97 0 0 0-1.77.98h-.04v-.84H11v6.36h1.91v-3.52c0-.93.18-1.83 1.33-1.83s1.17 1.06 1.17 1.9v3.45Z"/>
              </svg>
            </a>
          </div>
        </div>
        <div className="footer-right">
          <span>Language: {LANGS.find(l => l.id === language)?.name}</span>
          <span>Theme: {theme}</span>
          <span>Font: {fontSize}px</span>
          <span>Desktop: {isElectronEnv() ? 'Yes' : 'No'}</span>
        </div>
      </div>
    </div>
  )
}

export default App
