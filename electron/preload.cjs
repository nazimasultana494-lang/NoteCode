const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('api', {
    openFile: async () => ipcRenderer.invoke('open-file'),
    saveFile: async (payload) => ipcRenderer.invoke('save-file', payload),
    runCode: async (payload) => ipcRenderer.invoke('run-code', payload),
    // New interactive run API
    startRun: async (payload) => ipcRenderer.invoke('start-run', payload),
    sendInput: async ({ sessionId, data }) => ipcRenderer.invoke('send-stdin', { sessionId, data }),
    stopRun: async ({ sessionId }) => ipcRenderer.invoke('stop-run', { sessionId }),
    onRunOutput: (cb) => {
      const handler = (_event, msg) => cb && cb(msg)
      ipcRenderer.on('run-output', handler)
      return () => ipcRenderer.removeListener('run-output', handler)
    },
    onRunExit: (cb) => {
      const handler = (_event, msg) => cb && cb(msg)
      ipcRenderer.on('run-exit', handler)
      return () => ipcRenderer.removeListener('run-exit', handler)
    },
    checkTools: async () => ipcRenderer.invoke('check-tools')
  });
} catch (e) {
  // Renderer detects missing API and informs the user; log for diagnostics.
  console.error('Preload failed to expose API:', e && e.message ? e.message : e);
}
