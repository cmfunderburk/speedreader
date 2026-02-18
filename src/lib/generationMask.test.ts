import { describe, expect, it } from 'vitest';
import { maskGenerationLine } from './generationMask';

function getWordTokens(line: string): string[] {
  return line.trim().split(/\s+/);
}

function letterCount(token: string): number {
  return (token.match(/[A-Za-z]/g) || []).length;
}

function maskCount(token: string): number {
  return (token.match(/_/g) || []).length;
}

function hasConsecutiveMasks(token: string): boolean {
  return /__/.test(token);
}

describe('generationMask', () => {
  it('returns deterministic masking for a fixed seed', () => {
    const line = 'retrieval practice improves durable memory';
    const maskedA = maskGenerationLine(line, 'normal', 42, 0);
    const maskedB = maskGenerationLine(line, 'normal', 42, 0);
    expect(maskedA).toBe(maskedB);
    expect(maskedA).not.toBe(line);
  });

  it('reshuffles masking across different seeds', () => {
    const line = 'retrieval practice improves durable memory';
    const maskedA = maskGenerationLine(line, 'normal', 1001, 2);
    const maskedB = maskGenerationLine(line, 'normal', 1002, 2);
    expect(maskedA).not.toBe(maskedB);
  });

  it('masks every eligible word and exempts function words, proper nouns, acronyms, and numbers', () => {
    const allEligible = 'retrieval practice improves durable memory';
    const allEligibleMasked = maskGenerationLine(allEligible, 'normal', 5, 0);
    getWordTokens(allEligibleMasked).forEach((token) => {
      expect(maskCount(token)).toBeGreaterThan(0);
    });

    const line = 'we discussed entropy with Alice and NASA in 2026.';
    const masked = maskGenerationLine(line, 'hard', 7, 1);

    expect(masked).toContain('Alice');
    expect(masked).toContain('NASA');
    expect(masked).toContain('2026');
    expect(masked).toContain('and');
    expect(masked).not.toContain('discussed');
    expect(masked).not.toContain('entropy');
    expect(masked).not.toBe(line);
  });

  it('masks standalone title-cased words in heading-like lines', () => {
    const headingLine = 'Learning Is Misunderstood';
    const masked = maskGenerationLine(headingLine, 'normal', 9, 0);
    expect(masked).not.toContain('Misunderstood');
  });

  it('applies per-word mask caps (<=25% normal, <=40% hard)', () => {
    const line = 'retrieval practice improves durable memory formation substantially';
    const originalTokens = getWordTokens(line);
    const normal = maskGenerationLine(line, 'normal', 33, 4);
    const hard = maskGenerationLine(line, 'hard', 33, 4);

    const normalTokens = getWordTokens(normal);
    const hardTokens = getWordTokens(hard);

    for (let i = 0; i < normalTokens.length; i++) {
      const originalLetters = letterCount(originalTokens[i]);
      const normalMasks = maskCount(normalTokens[i]);
      const hardMasks = maskCount(hardTokens[i]);

      expect(normalMasks).toBeLessThanOrEqual(Math.floor(originalLetters * 0.25));
      expect(hardMasks).toBeLessThanOrEqual(Math.floor(originalLetters * 0.4));
    }

    const normalUnderscores = (normal.match(/_/g) || []).length;
    const hardUnderscores = (hard.match(/_/g) || []).length;
    expect(hardUnderscores).toBeGreaterThan(normalUnderscores);
  });

  it('never places consecutive masked letters in a word', () => {
    const line = 'retrieval substantially unconventional groundbreaking methodologies';
    for (let seed = 0; seed < 24; seed++) {
      const masked = maskGenerationLine(line, 'hard', seed, 3);
      const tokens = getWordTokens(masked);
      tokens.forEach((token) => {
        expect(hasConsecutiveMasks(token)).toBe(false);
      });
    }
  });

  it('masks each hyphen-separated word independently', () => {
    const line = 'practice-practice-practice';
    const masked = maskGenerationLine(line, 'normal', 1, 0);
    const segments = masked.split('-');

    expect(segments).toHaveLength(3);
    segments.forEach((segment) => {
      expect(maskCount(segment)).toBeGreaterThan(0);
    });
  });
});
