import type { Chunk, SaccadePage, SaccadeLine } from '../types';
import { normalizeText, calculateORP, wordPenalty } from './tokenizer';

export const SACCADE_LINE_WIDTH = 80;
export const SACCADE_LINES_PER_PAGE = 15;

/**
 * Calculate how long a saccade line should be displayed, in milliseconds.
 * Uses character count as the basis: 5 characters = 1 word at the given WPM.
 */
export function calculateSaccadeLineDuration(textLength: number, wpm: number): number {
  if (textLength <= 0 || wpm <= 0) return 0;
  return (textLength / 5) * (60000 / wpm);
}

/**
 * Compute character indices within a line where fixation ORP highlights should appear.
 * Returns absolute character positions into lineText for each fixation point.
 *
 * Uses a scoring model that penalizes short and function words, preferring
 * fixations on longer content words. See docs/saccade/01-scoring-function-v1.md.
 */
export function computeLineFixations(lineText: string, saccadeLength: number): number[] {
  const words: { word: string; start: number; orpPos: number }[] = [];
  const regex = /\S+/g;
  let m;
  while ((m = regex.exec(lineText)) !== null) {
    const word = m[0];
    words.push({
      word,
      start: m.index,
      orpPos: m.index + calculateORP(word),
    });
  }

  if (words.length === 0) return [];

  const aggression = Math.max(0, Math.min(1, (saccadeLength - 7) / 8));
  const skipScale = 0.8 + 0.4 * aggression;
  const maxJump = saccadeLength + 6;

  // First fixation: skip short first word if a second word exists
  const firstIdx = (words[0].word.length <= 3 && words.length > 1) ? 1 : 0;
  const fixations: number[] = [words[firstIdx].orpPos];
  let lastFixIdx = firstIdx;

  while (true) {
    const lastPos = fixations[fixations.length - 1];
    const target = lastPos + saccadeLength;

    // Score candidates within max jump window
    let bestIdx = -1;
    let bestScore = Infinity;
    let bestLen = 0;

    for (let i = lastFixIdx + 1; i < words.length; i++) {
      if (words[i].orpPos - lastPos > maxJump) continue;
      const score = Math.abs(words[i].orpPos - target)
        + skipScale * wordPenalty(words[i].word);
      if (score < bestScore - 0.001
          || (Math.abs(score - bestScore) < 0.001 && words[i].word.length > bestLen)) {
        bestIdx = i;
        bestScore = score;
        bestLen = words[i].word.length;
      }
    }

    // Fallback: if nothing in window, take best remaining forward word
    if (bestIdx === -1) {
      for (let i = lastFixIdx + 1; i < words.length; i++) {
        const score = Math.abs(words[i].orpPos - target)
          + skipScale * wordPenalty(words[i].word);
        if (score < bestScore - 0.001
            || (Math.abs(score - bestScore) < 0.001 && words[i].word.length > bestLen)) {
          bestIdx = i;
          bestScore = score;
          bestLen = words[i].word.length;
        }
      }
    }

    if (bestIdx === -1) break;

    fixations.push(words[bestIdx].orpPos);
    lastFixIdx = bestIdx;
  }

  return fixations;
}

// Markdown heading pattern: # Heading, ## Heading, etc.
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

/**
 * Detect if a line is a markdown heading.
 */
function detectHeading(line: string): { isHeading: boolean; level: number; text: string } {
  const match = line.match(HEADING_PATTERN);
  if (match) {
    return { isHeading: true, level: match[1].length, text: match[2] };
  }
  return { isHeading: false, level: 0, text: line };
}

/**
 * Word-wrap a paragraph into lines of specified width.
 */
