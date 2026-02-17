import { useMemo, useState } from 'react';
import type { Article, TokenMode } from '../types';
import { tokenize, estimateReadingTime } from '../lib/tokenizer';
import { formatReadTime } from '../lib/rsvp';

interface ArticlePreviewProps {
  article: Article;
  initialWpm: number;
  initialMode: TokenMode;
  onStart: (article: Article, wpm: number, mode: TokenMode) => void;
  onClose: () => void;
}

export function ArticlePreview({
  article,
  initialWpm,
  initialMode,
  onStart,
  onClose,
}: ArticlePreviewProps) {
  const [wpm, setWpm] = useState(initialWpm);
  const [mode, setMode] = useState<TokenMode>(initialMode);

  const chunks = useMemo(
    () => tokenize(article.content, mode),
    [article.content, mode]
  );
  const readTime = useMemo(
    () => estimateReadingTime(chunks, wpm),
    [chunks, wpm]
  );

  return (
    <div className="article-preview">
      <div className="preview-header">
        <h2>Article Preview</h2>
        <button onClick={onClose} className="btn-close">✕ Close</button>
      </div>

      <div className="preview-meta">
        <h3 className="preview-title">{article.title}</h3>
        <span className="preview-source">
          {article.source} • {formatReadTime(readTime)} • Added {new Date(article.addedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="preview-content">
        {article.content}
      </div>

      <div className="preview-controls">
        <button onClick={() => onStart(article, wpm, mode)} className="btn-start">
          Start Reading ▶
        </button>

        <label className="control-group">
          <span className="control-label">Mode:</span>
          <select
            value={mode}
            onChange={e => setMode(e.target.value as TokenMode)}
            className="control-select"
          >
            <option value="word">Word</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label className="control-group">
          <span className="control-label">Speed:</span>
          <input
            type="range"
            min="100"
            max="800"
            step="10"
            value={wpm}
            onChange={e => setWpm(Number(e.target.value))}
            className="control-slider wpm-slider"
          />
          <span className="control-value">{wpm} WPM</span>
        </label>
      </div>
    </div>
  );
}
