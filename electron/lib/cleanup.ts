/**
 * Text cleanup utilities for academic papers, books, and other documents.
 * Removes frontmatter, backmatter, references, and other non-content elements.
 * Optimized for speed reading flow.
 */

export interface CleanupOptions {
  removeReferences?: boolean
  removeAbstract?: boolean
  removeAffiliations?: boolean
  removePageNumbers?: boolean
  removeFootnotes?: boolean
  repairHyphenation?: boolean
  normalizeLineBreaks?: boolean
  removeRunningHeaders?: boolean
  removeWebMetadata?: boolean
}

const defaultOptions: CleanupOptions = {
  removeReferences: true,
  removeAbstract: false, // Keep abstract by default - it's often useful context
  removeAffiliations: true,
  removePageNumbers: true,
  removeFootnotes: false, // Keep footnotes by default - they often have valuable info
  repairHyphenation: true,
  normalizeLineBreaks: true,
  removeRunningHeaders: true,
  removeWebMetadata: true,
}

/**
 * Clean up extracted text content by removing common academic paper artifacts.
 */
export function cleanupText(content: string, options: CleanupOptions = {}): string {
  const opts = { ...defaultOptions, ...options }
  let text = content

  // First pass: repair hyphenation (words split across lines)
  if (opts.repairHyphenation) {
    text = repairHyphenation(text)
  }

  // Remove web print metadata (copyright notices, timestamps, URLs)
  if (opts.removeWebMetadata) {
    text = removeWebMetadata(text)
  }

  // Remove page numbers (various formats)
  if (opts.removePageNumbers) {
    text = removePageNumbers(text)
  }

  // Remove running headers/footers
  if (opts.removeRunningHeaders) {
    text = removeRunningHeaders(text)
  }

  // Remove affiliations (email addresses, department/university lines near start)
  if (opts.removeAffiliations) {
    text = removeAffiliations(text)
  }

  // Remove abstract section
  if (opts.removeAbstract) {
    text = removeAbstract(text)
  }

  // Remove references/bibliography section (usually at end)
  if (opts.removeReferences) {
    text = removeReferences(text)
  }

  // Remove footnotes
  if (opts.removeFootnotes) {
    text = removeFootnotes(text)
  }

  // Normalize line breaks for better reading flow
  if (opts.normalizeLineBreaks) {
    text = normalizeLineBreaks(text)
  }

  // Final cleanup: normalize whitespace
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  return text
}

/**
 * Repair hyphenation - rejoin words that were split across lines.
 * E.g., "impor-\ntant" becomes "important"
 */
function repairHyphenation(text: string): string {
  // Match word fragment + hyphen + newline + continuation
  // Only rejoin if it looks like a word continuation (lowercase start)
  return text.replace(/(\w+)-\n([a-z])/g, '$1$2')
}

/**
 * Remove web print metadata: copyright notices, Creative Commons blocks,
 * publication info, and other boilerplate at document start.
 */
