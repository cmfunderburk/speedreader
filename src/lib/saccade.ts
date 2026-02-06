import type { Chunk, SaccadePage, SaccadeLine } from '../types';
import { normalizeText, calculateORP } from './tokenizer';

export const SACCADE_LINE_WIDTH = 80;
export const SACCADE_LINES_PER_PAGE = 15;

/**
 * Compute character indices within a line where fixation ORP highlights should appear.
 * Returns absolute character positions into lineText for each fixation point.
 */
export function computeLineFixations(lineText: string, saccadeLength: number): number[] {
  // Extract words with positions
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

  // First fixation = first word's ORP
  const fixations: number[] = [words[0].orpPos];
  let lastFixIdx = 0; // index into words[] of the last fixated word

  while (true) {
    const lastPos = fixations[fixations.length - 1];
    const target = lastPos + saccadeLength;

    // Pick the next word past current whose ORP is closest to target
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = lastFixIdx + 1; i < words.length; i++) {
      const dist = Math.abs(words[i].orpPos - target);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // no more words

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
function flowTextIntoLines(text: string, lineWidth: number): SaccadeLine[] {
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
function countWords(text: string): number {
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
      const wordRegex = /\S+/g;
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
