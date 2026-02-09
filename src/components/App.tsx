import { useState, useCallback, useMemo, useEffect } from 'react';
import { Reader } from './Reader';
import { ReaderControls } from './ReaderControls';
import { ProgressBar } from './ProgressBar';
import { ArticlePreview } from './ArticlePreview';
import { AddContent } from './AddContent';
import { HomeScreen } from './HomeScreen';
import { ContentBrowser } from './ContentBrowser';
import { LibrarySettings } from './LibrarySettings';
import { SettingsPanel } from './SettingsPanel';
import { PredictionReader } from './PredictionReader';
import { PredictionStats } from './PredictionStats';
import { RecallReader } from './RecallReader';
import { TrainingReader } from './TrainingReader';
import { useRSVP } from '../hooks/useRSVP';
import { useKeyboard } from '../hooks/useKeyboard';
import { calculateRemainingTime, formatTime, calculateProgress } from '../lib/rsvp';
import { loadArticles, saveArticles, loadFeeds, saveFeeds, generateId, loadSettings, saveSettings, loadDailyInfo, saveDailyInfo } from '../lib/storage';
import type { Settings } from '../lib/storage';
import { fetchFeed } from '../lib/feeds';
import { fetchDailyArticle, fetchRandomFeaturedArticle, getTodayUTC } from '../lib/wikipedia';
import type { Article, Feed, TokenMode, Activity, DisplayMode } from '../types';
import { PREDICTION_LINE_WIDTHS } from '../types';
import { measureTextMetrics } from '../lib/textMetrics';
import { formatBookName } from './Library';

type ViewState =
  | { screen: 'home' }
  | { screen: 'content-browser'; activity: Activity }
  | { screen: 'preview'; activity: Activity; article: Article }
  | { screen: 'active-reader' }
  | { screen: 'active-exercise' }
  | { screen: 'active-training'; article?: Article }
  | { screen: 'settings' }
  | { screen: 'library-settings' }
  | { screen: 'add' }; // bookmarklet import

function getInitialView(): ViewState {
  const params = new URLSearchParams(window.location.search);
  return params.get('import') === '1' ? { screen: 'add' } : { screen: 'home' };
}

const ACTIVITY_LABELS: Record<Activity, string> = {
  'paced-reading': 'Paced Reading',
  'active-recall': 'Active Recall',
  'training': 'Training',
};

