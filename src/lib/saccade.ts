import type { Chunk, SaccadePage, SaccadeLine } from '../types';
import { normalizeText, calculateORP, wordPenalty, FUNCTION_WORDS } from './tokenizer';

export const SACCADE_LINE_WIDTH = 80;
export const SACCADE_LINES_PER_PAGE = 15;
export const SACCADE_FIGURE_MIN_LINE_SPAN_RATIO = 0.28;
export const SACCADE_FIGURE_MIN_LINE_SPAN_FLOOR = 5;
export const SACCADE_FIGURE_CAPTION_EXTRA_SPAN_MAX = 3;
export const SACCADE_EQUATION_LINE_SPAN = 2;

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

export interface FocusTargetRange {
  startChar: number;
  endChar: number;
}

export interface FocusTargetTiming {
  startPct: number;
  endPct: number;
}

/**
 * Convert fixation ORP positions into progressive highlight ranges.
 *
 * Each range starts at the beginning of the fixation's word and extends
 * through the end of the next fixation word. This creates a one-word overlap
 * between consecutive ranges. The final range extends to the end of the line.
 */
export function computeFocusTargets(lineText: string, fixations: number[]): FocusTargetRange[] {
  if (!lineText || fixations.length === 0) return [];

  const words: Array<{ start: number; end: number }> = [];
  const regex = /\S+/g;
  let m;
  while ((m = regex.exec(lineText)) !== null) {
    words.push({ start: m.index, end: m.index + m[0].length });
  }
  if (words.length === 0) return [];

  const wordIndexForChar = (idx: number): number => {
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (idx >= word.start && idx < word.end) return i;
      if (idx < word.start) return Math.max(0, i - 1);
    }
    return words.length - 1;
  };

  const fixationWordIndices: number[] = [];
  for (const fixation of fixations) {
    const wordIdx = wordIndexForChar(fixation);
    if (fixationWordIndices.length === 0 || wordIdx > fixationWordIndices[fixationWordIndices.length - 1]) {
      fixationWordIndices.push(wordIdx);
    }
  }

  const ranges: FocusTargetRange[] = [];
  for (let i = 0; i < fixationWordIndices.length; i++) {
    const startWordIdx = fixationWordIndices[i];
    const startChar = words[startWordIdx].start;
    const endChar = i < fixationWordIndices.length - 1
      ? words[fixationWordIndices[i + 1]].end
      : lineText.length;
    if (endChar > startChar) {
      ranges.push({ startChar, endChar });
    }
  }

  return ranges;
}

/**
 * Return one focus target per visible token (word-like sequence).
 */
export function computeWordTargets(lineText: string): FocusTargetRange[] {
  if (!lineText) return [];
  const targets: FocusTargetRange[] = [];
  const regex = /\S+/g;
  let m;
  while ((m = regex.exec(lineText)) !== null) {
    targets.push({ startChar: m.index, endChar: m.index + m[0].length });
  }
  return targets;
}

/**
 * Return one ORP fixation per visible token.
 */
export function computeWordFixations(lineText: string): number[] {
  if (!lineText) return [];
  const fixations: number[] = [];
  const regex = /\S+/g;
  let m;
  while ((m = regex.exec(lineText)) !== null) {
    fixations.push(m.index + calculateORP(m[0]));
  }
  return fixations;
}

interface WordTargetToken {
  text: string;
  start: number;
  end: number;
}

function isMergeableFunctionWord(token: WordTargetToken): boolean {
  const normalized = token.text.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.length === 0 || normalized.length > 3) return false;
  if (!FUNCTION_WORDS.has(normalized)) return false;
  // Keep short function words with terminal punctuation as standalone targets.
  return !/[.!?;:,]["')\]]*$/.test(token.text);
}

