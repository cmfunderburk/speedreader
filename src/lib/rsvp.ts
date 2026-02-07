import type { Chunk, TokenMode } from '../types';

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
 * **Word mode** (default): word-cadence based. Uses msPerWord as baseline,
 * with multipliers for phrase length, lexical complexity, and end-of-chunk
 * punctuation pauses. Research-backed for single-word RSVP.
 *
 * **Custom mode**: character-proportional. Base time scales linearly with
 * lexical character count (letters/digits only), so WPM means the same
 * actual throughput regardless of span width. Punctuation pauses are
 * additive per-occurrence anywhere in the chunk, not just at the end.
 *
 * Minimum display time of 80ms prevents ultra-short chunks from flashing
 * invisibly.
 *
 * Break chunks (paragraph markers) get a fixed 2-word pause in both modes.
 */
export function calculateDisplayTime(chunk: Chunk, wpm: number, mode: TokenMode = 'word'): number {
  const msPerWord = 60000 / wpm;

  // Break chunks (paragraph markers) get a fixed pause of ~2 words
  if (chunk.wordCount === 0) {
    return msPerWord * 2;
  }

  if (mode === 'custom') {
    return calculateDisplayTimeCharBased(chunk, wpm, msPerWord);
  }

  return calculateDisplayTimeWordBased(chunk, wpm, msPerWord);
}

/**
 * Word-based timing: one-word baseline with phrase discount and lexical multipliers.
 * Used for single-word RSVP where per-word cadence is the standard model.
 */
function calculateDisplayTimeWordBased(chunk: Chunk, _wpm: number, msPerWord: number): number {
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
 * Character-proportional timing: base time scales with lexical character count
 * so that WPM represents actual throughput regardless of span width. Punctuation
 * pauses are additive per-occurrence anywhere in the chunk.
 */
function calculateDisplayTimeCharBased(chunk: Chunk, _wpm: number, msPerWord: number): number {
  // Count only letters and digits — punctuation/spaces handled separately
  const lexicalChars = chunk.text.replace(/[^a-zA-Z0-9]/g, '').length;
  const wordEquivalent = lexicalChars / AVG_WORD_LENGTH;

  let displayTime = wordEquivalent * msPerWord;

  // Count all pause-inducing punctuation anywhere in the chunk
  const majorCount = (chunk.text.match(/[.!?]/g) || []).length;
  const minorCount = (chunk.text.match(/[,;:\u2014\u2013]/g) || []).length;

  // Each occurrence adds a fraction of one word's time
  displayTime += majorCount * msPerWord * (MAJOR_PUNCT_MULTIPLIER - 1);
  displayTime += minorCount * msPerWord * (MINOR_PUNCT_MULTIPLIER - 1);

  return Math.max(MIN_DISPLAY_MS, displayTime);
}

/**
 * Calculate remaining time from current position to end.
 */
export function calculateRemainingTime(
  chunks: Chunk[],
  currentIndex: number,
  wpm: number,
  mode: TokenMode = 'word'
): number {
  let totalMs = 0;
  for (let i = currentIndex; i < chunks.length; i++) {
    totalMs += calculateDisplayTime(chunks[i], wpm, mode);
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
 * Compute effective WPM during ramp-up from a configurable start %.
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
  curve: 'linear' | 'logarithmic' = 'linear',
  startPercent: number = 50
): number {
  const startWpm = targetWpm * (startPercent / 100);
  const elapsedSeconds = elapsedMs / 1000;

  if (curve === 'logarithmic') {
    const gap = targetWpm - startWpm;
    const remaining = gap * Math.pow(0.5, elapsedSeconds / rampInterval);
    return Math.round(targetWpm - remaining);
  }

  const ratePerSecond = rampRate / rampInterval;
  return Math.min(targetWpm, Math.round(startWpm + ratePerSecond * elapsedSeconds));
}

/**
 * Format seconds as a short read-time string (e.g. "5 min").
 */
export function formatReadTime(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

export function estimateReadingTimeFromCharCount(charCount: number, wpm: number): number {
  if (charCount <= 0 || wpm <= 0) return 0;
  const charsPerMinute = wpm * AVG_WORD_LENGTH;
  return (charCount / charsPerMinute) * 60;
}
