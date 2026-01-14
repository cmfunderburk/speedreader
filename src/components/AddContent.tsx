import { useState, useEffect } from 'react';
import type { Article } from '../types';

interface AddContentProps {
  onAdd: (article: Omit<Article, 'id' | 'addedAt' | 'readPosition' | 'isRead'>) => void;
  onClose: () => void;
}

type Tab = 'url' | 'paste' | 'bookmarklet';

// Get the SpeedRead URL for the bookmarklet to use
function getSpeedReadUrl(): string {
  return window.location.origin;
}

export function AddContent({ onAdd, onClose }: AddContentProps) {
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

      // Try to extract using simple heuristics
      // In a real app, we'd use @mozilla/readability here
      const articleTitle = doc.querySelector('h1')?.textContent
        || doc.querySelector('title')?.textContent
        || 'Untitled';

      const articleContent = extractArticleContent(doc);
      const articleSource = new URL(url).hostname.replace('www.', '');

      onAdd({
        title: articleTitle.trim(),
        content: articleContent,
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

  const speedReadUrl = getSpeedReadUrl();

  // Bookmarklet opens SpeedRead and sends data via postMessage
  const bookmarkletCode = `javascript:(function(){
    const title = document.querySelector('h1')?.innerText || document.title;
    const article = document.querySelector('article') || document.querySelector('main') || document.body;
    const content = article.innerText;
    const source = location.hostname.replace('www.', '');
    const data = {type:'speedread-article', title, content, source, url: location.href};
    const w = window.open('${speedReadUrl}?import=1', 'speedread');
    if(w){
      const send = () => w.postMessage(data, '${speedReadUrl}');
      setTimeout(send, 1000);
      setTimeout(send, 2000);
      setTimeout(send, 3000);
    } else {
      alert('Could not open SpeedRead. Check popup blocker.');
    }
  })();`;

  // Listen for postMessage from bookmarklet
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin if needed - for localhost dev, accept all
      if (event.data?.type === 'speedread-article') {
        onAdd({
          title: event.data.title,
          content: event.data.content,
          source: event.data.source,
          url: event.data.url,
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAdd]);

  // Check URL params for import mode (auto-show bookmarklet tab)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('import') === '1') {
      setTab('bookmarklet');
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  return (
    <div className="add-content">
      <div className="add-header">
        <h2>Add Article</h2>
        <button onClick={onClose} className="btn-close">✕ Close</button>
      </div>

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
        <button
          className={`tab ${tab === 'bookmarklet' ? 'tab-active' : ''}`}
          onClick={() => setTab('bookmarklet')}
        >
          Bookmarklet
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
            Note: Some paywalled sites may not work. Use the Bookmarklet tab for those.
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

      {tab === 'bookmarklet' && (
        <div className="add-form">
          <p className="bookmarklet-instructions">
            <strong>Step 1:</strong> Drag this button to your bookmarks bar:
          </p>
          <a
            href={bookmarkletCode}
            className="bookmarklet-link"
            onClick={e => e.preventDefault()}
            draggable
          >
            📖 Save to SpeedRead
          </a>
          <p className="bookmarklet-instructions">
            <strong>Step 2:</strong> When viewing a paywalled article (while logged in),
            click the bookmarklet. SpeedRead will open and the article will be imported automatically.
          </p>
          <p className="bookmarklet-instructions bookmarklet-note">
            Note: You may need to allow popups for this site if blocked.
          </p>
          <p className="bookmarklet-instructions">
            <strong>Waiting for article...</strong> Click the bookmarklet on an article page.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Simple article content extraction fallback.
 * In production, use @mozilla/readability.
 */
function extractArticleContent(doc: Document): string {
  // Try common article containers
  const selectors = [
    'article',
    '[role="article"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    'main',
    '.content',
  ];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el && el.textContent && el.textContent.length > 500) {
      return cleanText(el.textContent);
    }
  }

  // Fallback: get body text
  return cleanText(doc.body.textContent || '');
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
