import type { Chunk, TokenMode } from '../types';
import { AVG_WORD_LENGTH } from './rsvp';

/**
 * Strip markdown formatting for clean reading display.
 * Converts headings, bold, italic, links to plain text.
 */
export function stripMarkdown(text: string): string {
  return text
    // Headings: # Title → Title (preserve as paragraph break)
    .replace(/^(#{1,6})\s+(.+)$/gm, '\n$2\n')
    // Bold: **text** or __text__ → text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Italic: *text* or _text_ → text (but not mid-word underscores)
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    // Links: [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Images: ![alt](url) → (remove entirely)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // Inline code: `code` → code
    .replace(/`([^`]+)`/g, '$1')
    // Horizontal rules: --- or *** → paragraph break
    .replace(/^[-*]{3,}$/gm, '\n')
    // Clean up excess whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Word scoring model (shared with saccade fixation placement) ---
// See docs/saccade/01-scoring-function-v1.md for design rationale.

export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'is', 'it', 'or', 'as',
  'by', 'if', 'so', 'no', 'do', 'be', 'am', 'are', 'was', 'were', 'he',
  'she', 'we', 'they', 'you', 'my', 'your', 'our', 'us', 'up', 'and',
  'for', 'but', 'nor', 'yet', 'with', 'from', 'into', 'onto', 'this',
  'that', 'these', 'those', 'its',
]);

const FUNCTION_WORD_PENALTY = 1.25;

export function lengthPenalty(len: number): number {
  if (len <= 1) return 5.0;
  if (len === 2) return 4.0;
  if (len === 3) return 2.5;
  if (len === 4) return 1.5;
  if (len === 5) return 0.5;
  return 0.0;
}

export function wordPenalty(word: string): number {
  const fp = FUNCTION_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ''))
    ? FUNCTION_WORD_PENALTY : 0;
  return lengthPenalty(word.length) + fp;
}

/**
 * Calculate the Optimal Reading Point (ORP) index within a chunk.
 *
 * For single words: uses 35% position (well-validated OVP research).
 * For multi-word chunks: uses center position, since the 35% OVP research
 * was conducted on single words and doesn't directly apply to phrases.
 */
export function calculateORP(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  if (trimmed.length <= 1) return 0;
  if (trimmed.length <= 3) return 1;

  const isMultiWord = trimmed.includes(' ');

  // Single word: use 35% OVP (research-backed)
  // Multi-word: use center (heuristic, since OVP doesn't apply to phrases)
  const orpPosition = isMultiWord
    ? Math.floor(trimmed.length / 2)
    : Math.floor(trimmed.length * 0.35);

  // Adjust to avoid landing on whitespace
  let adjusted = orpPosition;
  while (adjusted > 0 && trimmed[adjusted] === ' ') {
    adjusted--;
  }

  return adjusted;
}

/**
 * Normalize text by ensuring spaces after sentence-ending punctuation.
 * Handles cases like "word.Next" -> "word. Next"
 * But preserves abbreviations like "U.S.A." (uppercase before period)
 */
export function normalizeText(text: string): string {
  // Only add space when a lowercase letter precedes the punctuation
  // This catches real sentence endings but not abbreviations like U.S.A.
  return text.replace(/([a-z])([.!?])([A-Z])/g, '$1$2 $3');
}

/**
 * Tokenize text into words, splitting on whitespace and em/en dashes.
 * Dashes are kept attached to the preceding word for display continuity.
 */
function tokenizeWords(text: string): string[] {
  const normalized = normalizeText(text);
  // Insert a split point after em/en dashes (keeping the dash on the preceding word)
  const withSplits = normalized.replace(/([^\s])([—–])(?=[^\s])/g, '$1$2 ');
  return withSplits.split(/\s+/).filter(w => w.length > 0);
}

/**
 * Tokenize text in Word mode - one word per chunk.
 */
function tokenizeWordMode(text: string): Chunk[] {
  const words = tokenizeWords(text);
  return words.map(word => ({
    text: word,
    wordCount: 1,
    orpIndex: calculateORP(word),
  }));
}

// Minimum quality threshold for fixation targets.
// Words with wordPenalty >= this are never selected as fixation anchors;
// they get absorbed into adjacent chunks instead. This prevents function
// words and very short words from becoming standalone chunks.
//
// Excluded (penalty >= 2.0): 1-3 char words always, 4-char function words
// Allowed: 4-char content words (1.5), 5-char function words (1.75), 6+ all (0-1.25)
const MIN_FIXATION_PENALTY = 2.0;

/**
 * Fixation-aligned chunking: uses the saccade scoring model to place fixation
 * points through the text, then partitions words into chunks around those
 * fixation points. Each chunk contains the fixation word (a content word) plus
 * any preceding non-fixation words absorbed from the gap since the previous
 * fixation. This models the perceptual span during a saccade fixation.
 *
 * The ORP for each chunk is placed on the fixation word, matching where the
 * eye would actually land during real reading.
 *
 * @param text - Text to tokenize
 * @param saccadeLength - Target character distance between fixation points (7-15)
 */
function tokenizeByFixation(text: string, saccadeLength: number): Chunk[] {
  const words = tokenizeWords(text);
  if (words.length === 0) return [];
  if (words.length === 1) {
    return [{ text: words[0], wordCount: 1, orpIndex: calculateORP(words[0]) }];
  }

  // Build word layout with cumulative character positions
  const layout: { word: string; startPos: number; orpPos: number }[] = [];
  let pos = 0;
  for (const word of words) {
    layout.push({
      word,
      startPos: pos,
      orpPos: pos + calculateORP(word),
    });
    pos += word.length + 1; // +1 for space
  }

  // Scoring parameters (same as computeLineFixations in saccade.ts)
  const aggression = Math.max(0, Math.min(1, (saccadeLength - 7) / 8));
  const skipScale = 0.8 + 0.4 * aggression;
  const maxJump = saccadeLength + 6;

  // Helper: find best fixation candidate from a range, optionally quality-filtered
  function findBest(
    startFrom: number,
    endBefore: number,
    target: number,
    lastPos: number,
    limitToWindow: boolean,
    requireQuality: boolean,
  ): { idx: number; score: number; len: number } {
    let bestIdx = -1;
    let bestScore = Infinity;
    let bestLen = 0;
    for (let i = startFrom; i < endBefore; i++) {
      if (limitToWindow && layout[i].orpPos - lastPos > maxJump) continue;
      if (requireQuality && wordPenalty(layout[i].word) >= MIN_FIXATION_PENALTY) continue;
      const score = Math.abs(layout[i].orpPos - target)
        + skipScale * wordPenalty(layout[i].word);
      if (score < bestScore - 0.001
          || (Math.abs(score - bestScore) < 0.001 && layout[i].word.length > bestLen)) {
        bestIdx = i;
        bestScore = score;
        bestLen = layout[i].word.length;
      }
    }
    return { idx: bestIdx, score: bestScore, len: bestLen };
  }

  // First fixation: quality content word near start, using position 0 as anchor
  const firstTarget = saccadeLength * 0.5;
  let first = findBest(0, layout.length, firstTarget, 0, true, true);
  if (first.idx === -1) first = findBest(0, layout.length, firstTarget, 0, false, true);
  if (first.idx === -1) first = findBest(0, layout.length, firstTarget, 0, false, false);
  const firstIdx = first.idx === -1 ? 0 : first.idx;

  const fixationIndices: number[] = [firstIdx];
  let lastFixIdx = firstIdx;

  // Place subsequent fixations
  while (true) {
    const lastPos = layout[lastFixIdx].orpPos;
    const target = lastPos + saccadeLength;

    // 1. Try quality content words within maxJump window
    let result = findBest(lastFixIdx + 1, layout.length, target, lastPos, true, true);

    // 2. If nothing in window, extend search to all remaining content words
    if (result.idx === -1) {
      result = findBest(lastFixIdx + 1, layout.length, target, lastPos, false, true);
    }

    // 3. If still nothing (remaining text is all function words), accept any word
    if (result.idx === -1) {
      result = findBest(lastFixIdx + 1, layout.length, target, lastPos, false, false);
    }

    if (result.idx === -1) break;

    fixationIndices.push(result.idx);
    lastFixIdx = result.idx;
  }

  // Partition words into chunks around fixation points.
  // Each chunk: [words from previous fixation + 1 .. current fixation]
  // Words before first fixation are prepended to first chunk.
  // Words after last fixation are appended to last chunk.
  const chunks: Chunk[] = [];
  let chunkStart = 0;

  for (const fixIdx of fixationIndices) {
    const chunkWords = words.slice(chunkStart, fixIdx + 1);
    const chunkText = chunkWords.join(' ');

    // ORP on the fixation word (last word in chunk)
    const fixWordStartInChunk = chunkText.length - words[fixIdx].length;
    const orpInChunk = fixWordStartInChunk + calculateORP(words[fixIdx]);

    chunks.push({
      text: chunkText,
      wordCount: chunkWords.length,
      orpIndex: orpInChunk,
    });
    chunkStart = fixIdx + 1;
  }

  // Trailing words after last fixation → append to last chunk
  if (chunkStart < words.length) {
    const trailingWords = words.slice(chunkStart);
    const lastChunk = chunks[chunks.length - 1];
    const newText = lastChunk.text + ' ' + trailingWords.join(' ');
    chunks[chunks.length - 1] = {
      text: newText,
      wordCount: lastChunk.wordCount + trailingWords.length,
      orpIndex: lastChunk.orpIndex, // stays on fixation word
    };
  }

  return chunks;
}

/**
 * Create a paragraph break marker chunk.
 */
function createBreakChunk(): Chunk {
  return {
    text: '· · ·',
    wordCount: 0, // Zero words = longer pause ratio
    orpIndex: 2,  // Center dot
  };
}

/**
 * Tokenize a single paragraph based on mode.
 */
function tokenizeParagraph(text: string, mode: TokenMode, saccadeLength?: number): Chunk[] {
  switch (mode) {
    case 'word':
      return tokenizeWordMode(text);
    case 'custom':
      return tokenizeByFixation(text, saccadeLength ?? 10);
  }
}

/**
 * Tokenize text into chunks based on the selected mode.
 * Respects paragraph breaks and inserts visual markers between them.
 * Strips markdown formatting for clean reading display.
 *
 * @param text - Text to tokenize
 * @param mode - Tokenization mode
 * @param saccadeLength - Fixation spacing in characters (only used in 'custom' mode, default 10)
 */
export function tokenize(text: string, mode: TokenMode, saccadeLength?: number): Chunk[] {
  // Strip markdown formatting for clean display
  const cleanText = stripMarkdown(text);

  // Split into paragraphs (double newline or more)
  const paragraphs = cleanText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // If no clear paragraph structure, treat as single block
  if (paragraphs.length <= 1) {
    return tokenizeParagraph(cleanText, mode, saccadeLength);
  }

  // Tokenize each paragraph and join with break markers
  const allChunks: Chunk[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraphChunks = tokenizeParagraph(paragraphs[i], mode, saccadeLength);
    allChunks.push(...paragraphChunks);

    // Add break marker between paragraphs (not after last)
    if (i < paragraphs.length - 1) {
      allChunks.push(createBreakChunk());
    }
  }

  return allChunks;
}

/**
 * Calculate estimated reading time in seconds for given chunks at WPM.
 * Uses character count with 4.8 avg word length for consistency with
 * the character-based RSVP pacing.
 */
export function estimateReadingTime(chunks: Chunk[], wpm: number): number {
  const totalChars = chunks.reduce((sum, chunk) =>
    sum + chunk.text.replace(/\s/g, '').length, 0
  );
  return (totalChars / (wpm * AVG_WORD_LENGTH)) * 60;
}
