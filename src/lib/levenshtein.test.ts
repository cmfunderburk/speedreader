import { describe, it, expect } from 'vitest';
import { isDetailWord } from './levenshtein';

describe('isDetailWord', () => {
  it('flags words containing digits', () => {
    expect(isDetailWord('1732', false)).toBe(true);
    expect(isDetailWord('3rd', false)).toBe(true);
    expect(isDetailWord('20th', true)).toBe(true); // digits override sentence-initial
  });

  it('flags capitalized non-sentence-initial words', () => {
    expect(isDetailWord('Washington', false)).toBe(true);
    expect(isDetailWord('Smith', false)).toBe(true);
    expect(isDetailWord('UNESCO', false)).toBe(true);
  });

  it('does not flag sentence-initial capitalized words', () => {
    expect(isDetailWord('The', true)).toBe(false);
    expect(isDetailWord('George', true)).toBe(false);
  });

  it('does not flag lowercase words', () => {
    expect(isDetailWord('the', false)).toBe(false);
    expect(isDetailWord('quickly', false)).toBe(false);
    expect(isDetailWord('was', true)).toBe(false);
  });

  it('does not flag single-character words', () => {
    expect(isDetailWord('I', false)).toBe(false);
    expect(isDetailWord('A', false)).toBe(false);
    expect(isDetailWord('a', false)).toBe(false);
  });

  it('handles words starting with punctuation', () => {
    // First alpha char determines — e.g. quoted proper noun
    expect(isDetailWord('"Smith', false)).toBe(true);
    expect(isDetailWord('"the', false)).toBe(false);
  });

  it('handles words with no alphabetic characters', () => {
    // Pure punctuation — no first alpha, not a detail word (unless has digit)
    expect(isDetailWord('...', false)).toBe(false);
    expect(isDetailWord('--', false)).toBe(false);
  });
});