function removeWebMetadata(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inMetadataBlock = true
  let contentStarted = false
  let linesChecked = 0
  const maxMetadataLines = 50 // Only check first 50 lines for metadata

  for (const line of lines) {
    const trimmed = line.trim()
    linesChecked++

    // After max lines, just include everything
    if (linesChecked > maxMetadataLines) {
      result.push(line)
      continue
    }

    // Skip empty lines at the very start
    if (!contentStarted && !trimmed) {
      continue
    }

    // Check if this looks like metadata to skip
    if (inMetadataBlock) {
      // Skip URL lines
      if (/^https?:\/\//.test(trimmed)) {
        continue
      }

      // Skip Creative Commons / copyright lines
      if (/creative\s*commons|copyright|©|\(c\)|public\s*domain|all\s*rights\s*reserved/i.test(trimmed)) {
        continue
      }

      // Skip license attribution lines
      if (/released|licensed|permission|attribution|non-?commercial/i.test(trimmed) && trimmed.length < 200) {
        continue
      }

      // Skip publication info (journal, volume, pages, year)
      // Use word boundaries for month names to avoid matching common words like "may"
      if (/\bvol\.\s*\d+|\bno\.\s*\d+|\bpp\.\s*\d+|\bpages?\s+\d+|\b\d{4}\b.*\b\d{4}\b/i.test(trimmed) && trimmed.length < 200) {
        continue
      }
      // Month patterns (require nearby year or comma for date context)
      if (/\b(jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s*\d{1,2}(,|\s)\s*\d{4}/i.test(trimmed) && trimmed.length < 150) {
        continue
      }

      // Skip "This digital edition" type lines
      if (/^this\s+(digital|electronic|online)\s+(edition|version|copy|text)/i.test(trimmed)) {
        continue
      }

      // Skip lines that are part of "based on" citation blocks
      if (/^(this\s+)?(edition|version|text)\s+(is\s+)?based\s+on/i.test(trimmed)) {
        continue
      }

      // Skip date/time stamps with page info
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}.*\d{1,2}:\d{2}/.test(trimmed)) {
        continue
      }

      // Skip lines that are just a project/website name with page numbers
      if (/project|wittgenstein|stanford|archive|library/i.test(trimmed) && /\d+\/\d+/.test(trimmed)) {
        continue
      }

      // Skip short title-like lines (author names, document titles)
      // These often appear at the start before the actual content
      if (trimmed.length < 60 && !trimmed.includes('.') && !trimmed.includes(',')) {
        // Looks like a title or name - keep it but don't treat as content start
        result.push(line)
        contentStarted = true
        continue
      }

      // Once we hit a substantial line of actual content, stop skipping
      // Content is: longer than 100 chars, or a proper sentence
      if (trimmed.length > 100 || /^[A-Z][a-z].+[.!?]$/.test(trimmed)) {
        // But if it's the same as a previous line (duplicate title), skip it
        if (result.length > 0) {
          const lastContent = result[result.length - 1].trim().toLowerCase()
          if (lastContent && trimmed.toLowerCase() === lastContent) {
            continue
          }
        }
        inMetadataBlock = false
      }
    }

    contentStarted = true
    result.push(line)
  }

  return result.join('\n')
}

/**
 * Remove standalone page numbers in various formats.
 */
function removePageNumbers(text: string): string {
  // Simple numbers on their own line: "5", " 42 "
  text = text.replace(/^\s*\d{1,4}\s*$/gm, '')

  // "Page 5" or "page 5" formats
  text = text.replace(/^\s*[Pp]age\s+\d{1,4}\s*$/gm, '')

  // "- 5 -" or "— 5 —" centered page numbers
  text = text.replace(/^\s*[-—]\s*\d{1,4}\s*[-—]\s*$/gm, '')

  // "-- 5 of 100 --" format (common in web-to-PDF)
  text = text.replace(/^\s*--\s*\d{1,4}\s+of\s+\d{1,4}\s*--\s*$/gm, '')

  // "5 of 100" or "5/100" formats (standalone line or at end of line)
  text = text.replace(/^\s*\d{1,4}\s*(of|\/)\s*\d{1,4}\s*$/gm, '')

  // Page fraction at end of lines (like "1/8" at end): common in web prints
  text = text.replace(/\s+\d{1,4}\/\d{1,4}\s*$/gm, '')

  // Roman numerals (common in frontmatter): i, ii, iii, iv, v, vi, vii, viii, ix, x, xi, xii
  text = text.replace(/^\s*(i{1,3}|iv|vi{0,3}|ix|xi{0,2})\s*$/gim, '')

  // "[5]" or "(5)" page numbers
  text = text.replace(/^\s*[\[(]\d{1,4}[\])]\s*$/gm, '')

  // URL lines (common in web-to-PDF conversions)
  text = text.replace(/^\s*https?:\/\/[^\s]+\s*$/gm, '')

  // Web print timestamps: "12/23/25, 9:21 AM" at start of line
  text = text.replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(AM|PM)?\s*/gm, '')

  return text
}

/**
 * Remove running headers and footers (repeated short lines).
 * These are typically chapter titles, author names, or book titles
 * that appear on every page.
 */
function removeRunningHeaders(text: string): string {
  const lines = text.split('\n')

  // Count frequency of short lines (likely headers/footers)
  const shortLineFrequency = new Map<string, number>()
  for (const line of lines) {
    const trimmed = line.trim()
    // Only consider short lines (typical header/footer length)
    if (trimmed.length > 0 && trimmed.length < 80) {
      // Normalize for comparison (ignore case, collapse whitespace)
      const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ')
      shortLineFrequency.set(normalized, (shortLineFrequency.get(normalized) || 0) + 1)
    }
  }

  // Find lines that appear frequently (threshold: more than 3 times)
  // These are likely running headers/footers
  const repeatedLines = new Set<string>()
  for (const [line, count] of shortLineFrequency) {
    if (count > 3) {
      repeatedLines.add(line)
    }
  }

  // Filter out the repeated lines
  if (repeatedLines.size > 0) {
    return lines
      .filter((line) => {
        const normalized = line.trim().toLowerCase().replace(/\s+/g, ' ')
        return !repeatedLines.has(normalized)
      })
      .join('\n')
  }

  return text
}

