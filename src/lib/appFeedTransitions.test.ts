import { describe, expect, it } from 'vitest';
import type { Article, Feed } from '../types';
import { appendFeed, mergeFeedArticles, updateFeedLastFetched } from './appFeedTransitions';

function makeArticle(id: string, url?: string): Article {
  return {
    id,
    title: `Article ${id}`,
    content: 'Sample content',
    source: 'Feed',
    url,
    addedAt: 100,
    readPosition: 0,
    isRead: false,
  };
}

function makeFeed(id: string, lastFetched: number): Feed {
  return {
    id,
    title: `Feed ${id}`,
    url: `https://example.com/${id}.xml`,
    lastFetched,
  };
}

describe('appFeedTransitions', () => {
  it('appends a newly fetched feed', () => {
    const existingFeeds = [makeFeed('f1', 100)];
    const fetchedFeed = makeFeed('f2', 200);

    const nextFeeds = appendFeed(existingFeeds, fetchedFeed);
    expect(nextFeeds).toEqual([existingFeeds[0], fetchedFeed]);
    expect(existingFeeds).toHaveLength(1);
  });

  it('merges feed articles by excluding URLs that already exist in stored articles', () => {
    const existingArticles = [
      makeArticle('a1', 'https://example.com/1'),
      makeArticle('a2', 'https://example.com/2'),
    ];
    const fetchedArticles = [
      makeArticle('a3', 'https://example.com/2'),
      makeArticle('a4', 'https://example.com/3'),
      makeArticle('a5'),
    ];

    const plan = mergeFeedArticles(existingArticles, fetchedArticles);
    expect(plan.addedArticleCount).toBe(2);
    expect(plan.nextArticles.map((article) => article.id)).toEqual(['a1', 'a2', 'a4', 'a5']);
  });

  it('returns the same articles reference when a merge adds nothing', () => {
    const existingArticles = [makeArticle('a1', 'https://example.com/1')];
    const fetchedArticles = [makeArticle('a2', 'https://example.com/1')];

    const plan = mergeFeedArticles(existingArticles, fetchedArticles);
    expect(plan.addedArticleCount).toBe(0);
    expect(plan.nextArticles).toBe(existingArticles);
  });

  it('updates only the refreshed feed timestamp', () => {
    const existingFeeds = [makeFeed('f1', 10), makeFeed('f2', 20)];

    const plan = updateFeedLastFetched(existingFeeds, 'f2', 200);
    expect(plan.changed).toBe(true);
    expect(plan.nextFeeds).toEqual([
      makeFeed('f1', 10),
      { ...makeFeed('f2', 20), lastFetched: 200 },
    ]);
  });

  it('returns unchanged feeds when refreshed feed is missing', () => {
    const existingFeeds = [makeFeed('f1', 10)];

    const plan = updateFeedLastFetched(existingFeeds, 'missing', 200);
    expect(plan.changed).toBe(false);
    expect(plan.nextFeeds).toBe(existingFeeds);
  });
});
