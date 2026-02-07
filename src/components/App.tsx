import { useState, useCallback, useMemo } from 'react';
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
import { RecallReader } from './RecallReader';
import { TrainingReader } from './TrainingReader';
import { useRSVP } from '../hooks/useRSVP';
import { useKeyboard } from '../hooks/useKeyboard';
import { calculateRemainingTime, formatTime, calculateProgress } from '../lib/rsvp';
import { loadArticles, saveArticles, loadFeeds, saveFeeds, generateId, loadSettings, saveSettings } from '../lib/storage';
import type { Settings } from '../lib/storage';
import { fetchFeed } from '../lib/feeds';
import type { Article, Feed, TokenMode } from '../types';
import { PREDICTION_LINE_WIDTHS } from '../types';
import { measureTextMetrics } from '../lib/textMetrics';

type View = 'reader' | 'preview' | 'add' | 'library-settings' | 'settings';

// Check if we're in import mode (opened from bookmarklet)
function getInitialView(): View {
  const params = new URLSearchParams(window.location.search);
  return params.get('import') === '1' ? 'add' : 'reader';
}

export function App() {
  const [displaySettings, setDisplaySettings] = useState<Settings>(() => loadSettings());
  const settings = displaySettings;
  const [articles, setArticles] = useState<Article[]>(() => {
    const loaded = loadArticles();
    let needsUpdate = false;
    const migrated = loaded.map(article => {
      if (article.charCount != null && article.wordCount != null) {
        return article;
      }
      needsUpdate = true;
      const metrics = measureTextMetrics(article.content);
      return { ...article, ...metrics };
    });
    if (needsUpdate) {
      saveArticles(migrated);
      return migrated;
    }
    return loaded;
  });
  const [feeds, setFeeds] = useState<Feed[]>(() => loadFeeds());
  const [view, setView] = useState<View>(getInitialView);
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);

  const rsvp = useRSVP({
    initialWpm: settings.defaultWpm,
    initialMode: settings.defaultMode,
    initialCustomCharWidth: settings.customCharWidth,
    initialRampEnabled: settings.rampEnabled,
    rampCurve: settings.rampCurve,
    rampStartPercent: settings.rampStartPercent,
    rampRate: settings.rampRate,
    rampInterval: settings.rampInterval,
    saccadeLength: settings.saccadeLength,
    onComplete: () => {
      // Could auto-advance to next article here
    },
  });

  // Keyboard shortcuts
  useKeyboard({
    onSpace: (rsvp.displayMode === 'prediction' || rsvp.displayMode === 'recall' || rsvp.displayMode === 'training') ? undefined : rsvp.toggle,
    onLeft: rsvp.prev,
    onRight: rsvp.next,
    onBracketLeft: () => rsvp.setWpm(Math.max(100, rsvp.wpm - 10)),
    onBracketRight: () => rsvp.setWpm(Math.min(800, rsvp.wpm + 10)),
    onEscape: () => {
      if (view !== 'reader') {
        setView('reader');
      } else {
        rsvp.pause();
      }
    },
  });

  const handleAddArticle = useCallback((article: Omit<Article, 'id' | 'addedAt' | 'readPosition' | 'isRead'>) => {
    const metrics = measureTextMetrics(article.content);
    const newArticle: Article = {
      ...article,
      ...metrics,
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
      const existingUrls = new Set(articles.map(a => a.url).filter(Boolean));
      const newArticles = feedArticles.filter(a => !a.url || !existingUrls.has(a.url));
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
      const existingUrls = new Set(articles.map(a => a.url).filter(Boolean));
      const newArticles = feedArticles.filter(a => !a.url || !existingUrls.has(a.url));
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

  const handleRampEnabledChange = useCallback((enabled: boolean) => {
    rsvp.setRampEnabled(enabled);
    setDisplaySettings(prev => {
      const next = { ...prev, rampEnabled: enabled };
      saveSettings(next);
      return next;
    });
  }, [rsvp]);

  const handleAlternateColorsChange = useCallback((enabled: boolean) => {
    setDisplaySettings(prev => {
      const next = { ...prev, rsvpAlternateColors: enabled };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleShowORPChange = useCallback((enabled: boolean) => {
    setDisplaySettings(prev => {
      const next = { ...prev, rsvpShowORP: enabled };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleSaccadeShowOVPChange = useCallback((enabled: boolean) => {
    setDisplaySettings(prev => {
      const next = { ...prev, saccadeShowOVP: enabled };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleSaccadeShowSweepChange = useCallback((enabled: boolean) => {
    setDisplaySettings(prev => {
      const next = { ...prev, saccadeShowSweep: enabled };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleSaccadeLengthChange = useCallback((length: number) => {
    setDisplaySettings(prev => {
      const next = { ...prev, saccadeLength: length };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleProgressChange = useCallback((progress: number) => {
    const newIndex = Math.floor((progress / 100) * rsvp.chunks.length);
    rsvp.goToIndex(newIndex);
  }, [rsvp]);

  const remainingTime = rsvp.chunks.length > 0
    ? formatTime(calculateRemainingTime(rsvp.chunks, rsvp.currentChunkIndex, rsvp.effectiveWpm, rsvp.mode))
    : '--:--';

  const totalWords = useMemo(
    () => rsvp.chunks.reduce((sum, c) => sum + c.wordCount, 0),
    [rsvp.chunks]
  );

  const formattedWordCount = totalWords >= 1000
    ? `${(totalWords / 1000).toFixed(1).replace(/\.0$/, '')}k`
    : `${totalWords}`;

  const progress = calculateProgress(rsvp.currentChunkIndex, rsvp.chunks.length);

  return (
    <div className="app" style={{
      '--rsvp-font-size': `${displaySettings.rsvpFontSize}rem`,
      '--saccade-font-size': `${displaySettings.saccadeFontSize}rem`,
      '--prediction-font-size': `${displaySettings.predictionFontSize}rem`,
      '--prediction-line-width': `${PREDICTION_LINE_WIDTHS[displaySettings.predictionLineWidth]}ch`,
    } as React.CSSProperties}>
      <header className="app-header">
        <h1>Reader</h1>
        <button className="settings-gear-btn" onClick={() => setView('settings')} title="Display settings">&#9881;</button>
      </header>

      <main className="app-main">
        {view === 'reader' && (
          <>
            {rsvp.displayMode === 'training' && rsvp.article ? (
              <div className="training-container">
                <TrainingReader
                  article={rsvp.article}
                  initialWpm={rsvp.wpm}
                  saccadeShowOVP={displaySettings.saccadeShowOVP}
                  saccadeShowSweep={displaySettings.saccadeShowSweep}
                  saccadeLength={displaySettings.saccadeLength}
                  onClose={() => rsvp.setDisplayMode('rsvp')}
                  onWpmChange={rsvp.setWpm}
                />
              </div>
            ) : rsvp.displayMode === 'prediction' ? (
              <div className="prediction-container">
                <PredictionStats stats={rsvp.predictionStats} />
                <PredictionReader
                  chunks={rsvp.chunks}
                  currentChunkIndex={rsvp.currentChunkIndex}
                  onAdvance={rsvp.advanceSelfPaced}
                  onPredictionResult={rsvp.handlePredictionResult}
                  onReset={rsvp.resetPredictionStats}
                  onClose={() => rsvp.setDisplayMode('rsvp')}
                  stats={rsvp.predictionStats}
                  wpm={rsvp.wpm}
                  goToIndex={rsvp.goToIndex}
                  onWpmChange={rsvp.setWpm}
                />
              </div>
            ) : rsvp.displayMode === 'recall' ? (
              <div className="recall-container">
                <PredictionStats stats={rsvp.predictionStats} />
                <RecallReader
                  pages={rsvp.saccadePages}
                  chunks={rsvp.chunks}
                  currentChunkIndex={rsvp.currentChunkIndex}
                  onAdvance={rsvp.advanceSelfPaced}
                  onPredictionResult={rsvp.handlePredictionResult}
                  onReset={rsvp.resetPredictionStats}
                  onClose={() => rsvp.setDisplayMode('rsvp')}
                  stats={rsvp.predictionStats}
                  goToIndex={rsvp.goToIndex}
                />
              </div>
            ) : (
              <Reader
                chunk={rsvp.currentChunk}
                isPlaying={rsvp.isPlaying}
                displayMode={rsvp.displayMode}
                saccadePage={rsvp.currentSaccadePage}
                showPacer={rsvp.showPacer}
                wpm={rsvp.effectiveWpm}
                colorPhase={displaySettings.rsvpAlternateColors ? (rsvp.currentChunkIndex % 2 === 0 ? 'a' : 'b') : undefined}
                showORP={displaySettings.rsvpShowORP}
                saccadeShowOVP={displaySettings.saccadeShowOVP}
                saccadeShowSweep={displaySettings.saccadeShowSweep}
                saccadeLength={displaySettings.saccadeLength}
              />
            )}

            {rsvp.displayMode !== 'prediction' && rsvp.displayMode !== 'recall' && rsvp.displayMode !== 'training' && (
              <ProgressBar progress={progress} onChange={handleProgressChange} />
            )}

            <div className="article-info">
              {rsvp.article ? (
                <>
                  <span className="article-title">{rsvp.article.title}</span>
                  <span className="article-meta">
                    {rsvp.displayMode === 'training' ? (
                      `${rsvp.article.source} • Training Mode`
                    ) : rsvp.displayMode === 'prediction' || rsvp.displayMode === 'recall' ? (
                      `${rsvp.article.source} • ${rsvp.currentChunkIndex} / ${rsvp.chunks.length} words`
                    ) : (
                      `${rsvp.article.source} • ${formattedWordCount} words • ${remainingTime} remaining • ${rsvp.effectiveWpm} WPM`
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
              showPacer={rsvp.showPacer}
              linesPerPage={rsvp.linesPerPage}
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
              onShowPacerChange={rsvp.setShowPacer}
              onLinesPerPageChange={rsvp.setLinesPerPage}
              onNextPage={rsvp.nextPage}
              onPrevPage={rsvp.prevPage}
              rampEnabled={rsvp.rampEnabled}
              effectiveWpm={rsvp.effectiveWpm}
              onRampEnabledChange={handleRampEnabledChange}
              alternateColors={displaySettings.rsvpAlternateColors}
              onAlternateColorsChange={handleAlternateColorsChange}
              showORP={displaySettings.rsvpShowORP}
              onShowORPChange={handleShowORPChange}
              saccadeShowOVP={displaySettings.saccadeShowOVP}
              onSaccadeShowOVPChange={handleSaccadeShowOVPChange}
              saccadeShowSweep={displaySettings.saccadeShowSweep}
              onSaccadeShowSweepChange={handleSaccadeShowSweepChange}
              saccadeLength={displaySettings.saccadeLength}
              onSaccadeLengthChange={handleSaccadeLengthChange}
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