/**
 * Normalize line breaks for better reading flow.
 * Joins lines that were broken mid-sentence by PDF layout.
 */
function normalizeLineBreaks(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let currentParagraph = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Empty line = paragraph break
    if (!line) {
      if (currentParagraph) {
        result.push(currentParagraph)
        currentParagraph = ''
      }
      result.push('')
      continue
    }

    // Check if this line should be joined with the previous
    const shouldJoin = currentParagraph && !isParagraphEnd(currentParagraph) && !isParagraphStart(line)

    if (shouldJoin) {
      // Join with space (the line was broken mid-sentence)
      currentParagraph += ' ' + line
    } else {
      // Start new paragraph
      if (currentParagraph) {
        result.push(currentParagraph)
      }
      currentParagraph = line
    }
  }

  // Don't forget the last paragraph
  if (currentParagraph) {
    result.push(currentParagraph)
  }

  return result.join('\n')
}

/**
 * Check if a line looks like the end of a paragraph.
 */
function isParagraphEnd(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true

  // Ends with sentence-ending punctuation
  if (/[.!?:]["']?\s*$/.test(trimmed)) return true

  // Ends with closing quote after punctuation
  if (/[.!?]["']\s*$/.test(trimmed)) return true

  // Very short line (likely a heading or caption)
  if (trimmed.length < 50 && !/[,;]$/.test(trimmed)) return true

  return false
}

/**
 * Check if a line looks like the start of a new paragraph.
 */
function isParagraphStart(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  // Starts with a number (likely a list or section)
  if (/^\d+[.)\s]/.test(trimmed)) return true

  // Starts with a bullet or dash
  if (/^[-•*]\s/.test(trimmed)) return true

  // Starts with capital after potential indent (new sentence/paragraph)
  // But only if the line is reasonably long (not a continuation)
  if (/^[A-Z]/.test(trimmed) && trimmed.length > 60) return true

  // Starts with a section marker like "(a)" or "a)"
  if (/^[a-z]\)\s/i.test(trimmed)) return true

  return false
}

/**
 * Remove author affiliations (emails, university/department names near document start)
 */
function removeAffiliations(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inAffiliationBlock = false
  let linesSinceStart = 0
  const affiliationLimit = 30 // Only check first 30 lines for affiliations

  for (const line of lines) {
    linesSinceStart++

    // Only process affiliations in the header area
    if (linesSinceStart <= affiliationLimit) {
      // Skip email addresses
      if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(line)) {
        continue
      }

      // Skip university/department/institution lines
      if (/\b(university|department|institute|college|school|laboratory|lab)\b/i.test(line) &&
          line.length < 150) {
        continue
      }

      // Skip lines that look like author addresses (require word boundaries on street terms)
      if (/^\s*(\d+\s+)?[A-Z][a-z]+(\s+[A-Z][a-z]+)*,?\s+\b(Street|Avenue|Road|Drive|Boulevard)\b/i.test(line) ||
          /^\s*\d+\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s+(St|Ave|Rd|Dr|Blvd)\.?\s*$/i.test(line)) {
        continue
      }
    }

    result.push(line)
  }

  return result.join('\n')
}

/**
 * Remove abstract section from academic papers
 */
function removeAbstract(text: string): string {
  // Match "Abstract" heading and content until next section or double newline
  // Common patterns: "Abstract", "ABSTRACT", "Abstract:", "Abstract."
  const abstractPattern = /^(Abstract|ABSTRACT)[\s.:]*\n([\s\S]*?)(?=\n\n[A-Z1-9]|\n\n\n|\n[A-Z][a-z]+\s*\n|$)/im

  return text.replace(abstractPattern, '')
}

/**
 * Remove references/bibliography section (typically at end of papers)
 */
function removeReferences(text: string): string {
  // Find the last occurrence of references section header
  const refHeaders = [
    /\n(References|REFERENCES)\s*\n/g,
    /\n(Bibliography|BIBLIOGRAPHY)\s*\n/g,
    /\n(Works Cited|WORKS CITED)\s*\n/g,
    /\n(Citations|CITATIONS)\s*\n/g,
    /\n(Literature Cited|LITERATURE CITED)\s*\n/g,
  ]

  let lastRefIndex = -1

  for (const pattern of refHeaders) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      // Take the last occurrence (references are usually at the end)
      if (match.index > lastRefIndex) {
        lastRefIndex = match.index
      }
    }
  }

  // If we found a references section, remove it and everything after
  if (lastRefIndex > 0) {
    // Make sure we're not removing too much content (refs should be in last 40% of doc)
    if (lastRefIndex > text.length * 0.6) {
      return text.substring(0, lastRefIndex).trim()
    }
  }

  return text
}

