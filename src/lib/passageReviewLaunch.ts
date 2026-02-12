import type { Article, DisplayMode, Passage, PassageReviewMode, SessionSnapshot } from '../types';
import { measureTextMetrics } from './textMetrics';

interface PassageReviewReadingSnapshot {
  articleId: string;
  chunkIndex: number;
  displayMode: DisplayMode;
}

interface BuildPassageReviewLaunchArgs {
  passage: Passage;
  mode: PassageReviewMode;
  now: number;
  currentReading?: PassageReviewReadingSnapshot;
  sourceArticle?: Pick<Article, 'source' | 'sourcePath' | 'assetBaseUrl'>;
}

export interface PassageReviewLaunchPlan {
  snapshot: SessionSnapshot;
  article: Article;
  displayMode: 'recall' | 'prediction';
}

export function buildPassageReviewLaunchPlan({
  passage,
  mode,
  now,
  currentReading,
  sourceArticle,
}: BuildPassageReviewLaunchArgs): PassageReviewLaunchPlan {
  const snapshot: SessionSnapshot = {
    reading: currentReading,
    training: {
      passageId: passage.id,
      mode,
      startedAt: now,
    },
    lastTransition: mode === 'recall' ? 'read-to-recall' : 'read-to-prediction',
    updatedAt: now,
  };

  const passageMetrics = measureTextMetrics(passage.text);
  const article: Article = {
    id: `passage-${passage.id}`,
    title: `Passage: ${passage.articleTitle}`,
    content: passage.text,
    source: `Passage Review • ${sourceArticle?.source || 'Saved passage'}`,
    sourcePath: sourceArticle?.sourcePath,
    assetBaseUrl: sourceArticle?.assetBaseUrl,
    addedAt: now,
    readPosition: 0,
    isRead: false,
    ...passageMetrics,
  };

  return {
    snapshot,
    article,
    displayMode: mode === 'recall' ? 'recall' : 'prediction',
  };
}
