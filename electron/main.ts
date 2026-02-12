import { app, BrowserWindow, ipcMain, dialog, protocol, net, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import type { ApiKeyId } from '../shared/electron-contract'
import {
  getConfiguredSources,
  scanDirectory,
  addSource,
  removeSource,
  buildLibraryManifest,
  saveLibraryManifest,
  loadLibraryManifest,
  importLibraryManifest,
  LibrarySource,
} from './lib/library'
import { extractPdfText } from './lib/pdf'
import { extractEpubText } from './lib/epub'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'reader-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

// ---------------------------------------------------------------------------
// Corpus cache — loaded lazily per tier, held in memory for sampling
// ---------------------------------------------------------------------------
interface CorpusArticle {
  title: string
  text: string
  domain: string
  fk_grade: number
  words: number
  sentences: number
}

type CorpusFamily = 'wiki' | 'prose'
type CorpusTier = 'easy' | 'medium' | 'hard'
const CORPUS_FAMILIES: CorpusFamily[] = ['wiki', 'prose']
const CORPUS_TIERS: CorpusTier[] = ['easy', 'medium', 'hard']

interface TierData {
  articles: CorpusArticle[]
}

function corpusKey(family: CorpusFamily, tier: CorpusTier): string {
  return `${family}:${tier}`
}

const corpusCache = new Map<string, TierData>()
const SUPPORTED_BOOK_EXTENSIONS = new Set(['.pdf', '.epub', '.txt'])
const SUPPORTED_API_KEY_IDS: ApiKeyId[] = ['comprehension-gemini']
const SUPPORTED_API_KEY_ID_SET = new Set<ApiKeyId>(SUPPORTED_API_KEY_IDS)

type EncryptedApiKeyStore = Partial<Record<ApiKeyId, string>>

function normalizePath(inputPath: string): string | null {
  try {
    return fs.realpathSync(path.resolve(inputPath))
  } catch {
    return null
  }
}

function isWithinRoot(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function getAllowedLibraryRoots(): string[] {
  return getConfiguredSources()
    .map(source => normalizePath(source.path))
    .filter((sourcePath): sourcePath is string => sourcePath !== null)
}

function resolveAllowedLibraryPath(requestedPath: string): string {
  const normalized = normalizePath(requestedPath)
  if (!normalized) {
    throw new Error('Path does not exist')
  }

  const roots = getAllowedLibraryRoots()
  if (roots.length === 0) {
    throw new Error('No library sources configured')
  }

  if (!roots.some(root => isWithinRoot(normalized, root))) {
    throw new Error('Path is outside configured library sources')
  }

  return normalized
}

function getResourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..')
  return path.join(base, ...segments)
}

function getEncryptedApiKeyStorePath(): string {
  return path.join(app.getPath('userData'), 'secure-api-keys.json')
}

function isSecureApiKeyStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

function parseApiKeyId(input: string): ApiKeyId {
  if (!SUPPORTED_API_KEY_ID_SET.has(input as ApiKeyId)) {
    throw new Error(`Unsupported API key id: ${input}`)
  }
  return input as ApiKeyId
}

function loadEncryptedApiKeyStore(): EncryptedApiKeyStore {
  const storePath = getEncryptedApiKeyStorePath()
  if (!fs.existsSync(storePath)) return {}

  try {
    const raw = fs.readFileSync(storePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }

    const output: EncryptedApiKeyStore = {}
    for (const keyId of SUPPORTED_API_KEY_IDS) {
      const value = (parsed as Record<string, unknown>)[keyId]
      if (typeof value === 'string') {
        output[keyId] = value
      }
    }
    return output
  } catch {
    return {}
  }
}

function saveEncryptedApiKeyStore(store: EncryptedApiKeyStore): void {
  const storePath = getEncryptedApiKeyStorePath()
  const activeEntries = Object.entries(store).filter(([, value]) => typeof value === 'string' && value.length > 0)
  if (activeEntries.length === 0) {
    if (fs.existsSync(storePath)) {
      fs.unlinkSync(storePath)
    }
    return
  }

  fs.mkdirSync(path.dirname(storePath), { recursive: true })
  fs.writeFileSync(storePath, JSON.stringify(Object.fromEntries(activeEntries)), {
    encoding: 'utf-8',
    mode: 0o600,
  })
}

function getSecureApiKey(keyId: ApiKeyId): string | null {
  if (!isSecureApiKeyStorageAvailable()) {
    throw new Error('Secure storage is unavailable in this Electron session')
  }

  const store = loadEncryptedApiKeyStore()
  const encrypted = store[keyId]
  if (!encrypted) return null

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64')).trim()
    return decrypted.length > 0 ? decrypted : null
  } catch {
    return null
  }
}