export function App() {
  const [displaySettings, setDisplaySettings] = useState<Settings>(() => loadSettings());
  const settings = displaySettings;
  const [articles, setArticles] = useState<Article[]>(() => {
    const loaded = loadArticles();
    let needsUpdate = false;
    const migrated = loaded.map(article => {
      let updated = article;
      if (updated.charCount == null || updated.wordCount == null) {
        needsUpdate = true;
        const metrics = measureTextMetrics(updated.content);
        updated = { ...updated, ...metrics };
      }
      if (!updated.group && (updated.source === 'Wikipedia Daily' || updated.source === 'Wikipedia Featured')) {
        needsUpdate = true;
        updated = { ...updated, group: 'Wikipedia' };
      }
      return updated;
    });
    if (needsUpdate) {
      saveArticles(migrated);
      return migrated;
    }
    return loaded;
  });

  // One-time backfill: assign groups to legacy Library articles using directory metadata
  useEffect(() => {
    if (!window.library) return;
    const PREFIX = 'Library: ';
    (async () => {
      const sources = await window.library!.getSources();
      const filenameToGroup = new Map<string, string>();
      for (const source of sources) {
        const items = await window.library!.listBooks(source.path);
        for (const item of items) {
          if (item.parentDir) {
            filenameToGroup.set(item.name, formatBookName(item.parentDir));
          }
        }
      }
      setArticles(prev => {
        let changed = false;
        const updated = prev.map(article => {
          if (article.group || !article.source.startsWith(PREFIX)) return article;
          changed = true;
          const filename = article.source.slice(PREFIX.length);
          const group = filenameToGroup.get(filename);
          return { ...article, source: 'Library', ...(group ? { group } : {}) };
        });
        if (changed) {
          saveArticles(updated);
          return updated;
        }
        return prev;
      });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [feeds, setFeeds] = useState<Feed[]>(() => loadFeeds());
  const [viewState, setViewState] = useState<ViewState>(getInitialView);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [dailyStatus, setDailyStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [randomStatus, setRandomStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [randomError, setRandomError] = useState<string | null>(null);

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
    onComplete: () => {},
  });

  const navigate = useCallback((next: ViewState) => {
    rsvp.pause();
    setViewState(next);
  }, [rsvp]);

  const goHome = useCallback(() => {
    rsvp.pause();
    setViewState({ screen: 'home' });
  }, [rsvp]);

  // Keyboard shortcuts
  const isActiveView = viewState.screen === 'active-reader' || viewState.screen === 'active-exercise' || viewState.screen === 'active-training';

  useKeyboard({
    onSpace: isActiveView && rsvp.displayMode !== 'prediction' && rsvp.displayMode !== 'recall' && rsvp.displayMode !== 'training'
      ? rsvp.toggle : undefined,
    onLeft: isActiveView ? rsvp.prev : undefined,
    onRight: isActiveView ? rsvp.next : undefined,
    onBracketLeft: isActiveView ? () => rsvp.setWpm(Math.max(100, rsvp.wpm - 10)) : undefined,
    onBracketRight: isActiveView ? () => rsvp.setWpm(Math.min(800, rsvp.wpm + 10)) : undefined,
    onEscape: () => {
      if (viewState.screen === 'home') return;
      if (isActiveView) {
        goHome();
      } else if (viewState.screen === 'content-browser' || viewState.screen === 'preview' ||
                 viewState.screen === 'settings' || viewState.screen === 'library-settings' || viewState.screen === 'add') {
        goHome();
      }
    },
  });

  // --- Article / Feed handlers (unchanged) ---

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
    // If in content-browser stay there; if bookmarklet import go home
    if (viewState.screen === 'add') {
      setViewState({ screen: 'home' });
    }
  }, [articles, viewState.screen]);

  const handleRemoveArticle = useCallback((id: string) => {
    const updated = articles.filter(a => a.id !== id);
    setArticles(updated);
    saveArticles(updated);
  }, [articles]);

  const handleAddFeed = useCallback(async (url: string) => {
    setIsLoadingFeed(true);
    try {
      const { feed, articles: feedArticles } = await fetchFeed(url);
      const updatedFeeds = [...feeds, feed];
      setFeeds(updatedFeeds);
      saveFeeds(updatedFeeds);

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
      const existingUrls = new Set(articles.map(a => a.url).filter(Boolean));
      const newArticles = feedArticles.filter(a => !a.url || !existingUrls.has(a.url));
      if (newArticles.length > 0) {
        const updatedArticles = [...articles, ...newArticles];
        setArticles(updatedArticles);
        saveArticles(updatedArticles);
      }
      const updatedFeeds = feeds.map(f =>
        f.id === feed.id ? { ...f, lastFetched: Date.now() } : f
      );
      setFeeds(updatedFeeds);
      saveFeeds(updatedFeeds);
    } finally {
      setIsLoadingFeed(false);
    }
  }, [feeds, articles]);

  // --- Settings handlers (unchanged) ---

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

  // --- Navigation handlers ---

  const saveLastSession = useCallback((articleId: string, activity: Activity, displayMode: DisplayMode) => {
    setDisplaySettings(prev => {
      const next = { ...prev, lastSession: { articleId, activity, displayMode } };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleSelectActivity = useCallback((activity: Activity) => {
    navigate({ screen: 'content-browser', activity });
  }, [navigate]);

  const handleStartDrill = useCallback(() => {
    navigate({ screen: 'active-training' });
  }, [navigate]);

  const handleStartDaily = useCallback(async () => {
    const today = getTodayUTC();

    // Check if we already fetched today's article
    const daily = loadDailyInfo();
    if (daily && daily.date === today) {
      const existing = articles.find(a => a.id === daily.articleId);
      if (existing) {
        rsvp.loadArticle(existing, { displayMode: 'saccade' });
        saveLastSession(existing.id, 'paced-reading', 'saccade');
        setViewState({ screen: 'active-reader' });
        setTimeout(() => rsvp.play(), 100);
        return;
      }
    }

    setDailyStatus('loading');
    setDailyError(null);
    try {
      const { title, content, url } = await fetchDailyArticle();

      // Deduplicate by URL
      const existing = articles.find(a => a.url === url);
      let article: Article;
      if (existing) {
        article = existing;
      } else {
        const metrics = measureTextMetrics(content);
        article = {
          id: generateId(),
          title,
          content,
          source: 'Wikipedia Daily',
          url,
          addedAt: Date.now(),
          readPosition: 0,
          isRead: false,
          group: 'Wikipedia',
          ...metrics,
        };
        const updated = [...articles, article];
        setArticles(updated);
        saveArticles(updated);
      }

      saveDailyInfo(today, article.id);
      rsvp.loadArticle(article, { displayMode: 'saccade' });
      saveLastSession(article.id, 'paced-reading', 'saccade');
      setDailyStatus('idle');
      setViewState({ screen: 'active-reader' });
      setTimeout(() => rsvp.play(), 100);
    } catch (err) {
      setDailyStatus('error');
      setDailyError(err instanceof Error ? err.message : 'Failed to fetch daily article');
    }
  }, [articles, rsvp, saveLastSession]);

  const handleStartRandom = useCallback(async () => {
    setRandomStatus('loading');
    setRandomError(null);
    try {
      const { title, content, url } = await fetchRandomFeaturedArticle();

      // Deduplicate by URL
      const existing = articles.find(a => a.url === url);
      let article: Article;
      if (existing) {
        article = existing;
      } else {
        const metrics = measureTextMetrics(content);
        article = {
          id: generateId(),
          title,
          content,
          source: 'Wikipedia Featured',
          url,
          addedAt: Date.now(),
          readPosition: 0,
          isRead: false,
          group: 'Wikipedia',
          ...metrics,
        };
        const updated = [...articles, article];
        setArticles(updated);
        saveArticles(updated);
      }

      rsvp.loadArticle(article, { displayMode: 'saccade' });
      saveLastSession(article.id, 'paced-reading', 'saccade');
      setRandomStatus('idle');
      setViewState({ screen: 'active-reader' });
      setTimeout(() => rsvp.play(), 100);
    } catch (err) {
      setRandomStatus('error');
      setRandomError(err instanceof Error ? err.message : 'Failed to fetch article');
    }
  }, [articles, rsvp, saveLastSession]);

  // Content browser → article selected → preview
  const handleContentBrowserSelectArticle = useCallback((article: Article) => {
    if (viewState.screen === 'content-browser') {
      const activity = viewState.activity;
      if (activity === 'training') {
        // Training skips preview, goes directly to training setup
        navigate({ screen: 'active-training', article });
        return;
      }
      navigate({ screen: 'preview', activity, article });
    }
  }, [viewState, navigate]);

  // Preview → start reading
  const handleStartReading = useCallback((article: Article, wpm: number, mode: TokenMode) => {
    if (viewState.screen !== 'preview') return;
    const activity = viewState.activity;

    rsvp.setWpm(wpm);

    if (activity === 'paced-reading') {
      rsvp.loadArticle(article, { mode, displayMode: 'rsvp' });
      saveLastSession(article.id, 'paced-reading', 'rsvp');
      setViewState({ screen: 'active-reader' });
      setTimeout(() => rsvp.play(), 100);
    } else if (activity === 'active-recall') {
      rsvp.loadArticle(article, { displayMode: 'prediction' });
      saveLastSession(article.id, 'active-recall', 'prediction');
      setViewState({ screen: 'active-exercise' });
    }
  }, [rsvp, viewState, saveLastSession]);

  // Continue from home screen
  const continueInfo = useMemo(() => {
    const session = settings.lastSession;
    if (!session) return null;
    const article = articles.find(a => a.id === session.articleId);
    if (!article) return null;
    return { article, activity: session.activity, displayMode: session.displayMode };
  }, [settings.lastSession, articles]);

  const handleContinue = useCallback((info: { article: Article; activity: Activity; displayMode: DisplayMode }) => {
    rsvp.loadArticle(info.article, { displayMode: info.displayMode });

    if (info.activity === 'paced-reading') {
      setViewState({ screen: 'active-reader' });
      setTimeout(() => rsvp.play(), 100);
    } else if (info.activity === 'active-recall') {
      setViewState({ screen: 'active-exercise' });
    } else if (info.activity === 'training') {
      setViewState({ screen: 'active-training', article: info.article });
    }
  }, [rsvp]);

  // --- Computed values ---

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

  // Header title based on view
  const headerTitle = (() => {
    switch (viewState.screen) {
      case 'active-reader': return 'Paced Reading';
      case 'active-exercise': return 'Active Recall';
      case 'active-training': return 'Training';
      case 'content-browser': return ACTIVITY_LABELS[viewState.activity];
      case 'preview': return ACTIVITY_LABELS[viewState.activity];
      case 'settings': return 'Settings';
      case 'library-settings': return 'Library Settings';
      default: return 'Reader';
    }
  })();

  const showBackButton = viewState.screen !== 'home';

  // --- Render helpers ---

  const renderReaderControls = (allowedModes: DisplayMode[]) => (
    <ReaderControls
      isPlaying={rsvp.isPlaying}
      wpm={rsvp.wpm}
      mode={rsvp.mode}
      displayMode={rsvp.displayMode}
      allowedDisplayModes={allowedModes}
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
  );

  const renderArticleInfo = () => (
    <div className="article-info">
      {rsvp.article ? (
        <>
          <span className="article-title">{rsvp.article.title}</span>
          <span className="article-meta">
            {rsvp.displayMode === 'prediction' || rsvp.displayMode === 'recall' ? (
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
  );

  return (
    <div className="app" style={{
      '--rsvp-font-size': `${displaySettings.rsvpFontSize}rem`,
      '--saccade-font-size': `${displaySettings.saccadeFontSize}rem`,
      '--prediction-font-size': `${displaySettings.predictionFontSize}rem`,
      '--prediction-line-width': `${PREDICTION_LINE_WIDTHS[displaySettings.predictionLineWidth]}ch`,
    } as React.CSSProperties}>
      <header className="app-header">
        <div className="app-header-left">
          {showBackButton && (
            <button className="control-btn app-back-btn" onClick={goHome}>Home</button>
          )}
          <h1>{headerTitle}</h1>
        </div>
        <button className="settings-gear-btn" onClick={() => navigate({ screen: 'settings' })} title="Display settings">&#9881;</button>
      </header>

      <main className="app-main">
        {/* Home Screen */}
        {viewState.screen === 'home' && (
          <HomeScreen
            onSelectActivity={handleSelectActivity}
            onContinue={handleContinue}
            onStartDrill={handleStartDrill}
            onStartDaily={handleStartDaily}
            dailyStatus={dailyStatus}
            dailyError={dailyError}
            onStartRandom={handleStartRandom}
            randomStatus={randomStatus}
            randomError={randomError}
            continueInfo={continueInfo}
          />
        )}

        {/* Content Browser */}
        {viewState.screen === 'content-browser' && (
          <ContentBrowser
            activity={viewState.activity}
            articles={articles}
            currentArticleId={rsvp.article?.id}
            feeds={feeds}
            isLoadingFeed={isLoadingFeed}
            onSelectArticle={handleContentBrowserSelectArticle}
            onRemoveArticle={handleRemoveArticle}
            onAddArticle={handleAddArticle}
            onAddFeed={handleAddFeed}
            onRemoveFeed={handleRemoveFeed}
            onRefreshFeed={handleRefreshFeed}
            onOpenLibrarySettings={() => navigate({ screen: 'library-settings' })}
            onBack={goHome}
          />
        )}

        {/* Article Preview */}
        {viewState.screen === 'preview' && (
          <ArticlePreview
            article={viewState.article}
            initialWpm={rsvp.wpm}
            initialMode={rsvp.mode}
            onStart={handleStartReading}
            onClose={() => navigate({ screen: 'content-browser', activity: viewState.activity })}
          />
        )}

        {/* Paced Reading: RSVP / Saccade */}
        {viewState.screen === 'active-reader' && (
          <>
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
            <ProgressBar progress={progress} onChange={handleProgressChange} />
            {renderArticleInfo()}
            {renderReaderControls(['rsvp', 'saccade'])}
          </>
        )}

        {/* Active Recall: Prediction / Recall */}
        {viewState.screen === 'active-exercise' && (
          <>
            {rsvp.displayMode === 'recall' ? (
              <div className="recall-container">
                <PredictionStats stats={rsvp.predictionStats} />
                <RecallReader
                  pages={rsvp.saccadePages}
                  chunks={rsvp.chunks}
                  currentChunkIndex={rsvp.currentChunkIndex}
                  onAdvance={rsvp.advanceSelfPaced}
                  onPredictionResult={rsvp.handlePredictionResult}
                  onReset={rsvp.resetPredictionStats}
                  onClose={goHome}
                  stats={rsvp.predictionStats}
                  goToIndex={rsvp.goToIndex}
                />
              </div>
            ) : (
              <div className="prediction-container">
                <PredictionStats stats={rsvp.predictionStats} />
                <PredictionReader
                  chunks={rsvp.chunks}
                  currentChunkIndex={rsvp.currentChunkIndex}
                  onAdvance={rsvp.advanceSelfPaced}
                  onPredictionResult={rsvp.handlePredictionResult}
                  onReset={rsvp.resetPredictionStats}
                  onClose={goHome}
                  stats={rsvp.predictionStats}
                  wpm={rsvp.wpm}
                  goToIndex={rsvp.goToIndex}
                  onWpmChange={rsvp.setWpm}
                />
              </div>
            )}
            {renderReaderControls(['prediction', 'recall'])}
          </>
        )}

        {/* Training */}
        {viewState.screen === 'active-training' && (
          <div className="training-container">
            <TrainingReader
              article={viewState.article}
              initialWpm={rsvp.wpm}
              saccadeShowOVP={displaySettings.saccadeShowOVP}
              saccadeShowSweep={displaySettings.saccadeShowSweep}
              saccadeLength={displaySettings.saccadeLength}
              onClose={goHome}
              onWpmChange={rsvp.setWpm}
              onSelectArticle={() => navigate({ screen: 'content-browser', activity: 'training' })}
            />
          </div>
        )}

        {/* Bookmarklet import */}
        {viewState.screen === 'add' && (
          <AddContent
            onAdd={handleAddArticle}
            onClose={goHome}
          />
        )}

        {/* Settings */}
        {viewState.screen === 'settings' && (
          <SettingsPanel
            settings={displaySettings}
            onSettingsChange={handleSettingsChange}
            onClose={goHome}
          />
        )}

        {viewState.screen === 'library-settings' && (
          <LibrarySettings onClose={goHome} />
        )}
      </main>
    </div>
  );
}