function tokenizeWordTargets(lineText: string): WordTargetToken[] {
  if (!lineText) return [];
  const tokens: WordTargetToken[] = [];
  const regex = /\S+/g;
  let m;
  while ((m = regex.exec(lineText)) !== null) {
    tokens.push({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return tokens;
}

/**
 * Compute word-based focus ranges and OVP positions.
 *
 * When `mergeShortFunctionWords` is enabled, up to two short function words
 * (<=3 letters) are merged into the following anchor token, and the fixation
 * remains on that anchor token's OVP.
 */
export function computeWordFocusTargetsAndFixations(
  lineText: string,
  mergeShortFunctionWords: boolean
): { targets: FocusTargetRange[]; fixations: number[] } {
  if (!lineText) return { targets: [], fixations: [] };
  if (!mergeShortFunctionWords) {
    return {
      targets: computeWordTargets(lineText),
      fixations: computeWordFixations(lineText),
    };
  }

  const tokens = tokenizeWordTargets(lineText);
  if (tokens.length === 0) return { targets: [], fixations: [] };

  const targets: FocusTargetRange[] = [];
  const fixations: number[] = [];
  const pendingPrefix: WordTargetToken[] = [];
  const maxPrefixMerge = 2;

  const flushPrefixStandalone = (count: number): void => {
    for (let i = 0; i < count && pendingPrefix.length > 0; i++) {
      const token = pendingPrefix.shift()!;
      targets.push({ startChar: token.start, endChar: token.end });
      fixations.push(token.start + calculateORP(token.text));
    }
  };

  for (const token of tokens) {
    if (isMergeableFunctionWord(token)) {
      if (pendingPrefix.length >= maxPrefixMerge) {
        flushPrefixStandalone(1);
      }
      pendingPrefix.push(token);
      continue;
    }

    const startChar = pendingPrefix.length > 0 ? pendingPrefix[0].start : token.start;
    targets.push({ startChar, endChar: token.end });
    fixations.push(token.start + calculateORP(token.text));
    pendingPrefix.length = 0;
  }

  flushPrefixStandalone(pendingPrefix.length);

  return { targets, fixations };
}

function punctuationPauseUnits(token: string): number {
  const trimmed = token.trim();
  if (!trimmed) return 0;

  // Add a small dwell bonus at phrase and sentence boundaries.
  if (/[.!?]["')\]]*$/.test(trimmed)) return 0.65;
  if (/[,;:]["')\]]*$/.test(trimmed)) return 0.35;
  return 0;
}

/**
 * Build normalized timing windows for focus targets.
 * - `char`: durations scale with character span.
 * - `word`: equal base dwell per word + punctuation pause bonus.
 */
export function computeFocusTargetTimings(
  lineText: string,
  targets: FocusTargetRange[],
  mode: 'char' | 'word'
): FocusTargetTiming[] {
  if (!lineText || targets.length === 0) return [];

  if (mode === 'char') {
    const len = Math.max(1, lineText.length);
    return targets.map(target => ({
      startPct: (target.startChar / len) * 100,
      endPct: (target.endChar / len) * 100,
    }));
  }

  const units = targets.map(target => {
    const token = lineText.slice(target.startChar, target.endChar);
    return 1 + punctuationPauseUnits(token);
  });
  const totalUnits = Math.max(0.0001, units.reduce((sum, u) => sum + u, 0));

  let acc = 0;
  return units.map((u, i) => {
    const startPct = (acc / totalUnits) * 100;
    acc += u;
    const endPct = i === units.length - 1 ? 100 : (acc / totalUnits) * 100;
    return { startPct, endPct };
  });
}

// Markdown heading pattern: # Heading, ## Heading, etc.
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const FIGURE_MARKER_PATTERN = /^\[FIGURE:([^\]]+)\]$/i;
const FIGURE_URL_PATTERN = /^\[FIGURE_URL:(.+)\]$/i;
const FIGURE_CAPTION_PATTERN = /^\[FIGURE\s+(.+)\]$/i;
const EQUATION_IMAGE_PATTERN = /^\[EQN_IMAGE:(\d+)\](?:\s+(.+))?$/i;
const EQUATION_LABEL_PATTERN = /^\[EQN_LABEL:(.+)\]$/i;

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
export function flowTextIntoLines(
  text: string,
  lineWidth: number,
  figureAssetBaseUrl?: string,
  sourcePath?: string
): SaccadeLine[] {
  const normalized = normalizeText(text);

  // Split into blocks (paragraphs/headings separated by blank lines)
  const blocks = normalized
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  const lines: SaccadeLine[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const figureMarker = block.match(FIGURE_MARKER_PATTERN);
    const figureUrlMarker = block.match(FIGURE_URL_PATTERN);
    const equationMarker = block.match(EQUATION_IMAGE_PATTERN);

    if (equationMarker) {
      const equationIndex = Number(equationMarker[1]);
      let equationCaption = equationMarker[2]?.trim() || undefined;
      if (!equationCaption && i + 1 < blocks.length) {
        const labelMatch = blocks[i + 1].match(EQUATION_LABEL_PATTERN);
        if (labelMatch) {
          equationCaption = labelMatch[1].trim();
          i += 1;
        }
      }
      const equationSrc = buildEquationSrc(figureAssetBaseUrl, sourcePath, equationIndex);

      lines.push({
        text: equationCaption || `Equation ${equationIndex}`,
        type: 'figure',
        figureId: `equation-${equationIndex}`,
        figureSrc: equationSrc,
        figureCaption: equationCaption,
        isEquation: true,
        equationIndex,
      });

      if (i < blocks.length - 1 && lines.length > 0 && lines[lines.length - 1].type !== 'blank') {
        lines.push({ text: '', type: 'blank' });
      }
      continue;
    }

    if (figureMarker || figureUrlMarker) {
      const figureId = figureMarker ? figureMarker[1].trim() : undefined;
      const figureSrc = figureUrlMarker ? figureUrlMarker[1].trim() : undefined;
      let figureCaption: string | undefined;

      if (i + 1 < blocks.length && !FIGURE_MARKER_PATTERN.test(blocks[i + 1]) && !FIGURE_URL_PATTERN.test(blocks[i + 1])) {
        const captionMatch = blocks[i + 1].match(FIGURE_CAPTION_PATTERN);
        if (captionMatch) {
          figureCaption = captionMatch[1].trim();
          i += 1;
        }
      }

      lines.push({
        text: figureCaption || (figureId ? `Figure ${figureId}` : 'Figure'),
        type: 'figure',
        figureId,
        figureSrc: figureSrc || buildFigureSrc(figureAssetBaseUrl, figureId),
        figureCaption,
      });

      if (i < blocks.length - 1 && lines.length > 0 && lines[lines.length - 1].type !== 'blank') {
        lines.push({ text: '', type: 'blank' });
      }
      continue;
    }

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

function buildFigureSrc(assetBaseUrl: string | undefined, figureId?: string): string | undefined {
  if (!assetBaseUrl || !figureId) return undefined;
  const normalizedBase = assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`;

  try {
    const fileUrl = new URL(`images/${encodeURIComponent(figureId)}.jpg`, normalizedBase).toString();
    if (fileUrl.startsWith('file://')) {
      return `reader-asset://local?fileUrl=${encodeURIComponent(fileUrl)}`;
    }
    return fileUrl;
  } catch {
    return undefined;
  }
}

function buildEquationSrc(
  assetBaseUrl: string | undefined,
  sourcePath: string | undefined,
  equationIndex: number
): string | undefined {
  if (!assetBaseUrl || !Number.isFinite(equationIndex) || equationIndex <= 0) return undefined;
  const normalizedBase = assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`;
  const chapterName = sourcePath
    ? sourcePath.split(/[\\/]/).pop()?.replace(/\.txt$/i, '')
    : undefined;
  if (!chapterName) return undefined;

  const equationFile = `eqn_${String(equationIndex).padStart(3, '0')}.jpg`;
  const encodedChapterName = encodeURIComponent(chapterName);
  try {
    const fileUrl = new URL(`equation-images/${encodedChapterName}/${equationFile}`, normalizedBase).toString();
    if (fileUrl.startsWith('file://')) {
      return `reader-asset://local?fileUrl=${encodeURIComponent(fileUrl)}`;
    }
    return fileUrl;
  } catch {
    return undefined;
  }
}

/**
 * Group lines into raw pages.
 */
function estimateFigureLineSpan(
  line: SaccadeLine,
  figureBaseLineSpan: number
): number {
  if (line.type !== 'figure') return 1;
  if (line.isEquation) return SACCADE_EQUATION_LINE_SPAN;

  // Reserve extra page budget for long captions so trailing text
  // is pushed to the next page instead of being clipped at viewport bottom.
  const captionText = (line.figureCaption || line.text || '').trim();
  const estimatedCaptionLines = captionText.length > 0
    ? Math.ceil(captionText.length / SACCADE_LINE_WIDTH)
    : 1;
  const captionExtraSpan = Math.min(
    SACCADE_FIGURE_CAPTION_EXTRA_SPAN_MAX,
    Math.max(0, estimatedCaptionLines - 1)
  );

  return Math.max(1, figureBaseLineSpan + captionExtraSpan);
}

function groupIntoPages(
  lines: SaccadeLine[],
  linesPerPage: number,
  figureBaseLineSpan: number = 1
): { lines: SaccadeLine[] }[] {
  const pages: { lines: SaccadeLine[] }[] = [];
  if (linesPerPage <= 0 || lines.length === 0) return pages;

  let currentPage: SaccadeLine[] = [];
  let usedSpan = 0;

  for (const line of lines) {
    const span = estimateFigureLineSpan(line, figureBaseLineSpan);

    if (currentPage.length > 0 && usedSpan + span > linesPerPage) {
      pages.push({ lines: currentPage });
      currentPage = [];
      usedSpan = 0;
    }

    currentPage.push(line);
    usedSpan += span;
  }

  if (currentPage.length > 0) {
    pages.push({ lines: currentPage });
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
  linesPerPage: number = SACCADE_LINES_PER_PAGE,
  figureAssetBaseUrl?: string,
  sourcePath?: string
): { pages: SaccadePage[]; chunks: Chunk[] } {
  const lines = flowTextIntoLines(text, SACCADE_LINE_WIDTH, figureAssetBaseUrl, sourcePath);
  const figureMinLineSpan = Math.max(
    SACCADE_FIGURE_MIN_LINE_SPAN_FLOOR,
    Math.round(linesPerPage * SACCADE_FIGURE_MIN_LINE_SPAN_RATIO)
  );
  const rawPages = groupIntoPages(lines, linesPerPage, figureMinLineSpan);

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

      const chunkText = line.type === 'figure'
        ? (line.figureCaption || line.text || `Figure ${line.figureId || ''}`).trim()
        : line.text;

      const chunk: Chunk = {
        text: chunkText.length > 0 ? chunkText : 'Figure',
        wordCount: countWords(chunkText),
        orpIndex: 0,
        saccade: {
          pageIndex,
          lineIndex,
          startChar: 0,
          endChar: chunkText.length,
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
    const pageLines: SaccadeLine[] = rawPage.lines.map(line =>
      line.type === 'figure'
        ? { text: '', type: 'blank' }
        : line
    );

    for (let lineIndex = 0; lineIndex < pageLines.length; lineIndex++) {
      const line = pageLines[lineIndex];

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
      lines: pageLines,
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
