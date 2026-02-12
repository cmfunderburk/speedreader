import { describe, expect, it } from 'vitest';
import { upsertArticleByUrl } from './articleUpsert';
import type { Article } from '../types';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'Old Title',
    content: 'Old content',
    source: 'Wikipedia Daily',
    url: 'https://example.test/article',
    addedAt: 1,
    readPosition: 0,
    isRead: false,
    ...overrides,
  };
}

describe('articleUpsert', () => {
  it('creates a new article when URL is not present', () => {
    const result = upsertArticleByUrl({
      existingArticles: [],
      title: 'New',
      content: 'Some content here',
      url: 'https://example.test/new',
      source: 'Wikipedia Featured',
      group: 'Wikipedia',
      now: 100,
      generateId: () => 'new-id',
    });

    expect(result.changed).toBe(true);
    expect(result.article.id).toBe('new-id');
    expect(result.articles).toHaveLength(1);
    expect(result.article.source).toBe('Wikipedia Featured');
    expect(result.article.group).toBe('Wikipedia');
    expect(result.article.charCount).toBeTypeOf('number');
    expect(result.article.wordCount).toBeTypeOf('number');
  });

  it('returns unchanged result when existing article already matches payload', () => {
    const existing = makeArticle({
      title: 'Same',
      content: 'Same content',
      source: 'Wikipedia Daily',
      group: 'Wikipedia',
    });
    const existingArticles = [existing];
    const result = upsertArticleByUrl({
      existingArticles,
      title: 'Same',
      content: 'Same content',
      url: existing.url!,
      source: 'Wikipedia Daily',
      group: 'Wikipedia',
      now: 100,
      generateId: () => 'unused',
    });

    expect(result.changed).toBe(false);
    expect(result.article).toBe(existing);
    expect(result.articles).toBe(existingArticles);
    expect(result.articles[0]).toBe(existing);
  });

  it('updates existing article content/title/source fields by URL', () => {
    const existing = makeArticle({
      title: 'Old',
      content: 'Old content',
      source: 'Wikipedia Daily',
      group: 'Wikipedia',
      readPosition: 22,
    });
    const result = upsertArticleByUrl({
      existingArticles: [existing],
      title: 'New Title',
      content: 'New content body',
      url: existing.url!,
      source: 'Wikipedia Featured',
      group: 'Wikipedia',
      now: 100,
      generateId: () => 'unused',
    });

    expect(result.changed).toBe(true);
    expect(result.articles).toHaveLength(1);
    expect(result.article.id).toBe(existing.id);
    expect(result.article.title).toBe('New Title');
    expect(result.article.content).toBe('New content body');
    expect(result.article.source).toBe('Wikipedia Featured');
    expect(result.article.readPosition).toBe(22);
  });
});