function setSecureApiKey(keyId: ApiKeyId, value: string | null): void {
  if (!isSecureApiKeyStorageAvailable()) {
    throw new Error('Secure storage is unavailable in this Electron session')
  }

  const normalized = typeof value === 'string' ? value.trim() : ''
  const store = loadEncryptedApiKeyStore()
  if (normalized.length === 0) {
    delete store[keyId]
  } else {
    store[keyId] = safeStorage.encryptString(normalized).toString('base64')
  }
  saveEncryptedApiKeyStore(store)
}

function getCorpusDir(): string {
  if (app.isPackaged) {
    return getResourcePath('corpus')
  }
  // Dev: corpus lives in userData (copied there by prepare-corpus scripts)
  return path.join(app.getPath('userData'), 'corpus')
}

function getCorpusPath(family: CorpusFamily, tier: CorpusTier): string {
  const candidateDirs = app.isPackaged
    ? [getCorpusDir()]
    : [getCorpusDir(), getResourcePath('scripts', 'prepare-corpus')]

  for (const corpusDir of candidateDirs) {
    const explicitFamilyPath = path.join(corpusDir, `corpus-${family}-${tier}.jsonl`)
    if (fs.existsSync(explicitFamilyPath)) {
      return explicitFamilyPath
    }
    // Backward compatibility: pre-family naming for Wikipedia corpus.
    if (family === 'wiki') {
      const legacyWikiPath = path.join(corpusDir, `corpus-${tier}.jsonl`)
      if (fs.existsSync(legacyWikiPath)) {
        return legacyWikiPath
      }
    }
  }

  return path.join(candidateDirs[0], `corpus-${family}-${tier}.jsonl`)
}

