import type { Article } from '../types';
import { measureTextMetrics } from './textMetrics';

interface UpsertArticleByUrlInput {
  existingArticles: Article[];
  title: string;
  content: string;
  url: string;
  source: string;
  group?: string;
  now: number;
  generateId: () => string;
}

interface UpsertArticleByUrlResult {
  article: Article;
  articles: Article[];
  changed: boolean;
}

export function upsertArticleByUrl({
  existingArticles,
  title,
  content,
  url,
  source,
  group,
  now,
  generateId,
}: UpsertArticleByUrlInput): UpsertArticleByUrlResult {
  const existing = existingArticles.find((article) => article.url === url);
  const metrics = measureTextMetrics(content);

  if (existing) {
    const needsUpdate =
      existing.title !== title ||
      existing.content !== content ||
      existing.source !== source ||
      existing.group !== group;

    if (!needsUpdate) {
      return { article: existing, articles: existingArticles, changed: false };
    }

    const updatedArticle: Article = {
      ...existing,
      title,
      content,
      source,
      ...(group ? { group } : {}),
      ...metrics,
    };

    return {
      article: updatedArticle,
      articles: existingArticles.map((article) => (article.id === existing.id ? updatedArticle : article)),
      changed: true,
    };
  }

  const newArticle: Article = {
    id: generateId(),
    title,
    content,
    source,
    url,
    addedAt: now,
    readPosition: 0,
    isRead: false,
    ...(group ? { group } : {}),
    ...metrics,
  };

  return {
    article: newArticle,
    articles: [...existingArticles, newArticle],
    changed: true,
  };
}
