import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { isFrontmatterFilename } from './cleanup'

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

const SOURCES_FILE = 'library-sources.json'
const LIBRARY_MANIFEST_SCHEMA = 'reader-library-manifest'
const LIBRARY_MANIFEST_VERSION = 1

type SharedEntryType = 'pdf' | 'epub' | 'txt'

export interface LibraryManifestSource {
  name: string
  rootName: string
}

export interface LibraryManifestEntry {
  sourceName: string
  relativePath: string
  type: SharedEntryType
  normalizedTextRelativePath?: string
  size: number
  modifiedAt: number
}

export interface LibraryManifest {
  schema: typeof LIBRARY_MANIFEST_SCHEMA
  version: typeof LIBRARY_MANIFEST_VERSION
  exportedAt: string
  sources: LibraryManifestSource[]
  entries: LibraryManifestEntry[]
}

export interface LibraryManifestImportSourceResult {
  sourceName: string
  status: 'added' | 'existing' | 'missing'
  resolvedPath?: string
  message: string
}

export interface LibraryManifestImportResult {
  added: number
  existing: number
  missing: number
  results: LibraryManifestImportSourceResult[]
}

function getSourcesPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, SOURCES_FILE)
}

export function loadSources(): LibrarySource[] {
  try {
    const sourcesPath = getSourcesPath()
    if (fs.existsSync(sourcesPath)) {
      const data = fs.readFileSync(sourcesPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('Failed to load library sources:', err)
  }
  return []
}

export function saveSources(sources: LibrarySource[]): void {
  try {
    const sourcesPath = getSourcesPath()
    fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2))
  } catch (err) {
    console.error('Failed to save library sources:', err)
  }
}

export function getConfiguredSources(): LibrarySource[] {
  return loadSources()
}

export function addSource(source: LibrarySource): void {
  const sources = loadSources()
  // Don't add duplicates
  if (!sources.some((s) => s.path === source.path)) {
    sources.push(source)
    saveSources(sources)
  }
}

export function removeSource(sourcePath: string): void {
  const sources = loadSources()
  const normalizedTarget = path.resolve(sourcePath)
  const filtered = sources.filter((s) => path.resolve(s.path) !== normalizedTarget)
  saveSources(filtered)
}

function normalizeManifestPath(relativePath: string): string {
  return relativePath.split(path.sep).join('/')
}

function sourceRootName(sourcePath: string): string {
  return path.basename(path.resolve(sourcePath))
}

function resolveNormalizedTextSnapshot(rootPath: string, filePath: string, type: SharedEntryType): string | undefined {
  const relativePath = normalizeManifestPath(path.relative(rootPath, filePath))
  if (type === 'txt') return relativePath

  const parsed = path.parse(filePath)
  const sidecar = path.join(parsed.dir, `${parsed.name}.txt`)
  if (!fs.existsSync(sidecar)) return undefined
  if (!fs.statSync(sidecar).isFile()) return undefined

  const relativeSidecar = path.relative(rootPath, sidecar)
  if (relativeSidecar.startsWith('..') || path.isAbsolute(relativeSidecar)) {
    return undefined
  }
  return normalizeManifestPath(relativeSidecar)
}

export async function buildLibraryManifest(): Promise<LibraryManifest> {
  const sources = loadSources()
  const entries: LibraryManifestEntry[] = []

  for (const source of sources) {
    const rootPath = path.resolve(source.path)
    const items = await scanDirectory(rootPath)

    for (const item of items) {
      const relativePathRaw = path.relative(rootPath, item.path)
      if (!relativePathRaw || relativePathRaw.startsWith('..') || path.isAbsolute(relativePathRaw)) {
        continue
      }

      const type: SharedEntryType = item.type
      entries.push({
        sourceName: source.name,
        relativePath: normalizeManifestPath(relativePathRaw),
        type,
        normalizedTextRelativePath: resolveNormalizedTextSnapshot(rootPath, item.path, type),
        size: item.size,
        modifiedAt: item.modifiedAt,
      })
    }
  }

  return {
    schema: LIBRARY_MANIFEST_SCHEMA,
    version: LIBRARY_MANIFEST_VERSION,
    exportedAt: new Date().toISOString(),
    sources: sources.map((source) => ({
      name: source.name,
      rootName: sourceRootName(source.path),
    })),
    entries,
  }
}

export function saveLibraryManifest(manifest: LibraryManifest, targetPath: string): void {
  fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2), 'utf-8')
}

function isManifestEntryType(value: unknown): value is SharedEntryType {
  return value === 'pdf' || value === 'epub' || value === 'txt'
}

