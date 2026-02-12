import { describe, expect, it } from 'vitest';
import {
  adjustArticleTrainingWpm,
  computeTrainingScore,
  finalizeTrainingStats,
} from './trainingScoring';

describe('trainingScoring', () => {
  it('finalizes stats with optional final word', () => {
    const base = { totalWords: 4, exactMatches: 2, knownWords: 3, detailTotal: 1, detailKnown: 1 };
    expect(finalizeTrainingStats(base, null)).toEqual(base);
    expect(finalizeTrainingStats(base, { known: true, exact: false, isDetail: true })).toEqual({
      totalWords: 5,
      exactMatches: 2,
      knownWords: 4,
      detailTotal: 2,
      detailKnown: 2,
    });
  });

  it('computes score with and without detail words', () => {
    const stats = { totalWords: 10, exactMatches: 7, knownWords: 8, detailTotal: 2, detailKnown: 1 };
    expect(computeTrainingScore(stats, true)).toEqual({
      scorePercent: 80,
      scoreNorm: 0.8,
      effectiveTotal: 10,
      effectiveKnown: 8,
    });
    expect(computeTrainingScore(stats, false)).toEqual({
      scorePercent: 88,
      scoreNorm: 0.88,
      effectiveTotal: 8,
      effectiveKnown: 7,
    });
  });

  it('adjusts article-mode WPM by score thresholds', () => {
    expect(adjustArticleTrainingWpm(300, 89)).toBe(275);
    expect(adjustArticleTrainingWpm(300, 94)).toBe(300);
    expect(adjustArticleTrainingWpm(300, 95)).toBe(315);
    expect(adjustArticleTrainingWpm(100, 80)).toBe(100);
    expect(adjustArticleTrainingWpm(800, 99)).toBe(800);
  });
});
