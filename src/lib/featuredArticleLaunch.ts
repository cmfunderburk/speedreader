import type { Article } from '../types';
import { upsertArticleByUrl } from './articleUpsert';

export interface DailyArticleInfo {
  date: string;
  articleId: string;
}

interface FeaturedArticlePayload {
  title: string;
  content: string;
  url: string;
}

interface PrepareFeaturedArticleUpsertArgs {
  existingArticles: Article[];
  payload: FeaturedArticlePayload;
  source: 'Wikipedia Daily' | 'Wikipedia Featured';
  now: number;
  generateId: () => string;
}

export function resolveDailyFeaturedArticle(
  today: string,
  dailyInfo: DailyArticleInfo | null,
  articles: Article[]
): Article | null {
  if (!dailyInfo || dailyInfo.date !== today) return null;
  return articles.find((article) => article.id === dailyInfo.articleId) ?? null;
}

export function prepareFeaturedArticleUpsert({
  existingArticles,
  payload,
  source,
  now,
  generateId,
}: PrepareFeaturedArticleUpsertArgs) {
  return upsertArticleByUrl({
    existingArticles,
    title: payload.title,
    content: payload.content,
    url: payload.url,
    source,
    group: 'Wikipedia',
    now,
    generateId,
  });
}
