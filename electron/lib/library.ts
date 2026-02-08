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

export async function scanDirectory(dirPath: string): Promise<LibraryItem[]> {
  const items: LibraryItem[] = []
  const rootPath = path.resolve(dirPath)

  async function scanRecursive(currentPath: string): Promise<void> {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await scanRecursive(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (ext === '.pdf' || ext === '.epub' || ext === '.txt') {
            try {
              const stats = fs.statSync(fullPath)

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

  await scanRecursive(dirPath)

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
