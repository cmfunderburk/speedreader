import { useState } from 'react';
import { Readability } from '@mozilla/readability';
import type { Article } from '../types';

interface AddContentProps {
  onAdd: (article: Omit<Article, 'id' | 'addedAt' | 'readPosition' | 'isRead'>) => void;
  onClose: () => void;
  inline?: boolean;
}

type Tab = 'url' | 'paste';

export function AddContent({ onAdd, onClose, inline }: AddContentProps) {
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // For now, just use a CORS proxy - user can configure their own
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error('Failed to fetch article');
      }

      const html = await response.text();

      // Parse with DOMParser
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Use Readability for clean extraction
      const reader = new Readability(doc);
      const article = reader.parse();

      if (!article || !article.textContent) {
        throw new Error('Could not extract article content');
      }

      const articleSource = new URL(url).hostname.replace('www.', '');

      onAdd({
        title: article.title || 'Untitled',
        content: article.textContent.trim(),
        source: articleSource,
        url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch article');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }

    onAdd({
      title: title.trim(),
      content: content.trim(),
      source: source.trim() || 'Manual',
    });
  };

  return (
    <div className="add-content">
      {!inline && (
        <div className="add-header">
          <h2>Add Article</h2>
          <button onClick={onClose} className="btn-close">✕ Close</button>
        </div>
      )}

      <div className="add-tabs">
        <button
          className={`tab ${tab === 'url' ? 'tab-active' : ''}`}
          onClick={() => setTab('url')}
        >
          URL
        </button>
        <button
          className={`tab ${tab === 'paste' ? 'tab-active' : ''}`}
          onClick={() => setTab('paste')}
        >
          Paste Text
        </button>
      </div>

      {error && <div className="add-error">{error}</div>}

      {tab === 'url' && (
        <form onSubmit={handleUrlSubmit} className="add-form">
          <label className="form-group">
            <span className="form-label">Article URL</span>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              required
              className="form-input"
            />
          </label>
          <p className="form-help">
            Note: Some paywalled sites may not work. In that case, use Paste Text.
          </p>
          <button type="submit" disabled={isLoading} className="btn-submit">
            {isLoading ? 'Loading...' : 'Add Article'}
          </button>
        </form>
      )}

      {tab === 'paste' && (
        <form onSubmit={handlePasteSubmit} className="add-form">
          <label className="form-group">
            <span className="form-label">Title</span>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Article title"
              required
              className="form-input"
            />
          </label>
          <label className="form-group">
            <span className="form-label">Source (optional)</span>
            <input
              type="text"
              value={source}
              onChange={e => setSource(e.target.value)}
              placeholder="NYT, WSJ, etc."
              className="form-input"
            />
          </label>
          <label className="form-group">
            <span className="form-label">Content</span>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Paste article text here..."
              required
              className="form-textarea"
              rows={10}
            />
          </label>
          <button type="submit" className="btn-submit">
            Add Article
          </button>
        </form>
      )}

    </div>
  );
}
