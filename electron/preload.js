const { contextBridge, ipcRenderer } = require('electron')

try {
  contextBridge.exposeInMainWorld('api', {
    openFile: async () => ipcRenderer.invoke('open-file'),
    saveFile: async (payload) => ipcRenderer.invoke('save-file', payload),
    runCode: async (payload) => ipcRenderer.invoke('run-code', payload),
    checkTools: async () => ipcRenderer.invoke('check-tools')
  })
} catch (e) {
  // In case of preload failure, do nothing; renderer will detect missing API and inform the user.
}
