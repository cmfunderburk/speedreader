import { describe, it, expect } from 'vitest';
import { calculateSaccadeLineDuration, computeLineFixations } from './saccade';

describe('calculateSaccadeLineDuration', () => {
  it('returns 0 for empty text or zero WPM', () => {
    expect(calculateSaccadeLineDuration(0, 300)).toBe(0);
    expect(calculateSaccadeLineDuration(50, 0)).toBe(0);
    expect(calculateSaccadeLineDuration(-1, 300)).toBe(0);
    expect(calculateSaccadeLineDuration(50, -10)).toBe(0);
  });

  it('treats 5 characters as 1 word', () => {
    // At 300 WPM, 1 word = 60000/300 = 200ms
    // 5 chars = 1 word = 200ms
    expect(calculateSaccadeLineDuration(5, 300)).toBe(200);
  });

  it('scales linearly with character count', () => {
    const wpm = 300;
    const dur10 = calculateSaccadeLineDuration(10, wpm);
    const dur20 = calculateSaccadeLineDuration(20, wpm);
    const dur40 = calculateSaccadeLineDuration(40, wpm);

    expect(dur20).toBe(dur10 * 2);
    expect(dur40).toBe(dur10 * 4);
  });

  it('scales inversely with WPM', () => {
    const chars = 50; // 10 "words"
    const dur300 = calculateSaccadeLineDuration(chars, 300);
    const dur600 = calculateSaccadeLineDuration(chars, 600);

    expect(dur300).toBe(dur600 * 2);
  });

  it('computes correct duration for a typical 80-char line', () => {
    // 80 chars = 16 words. At 300 WPM: 16/300 * 60000 = 3200ms
    expect(calculateSaccadeLineDuration(80, 300)).toBe(3200);
  });

  it('computes correct duration at common WPM settings', () => {
    const chars = 50; // 10 words

    // 200 WPM: 10/200 * 60000 = 3000ms
    expect(calculateSaccadeLineDuration(chars, 200)).toBe(3000);

    // 400 WPM: 10/400 * 60000 = 1500ms
    expect(calculateSaccadeLineDuration(chars, 400)).toBe(1500);

    // 600 WPM: 10/600 * 60000 = 1000ms
    expect(calculateSaccadeLineDuration(chars, 600)).toBe(1000);
  });
});

describe('computeLineFixations', () => {
  it('returns at least one fixation for non-empty text', () => {
    const fixations = computeLineFixations('Hello world', 10);
    expect(fixations.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for empty text', () => {
    expect(computeLineFixations('', 10)).toEqual([]);
  });

  it('skips short first words', () => {
    const fixations = computeLineFixations('A wonderful day', 10);
    // First fixation should NOT be on 'A' (char 0) — should skip to 'wonderful'
    expect(fixations[0]).toBeGreaterThan(0);
  });

  it('produces fixation indices within text bounds', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the river bank';
    const fixations = computeLineFixations(text, 10);
    for (const idx of fixations) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(text.length);
    }
  });

  it('produces monotonically increasing fixation positions', () => {
    const text = 'Reading is a complex cognitive process that involves multiple brain regions';
    const fixations = computeLineFixations(text, 10);
    for (let i = 1; i < fixations.length; i++) {
      expect(fixations[i]).toBeGreaterThan(fixations[i - 1]);
    }
  });

  it('prefers longer content words over short function words', () => {
    // "a" should be skipped in favor of "pharmaceutical"
    const text = 'a pharmaceutical';
    const fixations = computeLineFixations(text, 10);
    expect(fixations.length).toBe(1);
    // Fixation should be on "pharmaceutical", not "a"
    expect(fixations[0]).toBeGreaterThan(1);
  });
});
