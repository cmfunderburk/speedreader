import { describe, expect, it } from 'vitest';
import {
  getFeaturedFetchErrorMessage,
  planFeaturedFetchResult,
  prepareFeaturedArticleUpsert,
  resolveDailyFeaturedArticle,
} from './featuredArticleLaunch';
import type { Article } from '../types';

function makeArticle(id: string, url: string): Article {
  return {
    id,
    title: `Article ${id}`,
    content: 'Sample content',
    source: 'Wikipedia Daily',
    url,
    addedAt: 100,
    readPosition: 0,
    isRead: false,
  };
}

describe('featuredArticleLaunch', () => {
  it('resolves cached daily article only when date matches', () => {
    const article = makeArticle('a1', 'https://example.com/a1');
    const articles = [article];

    expect(resolveDailyFeaturedArticle(
      '2026-02-12',
      { date: '2026-02-12', articleId: 'a1' },
      articles
    )).toEqual(article);

    expect(resolveDailyFeaturedArticle(
      '2026-02-12',
      { date: '2026-02-11', articleId: 'a1' },
      articles
    )).toBeNull();

    expect(resolveDailyFeaturedArticle(
      '2026-02-12',
      { date: '2026-02-12', articleId: 'missing' },
      articles
    )).toBeNull();
  });

  it('prepares featured article upsert with wikipedia grouping', () => {
    const existing = [makeArticle('a1', 'https://example.com/a1')];
    const result = prepareFeaturedArticleUpsert({
      existingArticles: existing,
      payload: {
        title: 'Fresh',
        content: 'Fresh content',
        url: 'https://example.com/new',
      },
      source: 'Wikipedia Featured',
      now: 999,
      generateId: () => 'new-id',
    });

    expect(result.changed).toBe(true);
    expect(result.article).toMatchObject({
      id: 'new-id',
      title: 'Fresh',
      source: 'Wikipedia Featured',
      group: 'Wikipedia',
      url: 'https://example.com/new',
      addedAt: 999,
    });
  });

  it('plans featured fetch result and emits daily info for daily source', () => {
    const existing = [makeArticle('a1', 'https://example.com/a1')];
    const plan = planFeaturedFetchResult({
      existingArticles: existing,
      payload: {
        title: 'Daily',
        content: 'Daily content',
        url: 'https://example.com/daily',
      },
      source: 'Wikipedia Daily',
      now: 123,
      generateId: () => 'daily-id',
      today: '2026-02-12',
    });

    expect(plan.upserted.article).toMatchObject({
      id: 'daily-id',
      source: 'Wikipedia Daily',
      url: 'https://example.com/daily',
    });
    expect(plan.dailyInfo).toEqual({ date: '2026-02-12', articleId: 'daily-id' });
  });

  it('does not emit daily info for random featured source', () => {
    const existing = [makeArticle('a1', 'https://example.com/a1')];
    const plan = planFeaturedFetchResult({
      existingArticles: existing,
      payload: {
        title: 'Featured',
        content: 'Featured content',
        url: 'https://example.com/featured',
      },
      source: 'Wikipedia Featured',
      now: 456,
      generateId: () => 'featured-id',
      today: '2026-02-12',
    });

    expect(plan.upserted.article.id).toBe('featured-id');
    expect(plan.dailyInfo).toBeNull();
  });

  it('normalizes featured fetch errors to user-facing message', () => {
    expect(getFeaturedFetchErrorMessage(new Error('Network down'), 'Fallback')).toBe('Network down');
    expect(getFeaturedFetchErrorMessage('unknown', 'Fallback')).toBe('Fallback');
  });
});
