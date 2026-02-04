import type { Chunk } from '../types';

/**
 * Check if a chunk is a paragraph break marker.
 */
export function isBreakChunk(chunk: Chunk): boolean {
  return chunk.wordCount === 0;
}

// Average English word length in characters (no spaces)
export const AVG_WORD_LENGTH = 4.8;

// Minimum display time in ms (prevents ultra-short flashes)
const MIN_DISPLAY_MS = 80;

// Punctuation pause multipliers
const MAJOR_PUNCT_MULTIPLIER = 1.5;  // .!?
const MINOR_PUNCT_MULTIPLIER = 1.25; // ,;:—–

const MAJOR_PUNCTUATION = /[.!?]$/;
const MINOR_PUNCTUATION = /[,;:\u2014\u2013-]$/;

/**
 * Calculate display time for a chunk in milliseconds.
 *
 * Uses character count for proportional timing. At 400 WPM with an average
 * word length of 4.8 characters, each character gets ~31.25ms. Longer words
 * naturally get more time than shorter ones.
 *
 * Punctuation pauses: +50% after sentence endings (.!?), +25% after
 * clause boundaries (,;:—–).
 *
 * Minimum display time of 80ms prevents ultra-short chunks from flashing
 * invisibly.
 *
 * Break chunks (paragraph markers) get a fixed 2-word pause.
 */
export function calculateDisplayTime(chunk: Chunk, wpm: number): number {
  // Break chunks (paragraph markers) get a fixed pause of ~2 words
  if (chunk.wordCount === 0) {
    const msPerWord = 60000 / wpm;
    return msPerWord * 2;
  }

  // Character-based timing: derive ms-per-character from WPM and average word length
  const charsPerMinute = wpm * AVG_WORD_LENGTH;
  const msPerChar = 60000 / charsPerMinute;

  // Count non-space characters for timing
  const charCount = chunk.text.replace(/\s/g, '').length;
  let displayTime = charCount * msPerChar;

  // Punctuation pauses at chunk boundaries
  const trimmed = chunk.text.trimEnd();
  if (MAJOR_PUNCTUATION.test(trimmed)) {
    displayTime *= MAJOR_PUNCT_MULTIPLIER;
  } else if (MINOR_PUNCTUATION.test(trimmed)) {
    displayTime *= MINOR_PUNCT_MULTIPLIER;
  }

  return Math.max(MIN_DISPLAY_MS, displayTime);
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
 * Format milliseconds as h:mm:ss or mm:ss string.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
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
