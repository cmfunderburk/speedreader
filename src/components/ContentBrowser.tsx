import { useState } from 'react';
import type { Activity, Article, Feed } from '../types';
import { ArticleQueue } from './ArticleQueue';
import { AddContent } from './AddContent';
import { FeedManager } from './FeedManager';
import { Library } from './Library';

const ACTIVITY_LABELS: Record<Activity, string> = {
  'speed-reading': 'Speed Reading',
  'comprehension': 'Comprehension',
  'training': 'Training',
};

interface ContentBrowserProps {
  activity: Activity;
  articles: Article[];
  currentArticleId?: string;
  feeds: Feed[];
  isLoadingFeed: boolean;
  wpm: number;
  onSelectArticle: (article: Article) => void;
  onRemoveArticle: (id: string) => void;
  onAddArticle: (article: Omit<Article, 'id' | 'addedAt' | 'readPosition' | 'isRead'>) => void;
  onAddFeed: (url: string) => Promise<void>;
  onRemoveFeed: (id: string) => void;
  onRefreshFeed: (feed: Feed) => Promise<void>;
  onOpenLibrarySettings: () => void;
  onBack: () => void;
}

export function ContentBrowser({
  activity,
  articles,
  currentArticleId,
  feeds,
  isLoadingFeed,
  wpm,
  onSelectArticle,
  onRemoveArticle,
  onAddArticle,
  onAddFeed,
  onRemoveFeed,
  onRefreshFeed,
  onOpenLibrarySettings,
  onBack,
}: ContentBrowserProps) {
  const [addContentResetKey, setAddContentResetKey] = useState(0);

  return (
    <div className="content-browser">
      <div className="content-browser-header">
        <button onClick={onBack} className="control-btn content-browser-back">Back</button>
        <h2>Select content for {ACTIVITY_LABELS[activity]}</h2>
      </div>

      <div className="content-browser-body">
        <div className="content-browser-main">
            <ArticleQueue
            articles={articles}
            currentArticleId={currentArticleId}
            onSelect={onSelectArticle}
            onRemove={onRemoveArticle}
              onAddClick={() => setAddContentResetKey((prev) => prev + 1)}
              wpm={wpm}
            />
        </div>

        <div className="content-browser-side">
          <AddContent
            key={addContentResetKey}
            onAdd={onAddArticle}
            onClose={() => {}}
            inline
          />
          <FeedManager
            feeds={feeds}
            onAddFeed={onAddFeed}
            onRemoveFeed={onRemoveFeed}
            onRefreshFeed={onRefreshFeed}
            isLoading={isLoadingFeed}
          />
          {window.library && (
            <Library
              onAdd={onAddArticle}
              onOpenSettings={onOpenLibrarySettings}
            />
          )}
        </div>
      </div>
    </div>
  );
}
