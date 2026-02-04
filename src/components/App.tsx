import { useState, useCallback } from 'react';
import { Reader } from './Reader';
import { ReaderControls } from './ReaderControls';
import { ProgressBar } from './ProgressBar';
import { ArticleQueue } from './ArticleQueue';
import { ArticlePreview } from './ArticlePreview';
import { AddContent } from './AddContent';
import { FeedManager } from './FeedManager';
import { Library } from './Library';
import { LibrarySettings } from './LibrarySettings';
import { SettingsPanel } from './SettingsPanel';
import { PredictionReader } from './PredictionReader';
import { PredictionStats } from './PredictionStats';
import { useRSVP } from '../hooks/useRSVP';
import { useKeyboard } from '../hooks/useKeyboard';
import { calculateRemainingTime, formatTime, calculateProgress } from '../lib/rsvp';
import { loadArticles, saveArticles, loadFeeds, saveFeeds, generateId, loadSettings, saveSettings } from '../lib/storage';
import type { Settings } from '../lib/storage';
import { fetchFeed } from '../lib/feeds';
import type { Article, Feed, TokenMode } from '../types';
import { PREDICTION_LINE_WIDTHS } from '../types';

type View = 'reader' | 'preview' | 'add' | 'library-settings' | 'settings';

// Check if we're in import mode (opened from bookmarklet)
function getInitialView(): View {
  const params = new URLSearchParams(window.location.search);
  return params.get('import') === '1' ? 'add' : 'reader';
}