export function loadLibraryManifest(manifestPath: string): LibraryManifest {
  const raw = fs.readFileSync(manifestPath, 'utf-8')
  const parsed = JSON.parse(raw) as Partial<LibraryManifest>

  if (parsed.schema !== LIBRARY_MANIFEST_SCHEMA || parsed.version !== LIBRARY_MANIFEST_VERSION) {
    throw new Error('Unsupported library manifest format')
  }

  if (!Array.isArray(parsed.sources) || !Array.isArray(parsed.entries)) {
    throw new Error('Invalid library manifest payload')
  }

  for (const source of parsed.sources) {
    if (!source || typeof source.name !== 'string' || typeof source.rootName !== 'string') {
      throw new Error('Invalid manifest source entry')
    }
  }

  for (const entry of parsed.entries) {
    if (
      !entry ||
      typeof entry.sourceName !== 'string' ||
      typeof entry.relativePath !== 'string' ||
      !isManifestEntryType(entry.type) ||
      typeof entry.size !== 'number' ||
      typeof entry.modifiedAt !== 'number'
    ) {
      throw new Error('Invalid manifest content entry')
    }
  }

  return parsed as LibraryManifest
}

function isDirectory(candidatePath: string): boolean {
  try {
    return fs.statSync(candidatePath).isDirectory()
  } catch {
    return false
  }
}

export function importLibraryManifest(manifest: LibraryManifest, sharedRootPath: string): LibraryManifestImportResult {
  const sharedRoot = path.resolve(sharedRootPath)
  if (!isDirectory(sharedRoot)) {
    throw new Error('Shared root is not a directory')
  }

  const results: LibraryManifestImportSourceResult[] = []
  let added = 0
  let existing = 0
  let missing = 0

  const currentSources = loadSources()
  const knownPaths = new Set(currentSources.map((source) => path.resolve(source.path)))

  for (const source of manifest.sources) {
    const expectedRoot = path.join(sharedRoot, source.rootName)
    let resolvedPath: string | null = null

    if (isDirectory(expectedRoot)) {
      resolvedPath = path.resolve(expectedRoot)
    } else if (manifest.sources.length === 1) {
      resolvedPath = sharedRoot
    }

    if (!resolvedPath) {
      missing += 1
      results.push({
        sourceName: source.name,
        status: 'missing',
        message: `Missing folder "${source.rootName}" under shared root`,
      })
      continue
    }

    const entriesForSource = manifest.entries.filter((entry) => entry.sourceName === source.name)
    if (entriesForSource.length > 0) {
      const hasAtLeastOneMatchingFile = entriesForSource.some((entry) =>
        fs.existsSync(path.join(resolvedPath!, entry.relativePath))
      )

      if (!hasAtLeastOneMatchingFile) {
        missing += 1
        results.push({
          sourceName: source.name,
          status: 'missing',
          resolvedPath,
          message: 'No manifest files found under resolved folder',
        })
        continue
      }
    }

    if (knownPaths.has(resolvedPath)) {
      existing += 1
      results.push({
        sourceName: source.name,
        status: 'existing',
        resolvedPath,
        message: 'Source already configured',
      })
      continue
    }

    addSource({ name: source.name, path: resolvedPath })
    knownPaths.add(resolvedPath)
    added += 1
    results.push({
      sourceName: source.name,
      status: 'added',
      resolvedPath,
      message: 'Source added',
    })
  }

  return { added, existing, missing, results }
}

export async function scanDirectory(dirPath: string): Promise<LibraryItem[]> {
  const items: LibraryItem[] = []
  const rootPath = path.resolve(dirPath)

  async function scanRecursive(currentPath: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await scanRecursive(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (ext === '.pdf' || ext === '.epub' || ext === '.txt') {
            try {
              const stats = await fs.promises.stat(fullPath)

              // Compute parent directory relative to root
              // e.g., if root is /references and file is /references/book-name/chapter.pdf
              // then parentDir is "book-name"
              const relativePath = path.relative(rootPath, fullPath)
              const parentDir = path.dirname(relativePath)
              const hasParentDir = parentDir && parentDir !== '.'

              items.push({
                name: entry.name,
                path: fullPath,
                type: ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : 'txt',
                size: stats.size,
                modifiedAt: stats.mtimeMs,
                parentDir: hasParentDir ? parentDir : undefined,
                isFrontmatter: isFrontmatterFilename(entry.name),
              })
            } catch (err) {
              // Skip files we can't stat
              console.warn(`Failed to stat ${fullPath}:`, err)
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to scan directory ${currentPath}:`, err)
    }
  }

  await scanRecursive(rootPath)

  // Sort by parent directory first, then by name within each group
  items.sort((a, b) => {
    const parentA = a.parentDir || ''
    const parentB = b.parentDir || ''
    if (parentA !== parentB) {
      return parentA.localeCompare(parentB)
    }
    return a.name.localeCompare(b.name)
  })

  return items
}
