import { contextBridge, ipcRenderer } from 'electron'

export interface LibrarySource {
  name: string
  path: string
}

export interface LibraryItem {
  name: string
  path: string
  type: 'pdf' | 'epub' | 'txt'
  size: number
  modifiedAt: number
}

export interface ExtractedContent {
  title: string
  content: string
  sourcePath?: string
  assetBaseUrl?: string
  pageCount?: number
  chapters?: Array<{ title: string; content: string }>
}

export interface LibraryExportResult {
  status: 'cancelled' | 'exported'
  path?: string
  sourceCount?: number
  entryCount?: number
}

export interface LibraryImportSourceResult {
  sourceName: string
  status: 'added' | 'existing' | 'missing'
  resolvedPath?: string
  message: string
}

export interface LibraryImportResult {
  status: 'cancelled' | 'imported'
  manifestPath?: string
  sharedRootPath?: string
  added?: number
  existing?: number
  missing?: number
  results?: LibraryImportSourceResult[]
}

contextBridge.exposeInMainWorld('corpus', {
  getInfo: (): Promise<Record<string, { available: boolean; totalArticles: number }>> =>
    ipcRenderer.invoke('corpus:getInfo'),

  sampleArticle: (tier: string): Promise<{ title: string; text: string; domain: string; fk_grade: number; words: number; sentences: number } | null> =>
    ipcRenderer.invoke('corpus:sampleArticle', tier),
})

contextBridge.exposeInMainWorld('library', {
  getSources: (): Promise<LibrarySource[]> =>
    ipcRenderer.invoke('library:getSources'),

  listBooks: (dirPath: string): Promise<LibraryItem[]> =>
    ipcRenderer.invoke('library:listBooks', dirPath),

  openBook: (filePath: string): Promise<ExtractedContent> =>
    ipcRenderer.invoke('library:openBook', filePath),

  addSource: (source: LibrarySource): Promise<void> =>
    ipcRenderer.invoke('library:addSource', source),

  removeSource: (sourcePath: string): Promise<void> =>
    ipcRenderer.invoke('library:removeSource', sourcePath),

  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('library:selectDirectory'),

  exportManifest: (): Promise<LibraryExportResult> =>
    ipcRenderer.invoke('library:exportManifest'),

  importManifest: (): Promise<LibraryImportResult> =>
    ipcRenderer.invoke('library:importManifest'),
})
