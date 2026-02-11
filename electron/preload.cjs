const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('library', {
  getSources: () => ipcRenderer.invoke('library:getSources'),
  listBooks: (dirPath) => ipcRenderer.invoke('library:listBooks', dirPath),
  openBook: (filePath) => ipcRenderer.invoke('library:openBook', filePath),
  addSource: (source) => ipcRenderer.invoke('library:addSource', source),
  removeSource: (sourcePath) => ipcRenderer.invoke('library:removeSource', sourcePath),
  selectDirectory: () => ipcRenderer.invoke('library:selectDirectory'),
  exportManifest: () => ipcRenderer.invoke('library:exportManifest'),
  importManifest: () => ipcRenderer.invoke('library:importManifest'),
})