function ensureCorpusLoaded(family: CorpusFamily, tier: CorpusTier): boolean {
  const key = corpusKey(family, tier)
  if (corpusCache.has(key)) return true

  const corpusPath = getCorpusPath(family, tier)
  if (!fs.existsSync(corpusPath)) return false

  console.log(`Loading ${family}/${tier} corpus from ${corpusPath} ...`)
  const start = Date.now()
  const content = fs.readFileSync(corpusPath, 'utf-8')
  const lines = content.trim().split('\n')
  const articles: CorpusArticle[] = []

  for (const line of lines) {
    try {
      const article = JSON.parse(line) as CorpusArticle
      articles.push(article)
    } catch {
      // skip malformed lines
    }
  }

  corpusCache.set(key, { articles })
  console.log(`Corpus ${family}/${tier} loaded: ${articles.length} articles (${Date.now() - start}ms)`)
  return true
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow?.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  protocol.handle('reader-asset', (request) => {
    try {
      const requestUrl = new URL(request.url)
      const fileUrl = requestUrl.searchParams.get('fileUrl')
      if (!fileUrl) {
        return new Response('Missing fileUrl query parameter', { status: 400 })
      }

      const parsedFileUrl = new URL(fileUrl)
      if (parsedFileUrl.protocol !== 'file:') {
        return new Response('Unsupported asset protocol', { status: 400 })
      }

      const requestedPath = fileURLToPath(parsedFileUrl)
      const allowedPath = resolveAllowedLibraryPath(requestedPath)
      return net.fetch(pathToFileURL(allowedPath).toString())
    } catch (err) {
      console.error('Failed to serve reader asset:', err)
      return new Response('Asset not found', { status: 404 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('library:getSources', () => {
  return getConfiguredSources()
})

ipcMain.handle('library:listBooks', async (_, dirPath: string) => {
  const allowedPath = resolveAllowedLibraryPath(dirPath)
  return scanDirectory(allowedPath)
})

ipcMain.handle('library:openBook', async (_, filePath: string) => {
  try {
    const allowedPath = resolveAllowedLibraryPath(filePath)
    const ext = path.extname(allowedPath).toLowerCase()
    if (!SUPPORTED_BOOK_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported file type: ${ext}`)
    }
    console.log(`Opening book: ${allowedPath} (${ext})`)
    if (ext === '.pdf') {
      const result = await extractPdfText(allowedPath)
      console.log(`PDF extracted: ${result.title}, ${result.content.length} chars`)
      return { ...result, sourcePath: allowedPath }
    } else if (ext === '.epub') {
      const result = await extractEpubText(allowedPath)
      console.log(`EPUB extracted: ${result.title}, ${result.content.length} chars`)
      return { ...result, sourcePath: allowedPath }
    } else if (ext === '.txt') {
      // Pre-processed text files - read directly
      const content = fs.readFileSync(allowedPath, 'utf-8')
      const title = path.basename(allowedPath, '.txt').replace(/-/g, ' ')
      const dirPath = path.dirname(allowedPath)
      const assetBaseUrl = pathToFileURL(`${dirPath}${path.sep}`).toString()
      console.log(`TXT loaded: ${title}, ${content.length} chars`)
      return { title, content, sourcePath: allowedPath, assetBaseUrl }
    }
    throw new Error(`Unsupported file type: ${ext}`)
  } catch (err) {
    console.error('Error opening book:', err)
    throw err
  }
})

ipcMain.handle('library:addSource', async (_, source: LibrarySource) => {
  const normalized = normalizePath(source.path)
  if (!normalized) {
    throw new Error('Directory does not exist')
  }
  if (!fs.statSync(normalized).isDirectory()) {
    throw new Error('Library source must be a directory')
  }
  addSource({ ...source, path: normalized })
})

ipcMain.handle('library:removeSource', async (_, sourcePath: string) => {
  const normalized = path.resolve(sourcePath)
  removeSource(normalized)
})

ipcMain.handle('library:selectDirectory', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Library Directory',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('library:exportManifest', async () => {
  if (!mainWindow) {
    throw new Error('Main window is not available')
  }

  const sources = getConfiguredSources()
  if (sources.length === 0) {
    throw new Error('No library sources configured')
  }

  const suggestedDir = app.getPath('documents')
  const suggestedName = `reader-library-manifest-${new Date().toISOString().slice(0, 10)}.json`
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Library Manifest',
    defaultPath: path.join(suggestedDir, suggestedName),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (saveResult.canceled || !saveResult.filePath) {
    return { status: 'cancelled' as const }
  }

  const manifest = await buildLibraryManifest()
  saveLibraryManifest(manifest, saveResult.filePath)

  return {
    status: 'exported' as const,
    path: saveResult.filePath,
    sourceCount: manifest.sources.length,
    entryCount: manifest.entries.length,
  }
})

ipcMain.handle('library:importManifest', async () => {
  if (!mainWindow) {
    throw new Error('Main window is not available')
  }

  const manifestPick = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Library Manifest',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (manifestPick.canceled || manifestPick.filePaths.length === 0) {
    return { status: 'cancelled' as const }
  }

  const sharedRootPick = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Shared Library Root Folder',
    properties: ['openDirectory'],
  })
  if (sharedRootPick.canceled || sharedRootPick.filePaths.length === 0) {
    return { status: 'cancelled' as const }
  }

  const manifestPath = manifestPick.filePaths[0]
  const sharedRootPath = sharedRootPick.filePaths[0]
  const manifest = loadLibraryManifest(manifestPath)
  const summary = importLibraryManifest(manifest, sharedRootPath)

  return {
    status: 'imported' as const,
    manifestPath,
    sharedRootPath,
    ...summary,
  }
})

ipcMain.handle('secure-keys:isAvailable', () => {
  return isSecureApiKeyStorageAvailable()
})

ipcMain.handle('secure-keys:get', (_, keyId: string) => {
  const validKeyId = parseApiKeyId(keyId)
  return getSecureApiKey(validKeyId)
})

ipcMain.handle('secure-keys:set', (_, keyId: string, value: string | null) => {
  const validKeyId = parseApiKeyId(keyId)
  setSecureApiKey(validKeyId, value)
})

// Corpus IPC handlers
ipcMain.handle('corpus:getInfo', () => {
  const info: Record<string, Record<string, { available: boolean; totalArticles: number }>> = {}
  for (const family of CORPUS_FAMILIES) {
    info[family] = {}
    for (const tier of CORPUS_TIERS) {
      const loaded = ensureCorpusLoaded(family, tier)
      const data = corpusCache.get(corpusKey(family, tier))
      info[family][tier] = {
        available: loaded,
        totalArticles: data?.articles.length ?? 0,
      }
    }
  }
  return info
})

ipcMain.handle('corpus:sampleArticle', (_, familyOrTier: CorpusFamily | CorpusTier, maybeTier?: CorpusTier) => {
  const family: CorpusFamily = maybeTier ? familyOrTier as CorpusFamily : 'wiki'
  const tier: CorpusTier | undefined = maybeTier ?? (familyOrTier as CorpusTier)
  if (!CORPUS_FAMILIES.includes(family)) return null
  if (!tier || !CORPUS_TIERS.includes(tier)) return null
  if (!ensureCorpusLoaded(family, tier)) return null
  const data = corpusCache.get(corpusKey(family, tier))
  if (!data || data.articles.length === 0) return null
  return data.articles[Math.floor(Math.random() * data.articles.length)]
})
