import * as path from 'path'
import { shouldSkipChapter, isBoilerplateContent } from './cleanup'

interface EpubChapter {
  title: string
  content: string
}

interface EpubExtractResult {
  title: string
  content: string
  chapters: EpubChapter[]
}

export interface EpubExtractOptions {
  skipFrontmatter?: boolean
  skipBackmatter?: boolean
  minChapterWords?: number
}

const defaultEpubOptions: EpubExtractOptions = {
  skipFrontmatter: true,
  skipBackmatter: true,
  minChapterWords: 100,
}

export async function extractEpubText(
  filePath: string,
  options: EpubExtractOptions = {}
): Promise<EpubExtractResult> {
  const opts = { ...defaultEpubOptions, ...options }
  const EPub = require('epub')
  const { JSDOM } = require('jsdom')

  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath)

    epub.on('error', (err: Error) => {
      reject(err)
    })

    epub.on('end', async () => {
      try {
        // Get title from metadata
        let title = epub.metadata?.title || path.basename(filePath, '.epub')

        // Clean up title if it's just the filename
        if (title === path.basename(filePath, '.epub')) {
          title = title
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase())
        }

        const chapters: EpubChapter[] = []
        const allText: string[] = []

        // Get chapters from flow (reading order)
        const flow = epub.flow || []

        for (const item of flow) {
          if (item.id) {
            try {
              const chapterTitle = item.title || `Chapter ${chapters.length + 1}`

              // Skip frontmatter/backmatter chapters by title
              if (opts.skipFrontmatter || opts.skipBackmatter) {
                if (shouldSkipChapter(chapterTitle)) {
                  console.log(`Skipping chapter: ${chapterTitle}`)
                  continue
                }
              }

              const chapterText = await getChapterText(epub, item.id)

              // Skip empty chapters
              if (!chapterText.trim()) {
                continue
              }

              // Skip boilerplate content (too short or list-like)
              if (isBoilerplateContent(chapterText, opts.minChapterWords)) {
                console.log(`Skipping boilerplate chapter: ${chapterTitle}`)
                continue
              }

              chapters.push({
                title: chapterTitle,
                content: chapterText,
              })
              allText.push(chapterText)
            } catch (err) {
              console.warn(`Failed to load chapter ${item.id}:`, err)
            }
          }
        }

        const content = allText.join('\n\n---\n\n')

        resolve({
          title,
          content,
          chapters,
        })
      } catch (err) {
        reject(err)
      }
    })

    epub.parse()
  })
}

function getChapterText(epub: any, chapterId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapter(chapterId, (err: Error | null, html: string) => {
      if (err) {
        reject(err)
        return
      }

      try {
        const { JSDOM } = require('jsdom')
        const dom = new JSDOM(html)
        const doc = dom.window.document

        // Remove script and style elements
        const scripts = doc.querySelectorAll('script, style, noscript')
        scripts.forEach((el: Element) => el.remove())

        // Get text content
        const body = doc.body || doc.documentElement
        let text = body?.textContent || ''

        // Clean up whitespace
        text = text
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n/g, '\n\n')
          .trim()

        resolve(text)
      } catch (parseErr) {
        reject(parseErr)
      }
    })
  })
}
