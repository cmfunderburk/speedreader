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
  parentDir?: string       // Immediate parent directory name (for grouping)
  isFrontmatter?: boolean  // Detected as frontmatter file
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

export interface LibraryAPI {
  getSources(): Promise<LibrarySource[]>
  listBooks(dirPath: string): Promise<LibraryItem[]>
  openBook(filePath: string): Promise<ExtractedContent>
  addSource(source: LibrarySource): Promise<void>
  removeSource(sourcePath: string): Promise<void>
  selectDirectory(): Promise<string | null>
  exportManifest(): Promise<LibraryExportResult>
  importManifest(): Promise<LibraryImportResult>
}

export interface CorpusArticle {
  title: string
  text: string
  domain: string
  fk_grade: number
  words: number
  sentences: number
}

export type CorpusFamily = 'wiki' | 'prose'
export type CorpusTier = 'easy' | 'medium' | 'hard'

export interface CorpusTierInfo {
  available: boolean
  totalArticles: number
}

export type CorpusInfo = Record<CorpusFamily, Record<CorpusTier, CorpusTierInfo>>

export interface CorpusAPI {
  getInfo(): Promise<CorpusInfo>
  sampleArticle(family: CorpusFamily, tier: CorpusTier): Promise<CorpusArticle | null>
}

declare global {
  interface Window {
    library?: LibraryAPI
    corpus?: CorpusAPI
  }
}
