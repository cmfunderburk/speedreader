import { contextBridge, ipcRenderer } from 'electron'
import type { CorpusAPI, LibraryAPI, SecureKeysAPI } from '../shared/electron-contract'

contextBridge.exposeInMainWorld('corpus', {
  getInfo: () =>
    ipcRenderer.invoke('corpus:getInfo'),

  sampleArticle: (family, tier) =>
    ipcRenderer.invoke('corpus:sampleArticle', family, tier),
} satisfies CorpusAPI)

contextBridge.exposeInMainWorld('library', {
  getSources: () =>
    ipcRenderer.invoke('library:getSources'),

  listBooks: (dirPath) =>
    ipcRenderer.invoke('library:listBooks', dirPath),

  openBook: (filePath) =>
    ipcRenderer.invoke('library:openBook', filePath),

  addSource: (source) =>
    ipcRenderer.invoke('library:addSource', source),

  removeSource: (sourcePath) =>
    ipcRenderer.invoke('library:removeSource', sourcePath),

  selectDirectory: () =>
    ipcRenderer.invoke('library:selectDirectory'),

  exportManifest: () =>
    ipcRenderer.invoke('library:exportManifest'),

  importManifest: () =>
    ipcRenderer.invoke('library:importManifest'),
} satisfies LibraryAPI)

contextBridge.exposeInMainWorld('secureKeys', {
  isAvailable: () =>
    ipcRenderer.invoke('secure-keys:isAvailable'),

  get: (keyId) =>
    ipcRenderer.invoke('secure-keys:get', keyId),

  set: (keyId, value) =>
    ipcRenderer.invoke('secure-keys:set', keyId, value),
} satisfies SecureKeysAPI)