/**
 * Remove footnotes (bracketed numbers at start of lines, numbered references)
 */
function removeFootnotes(text: string): string {
  // Remove lines that start with bracketed numbers like [1], [2], etc.
  text = text.replace(/^\[\d+\]\s*.+$/gm, '')

  // Remove inline footnote markers but keep the sentence flow
  text = text.replace(/\[\d+\]/g, '')

  return text
}

/**
 * Determine if a chapter title suggests it's frontmatter or backmatter that should be skipped.
 */
export function shouldSkipChapter(title: string): boolean {
  if (!title) return false

  const lowerTitle = title.toLowerCase().trim()

  // Frontmatter patterns
  const frontmatterPatterns = [
    /^(front\s*matter|frontmatter)$/,
    /^(title\s*page|cover)$/,
    /^(copyright|rights|legal)$/,
    /^(table\s*of\s*contents|toc|contents)$/,
    /^(dedication|epigraph)$/,
    /^(foreword|preface|prologue)$/,
    /^(acknowledgements?|acknowledgments?)$/,
    /^(about\s*the\s*author|author\s*bio)$/,
    /^(list\s*of\s*(figures|tables|illustrations))$/,
    /^(half\s*title|halftitle)$/,
  ]

  // Backmatter patterns
  const backmatterPatterns = [
    /^(back\s*matter|backmatter)$/,
    /^(bibliography|references|works\s*cited)$/,
    /^(index|indices)$/,
    /^(glossary|terminology)$/,
    /^(appendix|appendices)$/,
    /^(notes|endnotes)$/,
    /^(colophon)$/,
    /^(about\s*the\s*(publisher|press))$/,
    /^(also\s*by|other\s*books)$/,
  ]

  const allPatterns = [...frontmatterPatterns, ...backmatterPatterns]

  return allPatterns.some((pattern) => pattern.test(lowerTitle))
}

/**
 * Determine if content appears to be boilerplate (too short, list-like, or non-substantive).
 */
export function isBoilerplateContent(text: string, minWords: number = 100): boolean {
  if (!text) return true

  const trimmed = text.trim()
  if (!trimmed) return true

  // Count words
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0)
  if (words.length < minWords) {
    return true
  }

  // Check if content is mostly list-like (many short lines)
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length > 0) {
    const avgLineLength = trimmed.length / lines.length
    // If average line is very short, it's probably a list or TOC
    if (avgLineLength < 40 && lines.length > 5) {
      return true
    }
  }

  // Check for high ratio of numbers/symbols (likely an index or reference list)
  const alphaChars = (trimmed.match(/[a-zA-Z]/g) || []).length
  const totalChars = trimmed.replace(/\s/g, '').length
  if (totalChars > 0 && alphaChars / totalChars < 0.5) {
    return true
  }

  return false
}

/**
 * Detect if a filename suggests frontmatter content.
 */
export function isFrontmatterFilename(filename: string): boolean {
  const lowerName = filename.toLowerCase()

  const patterns = [
    /^00[-_]/, // Files starting with 00-
    /front[-_]?matter/,
    /^cover\./,
    /^toc\./,
    /table[-_]?of[-_]?contents/,
    /^title[-_]?page/,
    /^copyright/,
    /^preface\./,
    /^foreword\./,
    /^acknowledgement/,
    /^dedication\./,
    /^half[-_]?title/,
  ]

  return patterns.some((pattern) => pattern.test(lowerName))
}
