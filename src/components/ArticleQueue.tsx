import { useState, useMemo } from 'react';
import type { Article } from '../types';
import { estimateReadingTimeFromCharCount, formatReadTime } from '../lib/rsvp';

const DEFAULT_ESTIMATE_WPM = 250;

interface ArticleQueueProps {
  articles: Article[];
  currentArticleId?: string;
  onSelect: (article: Article) => void;
  onRemove: (id: string) => void;
  onAddClick: () => void;
}

export function ArticleQueue({
  articles,
  currentArticleId,
  onSelect,
  onRemove,
  onAddClick,
}: ArticleQueueProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [estimateWpm, setEstimateWpm] = useState(DEFAULT_ESTIMATE_WPM);

  const { ungrouped, groups } = useMemo(() => {
    const ungrouped: Article[] = [];
    const groupMap = new Map<string, Article[]>();

    for (const article of articles) {
      if (article.group) {
        if (!groupMap.has(article.group)) {
          groupMap.set(article.group, []);
        }
        groupMap.get(article.group)!.push(article);
      } else {
        ungrouped.push(article);
      }
    }

    const groups = Array.from(groupMap.entries()).map(([name, items]) => ({
      name,
      items: items.sort((a, b) => a.title.localeCompare(b.title)),
    }));
    return { ungrouped, groups };
  }, [articles]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const getReadTime = (article: Article) => {
    const fallbackCharCount = article.content ? article.content.replace(/\s/g, '').length : 0;
    const charCount = article.charCount ?? fallbackCharCount;
    return estimateReadingTimeFromCharCount(charCount, estimateWpm);
  };

  const renderQueueItem = (article: Article) => {
    const readTime = getReadTime(article);
    const isCurrent = article.id === currentArticleId;

    return (
      <div
        key={article.id}
        className={`queue-item ${isCurrent ? 'queue-item-current' : ''} ${article.isRead ? 'queue-item-read' : ''}`}
        onClick={() => onSelect(article)}
      >
        <span className="queue-item-indicator">
          {isCurrent ? '\u25CF' : article.isRead ? '\u2713' : '\u25CB'}
        </span>
        <div className="queue-item-content">
          <span className="queue-item-title">{article.title}</span>
          <span className="queue-item-meta">
            {article.source} {'\u2022'} {formatReadTime(readTime)}
          </span>
        </div>
        <button
          className="queue-item-remove"
          onClick={e => {
            e.stopPropagation();
            onRemove(article.id);
          }}
          title="Remove"
        >
          {'\u00D7'}
        </button>
      </div>
    );
  };

  return (
    <div className="article-queue">
      <div className="queue-header">
        <h2>Reading Queue ({articles.length})</h2>
        <button onClick={onAddClick} className="btn-add">+ Add URL</button>
      </div>

      {articles.length > 0 && (
        <div className="queue-estimate-control">
          <span className="queue-estimate-label">Est. reading speed</span>
          <input
            type="range"
            className="queue-estimate-slider"
            min={100}
            max={600}
            step={10}
            value={estimateWpm}
            onChange={e => setEstimateWpm(Number(e.target.value))}
          />
          <span className="queue-estimate-value">{estimateWpm} WPM</span>
        </div>
      )}

      <div className="queue-list">
        {articles.length === 0 ? (
          <div className="queue-empty">
            No articles in queue. Add a URL to get started.
          </div>
        ) : (
          <>
            {ungrouped.map(renderQueueItem)}

            {groups.map(({ name, items }) => {
              const isExpanded = expandedGroups.has(name);
              const totalReadTime = items.reduce((sum, a) => sum + getReadTime(a), 0);

              return (
                <div key={name} className="queue-group">
                  <button
                    className="queue-group-header"
                    onClick={() => toggleGroup(name)}
                  >
                    <span className="queue-group-expand">
                      {isExpanded ? '\u25BC' : '\u25B6'}
                    </span>
                    <span className="queue-group-name">{name}</span>
                    <span className="queue-group-meta">
                      {items.length} {items.length === 1 ? 'article' : 'articles'} {'\u2022'} {formatReadTime(totalReadTime)}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="queue-group-items">
                      {items.map(renderQueueItem)}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