function wrapParagraph(text: string, lineWidth: number): SaccadeLine[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const lines: SaccadeLine[] = [];
  let currentLine = '';

  for (const word of words) {
    const wouldBe = currentLine.length === 0 ? word : currentLine + ' ' + word;

    if (wouldBe.length <= lineWidth) {
      currentLine = wouldBe;
    } else {
      if (currentLine.length > 0) {
        lines.push({ text: currentLine, type: 'body' });
      }
      if (word.length > lineWidth) {
        lines.push({ text: word, type: 'body' });
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push({ text: currentLine, type: 'body' });
  }

  return lines;
}

/**
 * Flow text into fixed-width lines using word wrapping.
 * Respects paragraph breaks (double newlines) and markdown headings.
 * Collapses single newlines into spaces to reflow ragged PDF extractions.
 */
export function flowTextIntoLines(text: string, lineWidth: number): SaccadeLine[] {
  const normalized = normalizeText(text);

  // Split into blocks (paragraphs/headings separated by blank lines)
  const blocks = normalized
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  const lines: SaccadeLine[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Check if first line is a heading
    const firstLine = block.split('\n')[0].trim();
    const heading = detectHeading(firstLine);

    if (heading.isHeading) {
      // Add blank line before heading (if not first)
      if (lines.length > 0 && lines[lines.length - 1].type !== 'blank') {
        lines.push({ text: '', type: 'blank' });
      }
      // Add the heading
      lines.push({ text: heading.text, type: 'heading', level: heading.level });
      // Add blank line after heading
      lines.push({ text: '', type: 'blank' });

      // If there's more content after the heading line, process it as a paragraph
      const restOfBlock = block.split('\n').slice(1).join(' ').trim();
      if (restOfBlock.length > 0) {
        const wrappedLines = wrapParagraph(restOfBlock, lineWidth);
        lines.push(...wrappedLines);
      }
    } else {
      // Regular paragraph - collapse newlines into spaces and word wrap
      const paragraph = block.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      const wrappedLines = wrapParagraph(paragraph, lineWidth);
      lines.push(...wrappedLines);
    }

    // Add blank line between blocks (not after last)
    if (i < blocks.length - 1) {
      // Only add if last line isn't already blank
      if (lines.length > 0 && lines[lines.length - 1].type !== 'blank') {
        lines.push({ text: '', type: 'blank' });
      }
    }
  }

  return lines;
}

/**
 * Group lines into raw pages.
 */
function groupIntoPages(lines: SaccadeLine[], linesPerPage: number): { lines: SaccadeLine[] }[] {
  const pages: { lines: SaccadeLine[] }[] = [];

  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push({
      lines: lines.slice(i, i + linesPerPage),
    });
  }

  return pages;
}

/**
 * Count words in a string.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Tokenize text for saccade mode.
 * Returns pages (for display) and a flat array of chunks (for playback timer).
 *
 * Each non-blank line produces exactly one chunk. The timer advances line-by-line,
 * and the sweep animation duration is derived from each chunk's display time.
 */
export function tokenizeSaccade(
  text: string,
  linesPerPage: number = SACCADE_LINES_PER_PAGE
): { pages: SaccadePage[]; chunks: Chunk[] } {
  const lines = flowTextIntoLines(text, SACCADE_LINE_WIDTH);
  const rawPages = groupIntoPages(lines, linesPerPage);

  const allChunks: Chunk[] = [];
  const pages: SaccadePage[] = [];

  for (let pageIndex = 0; pageIndex < rawPages.length; pageIndex++) {
    const rawPage = rawPages[pageIndex];
    const pageLineChunks: Chunk[][] = [];

    for (let lineIndex = 0; lineIndex < rawPage.lines.length; lineIndex++) {
      const line = rawPage.lines[lineIndex];

      // Blank lines produce no chunks
      if (line.type === 'blank' || line.text.trim().length === 0) {
        pageLineChunks.push([]);
        continue;
      }

      const chunk: Chunk = {
        text: line.text,
        wordCount: countWords(line.text),
        orpIndex: 0,
        saccade: {
          pageIndex,
          lineIndex,
          startChar: 0,
          endChar: line.text.length,
        },
      };

      pageLineChunks.push([chunk]);
      allChunks.push(chunk);
    }

    pages.push({
      lines: rawPage.lines,
      lineChunks: pageLineChunks,
    });
  }

  return { pages, chunks: allChunks };
}

/**
 * Tokenize text for recall mode.
 * Same page layout as saccade, but produces one chunk per word (not per line)
 * so the user can type each word individually.
 */
export function tokenizeRecall(
  text: string,
  linesPerPage: number = SACCADE_LINES_PER_PAGE
): { pages: SaccadePage[]; chunks: Chunk[] } {
  const lines = flowTextIntoLines(text, SACCADE_LINE_WIDTH);
  const rawPages = groupIntoPages(lines, linesPerPage);

  const allChunks: Chunk[] = [];
  const pages: SaccadePage[] = [];

  for (let pageIndex = 0; pageIndex < rawPages.length; pageIndex++) {
    const rawPage = rawPages[pageIndex];
    const pageLineChunks: Chunk[][] = [];

    for (let lineIndex = 0; lineIndex < rawPage.lines.length; lineIndex++) {
      const line = rawPage.lines[lineIndex];

      if (line.type === 'blank' || line.text.trim().length === 0) {
        pageLineChunks.push([]);
        continue;
      }

      const lineChunks: Chunk[] = [];
      const wordRegex = /[^\s-]+/g;
      let match;

      while ((match = wordRegex.exec(line.text)) !== null) {
        const word = match[0];
        const chunk: Chunk = {
          text: word,
          wordCount: 1,
          orpIndex: 0,
          saccade: {
            pageIndex,
            lineIndex,
            startChar: match.index,
            endChar: match.index + word.length,
          },
        };
        lineChunks.push(chunk);
        allChunks.push(chunk);
      }

      pageLineChunks.push(lineChunks);
    }

    pages.push({
      lines: rawPage.lines,
      lineChunks: pageLineChunks,
    });
  }

  return { pages, chunks: allChunks };
}

/**
 * Split article text into paragraphs for training mode.
 * Splits on double newlines, strips markdown heading markers,
 * merges short paragraphs with next, splits long at sentence boundaries.
 */
export function segmentIntoParagraphs(
  text: string,
  minChars: number = 50,
  maxChars: number = 750
): string[] {
  const normalized = normalizeText(text);

  const rawBlocks = normalized
    .split(/\n\s*\n/)
    .map(b => b.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .map(b => b.replace(/^#{1,6}\s+/, ''))  // strip heading markers
    .filter(b => b.length > 0);

  if (rawBlocks.length === 0) return [];

  // Merge short blocks with next
  const merged: string[] = [];
  let buffer = '';

  for (const block of rawBlocks) {
    if (buffer.length > 0) {
      buffer += ' ' + block;
    } else {
      buffer = block;
    }

    if (buffer.length >= minChars) {
      merged.push(buffer);
      buffer = '';
    }
  }
  // Flush remaining buffer
  if (buffer.length > 0) {
    if (merged.length > 0) {
      merged[merged.length - 1] += ' ' + buffer;
    } else {
      merged.push(buffer);
    }
  }

  // Split long paragraphs at sentence boundaries
  const result: string[] = [];
  for (const para of merged) {
    if (para.length <= maxChars) {
      result.push(para);
      continue;
    }

    // Split at sentence endings
    const sentences = para.match(/[^.!?]+[.!?]+\s*/g) || [para];
    let current = '';
    for (const sentence of sentences) {
      if (current.length > 0 && current.length + sentence.length > maxChars) {
        result.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current.trim().length > 0) {
      result.push(current.trim());
    }
  }

  return result;
}

/**
 * Split a paragraph into sentence chunks for sentence-mode training.
 * Splits at sentence endings (.!?) and bundles short sentences (≤minWords)
 * with their neighbors to prevent trivially short recall sequences.
 * Returns [text] unchanged if no sentence boundaries are found.
 */
export function segmentIntoSentences(
  text: string,
  minWords: number = 5
): string[] {
  const raw = text.match(/[^.!?]+[.!?]+\s*/g);
  if (!raw) return [text];

  // Capture any trailing text without terminal punctuation
  const matchedLen = raw.reduce((sum, m) => sum + m.length, 0);
  if (matchedLen < text.length) {
    const remainder = text.slice(matchedLen).trim();
    if (remainder.length > 0) raw.push(remainder);
  }

  if (raw.length <= 1) return [text.trim()];

  // Bundle short sentences with the previous chunk
  const chunks: string[] = [];
  let buffer = '';

  for (const sentence of raw) {
    buffer += (buffer ? ' ' : '') + sentence.trim();
    if (countWords(buffer) > minWords) {
      chunks.push(buffer);
      buffer = '';
    }
  }

  // Flush remaining buffer — append to last chunk
  if (buffer.length > 0) {
    if (chunks.length > 0) {
      chunks[chunks.length - 1] += ' ' + buffer;
    } else {
      chunks.push(buffer);
    }
  }

  return chunks;
}

/**
 * Tokenize a single paragraph for saccade-style reading display.
 * Returns a single page and one chunk per non-blank line.
 */
export function tokenizeParagraphSaccade(
  text: string
): { page: SaccadePage; chunks: Chunk[] } {
  const lines = flowTextIntoLines(text, SACCADE_LINE_WIDTH);
  const chunks: Chunk[] = [];
  const lineChunks: Chunk[][] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    if (line.type === 'blank' || line.text.trim().length === 0) {
      lineChunks.push([]);
      continue;
    }

    const chunk: Chunk = {
      text: line.text,
      wordCount: countWords(line.text),
      orpIndex: 0,
      saccade: {
        pageIndex: 0,
        lineIndex,
        startChar: 0,
        endChar: line.text.length,
      },
    };

    lineChunks.push([chunk]);
    chunks.push(chunk);
  }

  const page: SaccadePage = { lines, lineChunks };
  return { page, chunks };
}

/**
 * Tokenize a single paragraph for recall display.
 * Same line layout as saccade, but one chunk per word.
 */
export function tokenizeParagraphRecall(
  text: string
): { page: SaccadePage; chunks: Chunk[] } {
  const lines = flowTextIntoLines(text, SACCADE_LINE_WIDTH);
  const chunks: Chunk[] = [];
  const pageLineChunks: Chunk[][] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    if (line.type === 'blank' || line.text.trim().length === 0) {
      pageLineChunks.push([]);
      continue;
    }

    const lineChunks: Chunk[] = [];
    const wordRegex = /[^\s-]+/g;
    let match;

    while ((match = wordRegex.exec(line.text)) !== null) {
      const word = match[0];
      const chunk: Chunk = {
        text: word,
        wordCount: 1,
        orpIndex: 0,
        saccade: {
          pageIndex: 0,
          lineIndex,
          startChar: match.index,
          endChar: match.index + word.length,
        },
      };
      lineChunks.push(chunk);
      chunks.push(chunk);
    }

    pageLineChunks.push(lineChunks);
  }

  const page: SaccadePage = { lines, lineChunks: pageLineChunks };
  return { page, chunks };
}
