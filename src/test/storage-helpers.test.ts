import { describe, it, expect, beforeEach } from 'vitest';
import { updateArticlePosition, updateArticlePredictionPosition } from '../lib/storage';
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
});
