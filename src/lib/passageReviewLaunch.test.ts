import { describe, expect, it } from 'vitest';
import { buildPassageReviewLaunchPlan } from './passageReviewLaunch';
import type { Passage } from '../types';

function makePassage(id: string): Passage {
  return {
    id,
    articleId: `article-${id}`,
    articleTitle: `Article ${id}`,
    sourceMode: 'saccade',
    captureKind: 'sentence',
    text: 'Alpha beta gamma.',
    createdAt: 1,
    updatedAt: 1,
    sourceChunkIndex: 0,
    sourcePageIndex: 0,
    sourceLineIndex: 0,
    reviewState: 'new',
    reviewCount: 0,
  };
}

describe('passageReviewLaunch', () => {
  it('builds recall launch plan with reading snapshot and source metadata', () => {
    const passage = makePassage('p1');
    const plan = buildPassageReviewLaunchPlan({
      passage,
      mode: 'recall',
      now: 123456,
      currentReading: {
        articleId: 'article-a',
        chunkIndex: 42,
        displayMode: 'saccade',
      },
      sourceArticle: {
        source: 'Wikipedia',
        sourcePath: '/tmp/source.md',
        assetBaseUrl: '/tmp/assets',
      },
    });

    expect(plan.displayMode).toBe('recall');
    expect(plan.snapshot).toEqual({
      reading: {
        articleId: 'article-a',
        chunkIndex: 42,
        displayMode: 'saccade',
      },
      training: {
        passageId: 'p1',
        mode: 'recall',
        startedAt: 123456,
      },
      lastTransition: 'read-to-recall',
      updatedAt: 123456,
    });
    expect(plan.article).toMatchObject({
      id: 'passage-p1',
      title: 'Passage: Article p1',
      content: 'Alpha beta gamma.',
      source: 'Passage Review • Wikipedia',
      sourcePath: '/tmp/source.md',
      assetBaseUrl: '/tmp/assets',
      addedAt: 123456,
      readPosition: 0,
      isRead: false,
      wordCount: 3,
    });
  });

  it('builds prediction launch plan with fallback source and no reading snapshot', () => {
    const passage = makePassage('p2');
    const plan = buildPassageReviewLaunchPlan({
      passage,
      mode: 'prediction',
      now: 999,
    });

    expect(plan.displayMode).toBe('prediction');
    expect(plan.snapshot.reading).toBeUndefined();
    expect(plan.snapshot.lastTransition).toBe('read-to-prediction');
    expect(plan.article.source).toBe('Passage Review • Saved passage');
  });
});
