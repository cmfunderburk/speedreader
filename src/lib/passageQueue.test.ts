import { describe, expect, it } from 'vitest';
import { buildPassageReviewQueue, passageStatePriority } from './passageQueue';
import type { Passage, PassageReviewState } from '../types';

function makePassage(id: string, reviewState: PassageReviewState, updatedAt: number): Passage {
  return {
    id,
    articleId: 'article-1',
    articleTitle: 'Article 1',
    sourceMode: 'saccade',
    captureKind: 'sentence',
    text: 'text',
    createdAt: 1,
    updatedAt,
    sourceChunkIndex: 0,
    reviewState,
    reviewCount: 0,
  };
}

describe('passageQueue', () => {
  it('assigns deterministic review state priorities', () => {
    expect(passageStatePriority('hard')).toBeLessThan(passageStatePriority('new'));
    expect(passageStatePriority('new')).toBeLessThan(passageStatePriority('easy'));
    expect(passageStatePriority('easy')).toBeLessThan(passageStatePriority('done'));
  });

  it('builds review queue by state priority then recency', () => {
    const queue = buildPassageReviewQueue([
      makePassage('done-1', 'done', 500),
      makePassage('easy-old', 'easy', 100),
      makePassage('new-newer', 'new', 400),
      makePassage('hard-old', 'hard', 200),
      makePassage('hard-newer', 'hard', 300),
      makePassage('new-older', 'new', 50),
    ]);

    expect(queue.map((passage) => passage.id)).toEqual([
      'hard-newer',
      'hard-old',
      'new-newer',
      'new-older',
      'easy-old',
    ]);
  });
});
