import type { Article, Feed } from '../types';

export interface FeedArticleMergePlan {
  nextArticles: Article[];
  addedArticleCount: number;
}

export interface FeedRefreshPlan {
  nextFeeds: Feed[];
  changed: boolean;
}

export function appendFeed(existingFeeds: Feed[], feed: Feed): Feed[] {
  return [...existingFeeds, feed];
}

export function mergeFeedArticles(existingArticles: Article[], fetchedArticles: Article[]): FeedArticleMergePlan {
  const existingUrls = new Set(existingArticles.flatMap((article) => (article.url ? [article.url] : [])));
  const newArticles = fetchedArticles.filter((article) => !article.url || !existingUrls.has(article.url));
  if (newArticles.length === 0) {
    return {
      nextArticles: existingArticles,
      addedArticleCount: 0,
    };
  }

  return {
    nextArticles: [...existingArticles, ...newArticles],
    addedArticleCount: newArticles.length,
  };
}

export function updateFeedLastFetched(existingFeeds: Feed[], feedId: string, lastFetched: number): FeedRefreshPlan {
  let changed = false;
  const nextFeeds = existingFeeds.map((feed) => {
    if (feed.id !== feedId) return feed;
    changed = true;
    return { ...feed, lastFetched };
  });

  if (!changed) {
    return {
      nextFeeds: existingFeeds,
      changed: false,
    };
  }

  return {
    nextFeeds,
    changed: true,
  };
}
