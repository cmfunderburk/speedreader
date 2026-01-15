import * as fs from 'fs'
import * as path from 'path'
import { cleanupText, CleanupOptions } from './cleanup'

interface PdfExtractResult {
  title: string
  content: string
  pageCount: number
}

export interface PdfExtractOptions extends CleanupOptions {
  cleanup?: boolean
}

const defaultPdfOptions: PdfExtractOptions = {
  cleanup: true,
  removeReferences: true,
  removeAbstract: false, // Keep abstract - often useful context
  removeAffiliations: true,
  removePageNumbers: true,
  removeFootnotes: false, // Keep footnotes - often have valuable info
  repairHyphenation: true,
  normalizeLineBreaks: true,
  removeRunningHeaders: true,
  removeWebMetadata: true,
}

export async function extractPdfText(
  filePath: string,
  options: PdfExtractOptions = {}
): Promise<PdfExtractResult> {
  const opts = { ...defaultPdfOptions, ...options }
  const { PDFParse } = require('pdf-parse')

  const buffer = fs.readFileSync(filePath)
  const uint8Array = new Uint8Array(buffer)
  const parser = new PDFParse(uint8Array)

  await parser.load()

  // Get text content
  const textResult = await parser.getText()
  let content = textResult.text || ''

  // Basic whitespace cleanup
  content = content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Apply content cleanup (remove references, affiliations, etc.)
  if (opts.cleanup) {
    content = cleanupText(content, {
      removeReferences: opts.removeReferences,
      removeAbstract: opts.removeAbstract,
      removeAffiliations: opts.removeAffiliations,
      removePageNumbers: opts.removePageNumbers,
      removeFootnotes: opts.removeFootnotes,
      repairHyphenation: opts.repairHyphenation,
      normalizeLineBreaks: opts.normalizeLineBreaks,
      removeRunningHeaders: opts.removeRunningHeaders,
      removeWebMetadata: opts.removeWebMetadata,
    })
  }

  // Get info for title and page count
  const info = await parser.getInfo()
  const pageCount = info.total || textResult.total || 0

  // Try to get title from metadata, fall back to filename
  let title = info.info?.Title || path.basename(filePath, '.pdf')

  // Clean up title if it's just the filename
  if (title === path.basename(filePath, '.pdf')) {
    title = title
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
  }

  await parser.destroy()

  return {
    title,
    content,
    pageCount,
  }
}