export function App() {
  const [displaySettings, setDisplaySettings] = useState<Settings>(() => loadSettings());
  const settings = displaySettings;
  const [articles, setArticles] = useState<Article[]>(() => loadArticles());
  const [feeds, setFeeds] = useState<Feed[]>(() => loadFeeds());
  const [view, setView] = useState<View>(getInitialView);
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);

  const rsvp = useRSVP({
    initialWpm: settings.defaultWpm,
    initialMode: settings.defaultMode,
    initialCustomCharWidth: settings.customCharWidth,
    onComplete: () => {
      // Could auto-advance to next article here
    },
  });

  // Keyboard shortcuts
  useKeyboard({
    onSpace: rsvp.displayMode === 'prediction' ? undefined : rsvp.toggle,
    onLeft: rsvp.prev,
    onRight: rsvp.next,
    onBracketLeft: () => rsvp.setWpm(Math.max(100, rsvp.wpm - 50)),
    onBracketRight: () => rsvp.setWpm(Math.min(800, rsvp.wpm + 50)),
    onEscape: () => {
      if (view !== 'reader') {
        setView('reader');
      } else {
        rsvp.pause();
      }
    },
  });

  const handleAddArticle = useCallback((article: Omit<Article, 'id' | 'addedAt' | 'readPosition' | 'isRead'>) => {
    const newArticle: Article = {
      ...article,
      id: generateId(),
      addedAt: Date.now(),
      readPosition: 0,
      isRead: false,
    };
    const updated = [...articles, newArticle];
    setArticles(updated);
    saveArticles(updated);
    setView('reader');
  }, [articles]);

  const handleSelectArticle = useCallback((article: Article) => {
    setPreviewArticle(article);
    setView('preview');
  }, []);

  const handleStartReading = useCallback((article: Article, wpm: number, mode: TokenMode) => {
    rsvp.setWpm(wpm);
    rsvp.setMode(mode);
    rsvp.loadArticle(article);
    setView('reader');
    // Auto-play after a brief delay
    setTimeout(() => rsvp.play(), 100);
  }, [rsvp]);

  const handleRemoveArticle = useCallback((id: string) => {
    const updated = articles.filter(a => a.id !== id);
    setArticles(updated);
    saveArticles(updated);
  }, [articles]);

  const handleAddFeed = useCallback(async (url: string) => {
    setIsLoadingFeed(true);
    try {
      const { feed, articles: feedArticles } = await fetchFeed(url);

      // Add feed
      const updatedFeeds = [...feeds, feed];
      setFeeds(updatedFeeds);
      saveFeeds(updatedFeeds);

      // Add articles (avoid duplicates by URL)
      const existingUrls = new Set(articles.map(a => a.url));
      const newArticles = feedArticles.filter(a => !existingUrls.has(a.url));
      if (newArticles.length > 0) {
        const updatedArticles = [...articles, ...newArticles];
        setArticles(updatedArticles);
        saveArticles(updatedArticles);
      }
    } finally {
      setIsLoadingFeed(false);
    }
  }, [feeds, articles]);

  const handleRemoveFeed = useCallback((id: string) => {
    const updated = feeds.filter(f => f.id !== id);
    setFeeds(updated);
    saveFeeds(updated);
  }, [feeds]);

  const handleRefreshFeed = useCallback(async (feed: Feed) => {
    setIsLoadingFeed(true);
    try {
      const { articles: feedArticles } = await fetchFeed(feed.url);

      // Add new articles (avoid duplicates)
      const existingUrls = new Set(articles.map(a => a.url));
      const newArticles = feedArticles.filter(a => !existingUrls.has(a.url));
      if (newArticles.length > 0) {
        const updatedArticles = [...articles, ...newArticles];
        setArticles(updatedArticles);
        saveArticles(updatedArticles);
      }

      // Update feed's lastFetched
      const updatedFeeds = feeds.map(f =>
        f.id === feed.id ? { ...f, lastFetched: Date.now() } : f
      );
      setFeeds(updatedFeeds);
      saveFeeds(updatedFeeds);
    } finally {
      setIsLoadingFeed(false);
    }
  }, [feeds, articles]);

  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setDisplaySettings(newSettings);
    saveSettings(newSettings);
  }, []);

  const handleProgressChange = useCallback((progress: number) => {
    const newIndex = Math.floor((progress / 100) * rsvp.chunks.length);
    rsvp.goToIndex(newIndex);
  }, [rsvp]);

  const remainingTime = rsvp.chunks.length > 0
    ? formatTime(calculateRemainingTime(rsvp.chunks, rsvp.currentChunkIndex, rsvp.wpm))
    : '--:--';

  const progress = calculateProgress(rsvp.currentChunkIndex, rsvp.chunks.length);

  return (
    <div className="app" style={{
      '--rsvp-font-size': `${displaySettings.rsvpFontSize}rem`,
      '--saccade-font-size': `${displaySettings.saccadeFontSize}rem`,
      '--prediction-font-size': `${displaySettings.predictionFontSize}rem`,
      '--prediction-line-width': `${PREDICTION_LINE_WIDTHS[displaySettings.predictionLineWidth]}ch`,
    } as React.CSSProperties}>
      <header className="app-header">
        <h1>SpeedRead</h1>
        <button className="settings-gear-btn" onClick={() => setView('settings')} title="Display settings">&#9881;</button>
      </header>

      <main className="app-main">
        {view === 'reader' && (
          <>
            {rsvp.displayMode === 'prediction' ? (
              <div className="prediction-container">
                <PredictionStats stats={rsvp.predictionStats} />
                <PredictionReader
                  chunks={rsvp.chunks}
                  currentChunkIndex={rsvp.currentChunkIndex}
                  onAdvance={rsvp.next}
                  onPredictionResult={rsvp.handlePredictionResult}
                  onReset={rsvp.resetPredictionStats}
                  onClose={() => rsvp.setDisplayMode('rsvp')}
                  stats={rsvp.predictionStats}
                  wpm={rsvp.wpm}
                  goToIndex={rsvp.goToIndex}
                />
              </div>
            ) : (
              <Reader
                chunk={rsvp.currentChunk}
                isPlaying={rsvp.isPlaying}
                displayMode={rsvp.displayMode}
                mode={rsvp.mode}
                saccadePage={rsvp.currentSaccadePage}
                showPacer={rsvp.showPacer}
                wpm={rsvp.wpm}
              />
            )}

            {rsvp.displayMode !== 'prediction' && (
              <ProgressBar progress={progress} onChange={handleProgressChange} />
            )}

            <div className="article-info">
              {rsvp.article ? (
                <>
                  <span className="article-title">{rsvp.article.title}</span>
                  <span className="article-meta">
                    {rsvp.displayMode === 'prediction' ? (
                      `${rsvp.article.source} • ${rsvp.currentChunkIndex} / ${rsvp.chunks.length} words`
                    ) : (
                      `${rsvp.article.source} • ${remainingTime} remaining • ${rsvp.wpm} WPM`
                    )}
                  </span>
                </>
              ) : (
                <span className="article-meta">No article loaded</span>
              )}
            </div>

            <ReaderControls
              isPlaying={rsvp.isPlaying}
              wpm={rsvp.wpm}
              mode={rsvp.mode}
              displayMode={rsvp.displayMode}
              customCharWidth={rsvp.customCharWidth}
              showPacer={rsvp.showPacer}
              currentPageIndex={rsvp.currentSaccadePageIndex}
              totalPages={rsvp.saccadePages.length}
              onPlay={rsvp.play}
              onPause={rsvp.pause}
              onNext={rsvp.next}
              onPrev={rsvp.prev}
              onReset={rsvp.reset}
              onSkipToEnd={() => rsvp.goToIndex(rsvp.chunks.length - 1)}
              onWpmChange={rsvp.setWpm}
              onModeChange={rsvp.setMode}
              onDisplayModeChange={rsvp.setDisplayMode}
              onCustomCharWidthChange={rsvp.setCustomCharWidth}
              onShowPacerChange={rsvp.setShowPacer}
              onNextPage={rsvp.nextPage}
              onPrevPage={rsvp.prevPage}
            />
          </>
        )}

        {view === 'preview' && previewArticle && (
          <ArticlePreview
            article={previewArticle}
            initialWpm={rsvp.wpm}
            initialMode={rsvp.mode}
            onStart={handleStartReading}
            onClose={() => setView('reader')}
          />
        )}

        {view === 'add' && (
          <AddContent
            onAdd={handleAddArticle}
            onClose={() => setView('reader')}
          />
        )}

        {view === 'library-settings' && (
          <LibrarySettings onClose={() => setView('reader')} />
        )}

        {view === 'settings' && (
          <SettingsPanel
            settings={displaySettings}
            onSettingsChange={handleSettingsChange}
            onClose={() => setView('reader')}
          />
        )}
      </main>

      <aside className="app-sidebar">
        <ArticleQueue
          articles={articles}
          currentArticleId={rsvp.article?.id}
          onSelect={handleSelectArticle}
          onRemove={handleRemoveArticle}
          onAddClick={() => setView('add')}
          wpm={rsvp.wpm}
        />
        <FeedManager
          feeds={feeds}
          onAddFeed={handleAddFeed}
          onRemoveFeed={handleRemoveFeed}
          onRefreshFeed={handleRefreshFeed}
          isLoading={isLoadingFeed}
        />
        {window.library && (
          <Library
            onAdd={handleAddArticle}
            onOpenSettings={() => setView('library-settings')}
          />
        )}
      </aside>
    </div>
  );
}
