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

const SHORT_WORD_THRESHOLD = 3;
const MEDIUM_LONG_THRESHOLD = 7;
const LONG_WORD_THRESHOLD = 9;

const SHORT_WORD_MULTIPLIER = 0.9;
const MEDIUM_LONG_WORD_MULTIPLIER = 1.15;
const LONG_WORD_MULTIPLIER = 1.25;

const PHRASE_ADDITIONAL_WORD_WEIGHT = 0.6;

/**
 * Calculate display time for a chunk in milliseconds.
 *
 * Uses a base milliseconds-per-word cadence derived from WPM, then applies
 * multipliers for phrase length, average word length, and punctuation pauses.
 * Longer words get extra time while very short function words get slightly
 * less, and additional words in a chunk cost a fraction of a full word to
 * keep phrase modes feeling cohesive.
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
  const msPerWord = 60000 / wpm;

  // Break chunks (paragraph markers) get a fixed pause of ~2 words
  if (chunk.wordCount === 0) {
    return msPerWord * 2;
  }

  const wordCount = chunk.wordCount;

  // Base phrase multiplier: each additional word costs a fraction of a single word
  const phraseMultiplier = 1 + Math.max(0, wordCount - 1) * PHRASE_ADDITIONAL_WORD_WEIGHT;

  const trimmedText = chunk.text.trimEnd();
  const lexicalSample = trimmedText.replace(/[.!?,;:\u2014\u2013-]+$/, '');
  const charCount = lexicalSample.replace(/\s/g, '').length || trimmedText.replace(/\s/g, '').length;
  const avgChars = wordCount > 0 ? charCount / wordCount : AVG_WORD_LENGTH;

  let lexicalMultiplier = 1;
  if (avgChars >= LONG_WORD_THRESHOLD) {
    lexicalMultiplier = LONG_WORD_MULTIPLIER;
  } else if (avgChars >= MEDIUM_LONG_THRESHOLD) {
    lexicalMultiplier = MEDIUM_LONG_WORD_MULTIPLIER;
  } else if (avgChars <= SHORT_WORD_THRESHOLD) {
    lexicalMultiplier = SHORT_WORD_MULTIPLIER;
  }

  let displayTime = msPerWord * phraseMultiplier * lexicalMultiplier;

  // Punctuation pauses at chunk boundaries
  if (MAJOR_PUNCTUATION.test(trimmedText)) {
    displayTime *= MAJOR_PUNCT_MULTIPLIER;
  } else if (MINOR_PUNCTUATION.test(trimmedText)) {
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

/**
 * Compute effective WPM during ramp-up from 50% of target.
 *
 * Linear: increases by rampRate WPM every rampInterval seconds.
 * Logarithmic: rampInterval is the half-life — every N seconds the
 * remaining gap to target halves, approaching it asymptotically.
 */
export function getEffectiveWpm(
  targetWpm: number,
  elapsedMs: number,
  rampRate: number,
  rampInterval: number,
  curve: 'linear' | 'logarithmic' = 'linear'
): number {
  const startWpm = targetWpm * 0.5;
  const elapsedSeconds = elapsedMs / 1000;

  if (curve === 'logarithmic') {
    const gap = targetWpm - startWpm;
    const remaining = gap * Math.pow(0.5, elapsedSeconds / rampInterval);
    return Math.round(targetWpm - remaining);
  }

  const ratePerSecond = rampRate / rampInterval;
  return Math.min(targetWpm, Math.round(startWpm + ratePerSecond * elapsedSeconds));
}

export function estimateReadingTimeFromCharCount(charCount: number, wpm: number): number {
  if (charCount <= 0 || wpm <= 0) return 0;
  const charsPerMinute = wpm * AVG_WORD_LENGTH;
  return (charCount / charsPerMinute) * 60;
}
