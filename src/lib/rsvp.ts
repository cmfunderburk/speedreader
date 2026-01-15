import type { Chunk } from '../types';

/**
 * Check if a chunk is a paragraph break marker.
 */
export function isBreakChunk(chunk: Chunk): boolean {
  return chunk.wordCount === 0;
}

// Average word length including trailing space
const AVG_WORD_LENGTH_WITH_SPACE = 5.8;

/**
 * Calculate display time for a chunk in milliseconds.
 *
 * Formula: display_time = effective_chars / chars_per_ms
 * Where chars_per_ms = (WPM * AVG_WORD_LENGTH_WITH_SPACE) / 60000
 *
 * Uses 5.8 chars/word (4.8 letters + 1 space) for consistent WPM across
 * all chunk sizes. This accounts for inter-word spaces that may not be
 * present in single-word chunks.
 *
 * For multi-word chunks, we add (wordCount - 1) to account for spaces
 * between words that ARE in the text. Single-word chunks get +1 for the
 * implicit trailing space.
 */
export function calculateDisplayTime(chunk: Chunk, wpm: number): number {
  const charsPerMinute = wpm * AVG_WORD_LENGTH_WITH_SPACE;
  const msPerChar = 60000 / charsPerMinute;

  // Calculate effective character count including implicit spaces
  // Single words: add 1 for trailing space
  // Multi-word: spaces are already in text, add 1 for final trailing space
  const effectiveChars = chunk.text.length + 1;

  return effectiveChars * msPerChar;
}

/**
 * Calculate remaining time from current position to end.
 */
export function calculateRemainingTime(
  chunks: Chunk[],
  currentIndex: number,
  wpm: number
): number {
  let totalMs = 0;
  for (let i = currentIndex; i < chunks.length; i++) {
    totalMs += calculateDisplayTime(chunks[i], wpm);
  }
  return totalMs;
}

/**
 * Format milliseconds as mm:ss string.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate progress percentage (0-100).
 */
export function calculateProgress(currentIndex: number, totalChunks: number): number {
  if (totalChunks === 0) return 0;
  return (currentIndex / totalChunks) * 100;
}

/**
 * Find chunk index from progress percentage.
 */
export function indexFromProgress(progress: number, totalChunks: number): number {
  if (totalChunks === 0) return 0;
  return Math.floor((progress / 100) * totalChunks);
}
