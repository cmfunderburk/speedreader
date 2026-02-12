import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateArticlePosition,
  updateArticlePredictionPosition,
  loadPassages,
  upsertPassage,
  updatePassageReviewState,
  touchPassageReview,
  loadSessionSnapshot,
  saveSessionSnapshot,
  clearSessionSnapshot,
  loadSettings,
  saveSettings,
  loadDrillState,
  saveDrillState,
} from '../lib/storage';
import type { Passage } from '../types';
import {
  createTestArticle,
  seedArticles,
  getStoredArticles,
  getStoredPosition,
  getStoredPredictionPosition,
  clearStorage,
  resetIdCounter,
} from './storage-helpers';

beforeEach(() => {
  clearStorage();
  resetIdCounter();
});

describe('storage-helpers', () => {
  it('createTestArticle produces unique IDs', () => {
    const a = createTestArticle();
    const b = createTestArticle();
    expect(a.id).not.toBe(b.id);
  });

  it('createTestArticle applies overrides', () => {
    const a = createTestArticle({ title: 'Custom', readPosition: 42 });
    expect(a.title).toBe('Custom');
    expect(a.readPosition).toBe(42);
  });

  it('seedArticles + getStoredArticles round-trips', () => {
    const articles = [createTestArticle(), createTestArticle()];
    seedArticles(articles);
    expect(getStoredArticles()).toEqual(articles);
  });

  it('clearStorage removes all app keys', () => {
    seedArticles([createTestArticle()]);
    clearStorage();
    expect(getStoredArticles()).toEqual([]);
  });
});

describe('storage-helpers with real storage functions', () => {
  it('updateArticlePosition is readable via getStoredPosition', () => {
    const article = createTestArticle();
    seedArticles([article]);

    updateArticlePosition(article.id, 25);

    expect(getStoredPosition(article.id)).toBe(25);
  });

  it('updateArticlePredictionPosition is readable via getStoredPredictionPosition', () => {
    const article = createTestArticle();
    seedArticles([article]);

    updateArticlePredictionPosition(article.id, 100);

    expect(getStoredPredictionPosition(article.id)).toBe(100);
  });

  it('position updates do not corrupt other articles', () => {
    const a = createTestArticle();
    const b = createTestArticle();
    seedArticles([a, b]);

    updateArticlePosition(a.id, 10);

    expect(getStoredPosition(a.id)).toBe(10);
    expect(getStoredPosition(b.id)).toBe(0); // unchanged
  });

  it('updating nonexistent article is a no-op', () => {
    const article = createTestArticle();
    seedArticles([article]);

    updateArticlePosition('nonexistent', 99);

    expect(getStoredPosition(article.id)).toBe(0); // unchanged
    expect(getStoredArticles()).toHaveLength(1);
  });

  it('upsertPassage + loadPassages round-trips with review updates', () => {
    const now = Date.now();
    const passage: Passage = {
      id: 'p1',
      articleId: 'a1',
      articleTitle: 'Article 1',
      sourceMode: 'saccade',
      captureKind: 'paragraph',
      text: 'Captured passage',
      createdAt: now,
      updatedAt: now,
      sourceChunkIndex: 12,
      sourcePageIndex: 2,
      sourceLineIndex: 4,
      reviewState: 'new',
      reviewCount: 0,
    };

    upsertPassage(passage);
    updatePassageReviewState('p1', 'hard');
    touchPassageReview('p1', 'recall');

    const loaded = loadPassages();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].reviewState).toBe('hard');
    expect(loaded[0].reviewCount).toBe(1);
    expect(loaded[0].lastReviewMode).toBe('recall');
  });

  it('session snapshot persists and clears', () => {
    saveSessionSnapshot({
      reading: { articleId: 'a1', chunkIndex: 20, displayMode: 'saccade' },
      training: { passageId: 'p1', mode: 'prediction', startedAt: Date.now() },
      lastTransition: 'read-to-prediction',
      updatedAt: Date.now(),
    });

    expect(loadSessionSnapshot()?.reading?.articleId).toBe('a1');
    clearSessionSnapshot();
    expect(loadSessionSnapshot()).toBeNull();
  });

  it('settings default and persist prediction preview configuration', () => {
    const defaults = loadSettings();
    expect(defaults.predictionPreviewMode).toBe('sentences');
    expect(defaults.predictionPreviewSentenceCount).toBe(2);
    expect(defaults.themePreference).toBe('dark');
    expect(defaults.wpmByActivity['paced-reading']).toBe(defaults.defaultWpm);
    expect(defaults.wpmByActivity['active-recall']).toBe(defaults.defaultWpm);
    expect(defaults.wpmByActivity.training).toBe(defaults.defaultWpm);

    saveSettings({
      ...defaults,
      predictionPreviewMode: 'unlimited',
      predictionPreviewSentenceCount: 5,
      themePreference: 'system',
      wpmByActivity: {
        ...defaults.wpmByActivity,
        training: 460,
      },
    });

    const loaded = loadSettings();
    expect(loaded.predictionPreviewMode).toBe('unlimited');
    expect(loaded.predictionPreviewSentenceCount).toBe(5);
    expect(loaded.themePreference).toBe('system');
    expect(loaded.wpmByActivity.training).toBe(460);
  });

  it('migrates legacy settings without per-activity WPM', () => {
    localStorage.setItem('speedread_settings', JSON.stringify({
      defaultWpm: 360,
      predictionPreviewMode: 'sentences',
    }));

    const loaded = loadSettings();
    expect(loaded.defaultWpm).toBe(360);
    expect(loaded.wpmByActivity['paced-reading']).toBe(360);
    expect(loaded.wpmByActivity['active-recall']).toBe(360);
    expect(loaded.wpmByActivity.training).toBe(360);
  });

  it('drill state persists auto-adjust toggle', () => {
    saveDrillState({
      wpm: 300,
      charLimit: 120,
      rollingScores: [0.9, 0.95],
      corpusFamily: 'prose',
      tier: 'medium',
      autoAdjustDifficulty: true,
    });

    const loaded = loadDrillState();
    expect(loaded).toEqual({
      wpm: 300,
      charLimit: 120,
      rollingScores: [0.9, 0.95],
      corpusFamily: 'prose',
      tier: 'medium',
      autoAdjustDifficulty: true,
    });
  });

  it('legacy drill state without auto-adjust toggle remains readable', () => {
    localStorage.setItem('speedread_drill_state', JSON.stringify({
      wpm: 280,
      charLimit: 80,
      rollingScores: [0.8],
      tier: 'hard',
    }));

    const loaded = loadDrillState();
    expect(loaded).toEqual({
      wpm: 280,
      charLimit: 80,
      rollingScores: [0.8],
      tier: 'hard',
    });
  });
});
