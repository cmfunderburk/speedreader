import { useState, useReducer, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { ComprehensionCheck } from './ComprehensionCheck';
import { ComprehensionCheckBoundary } from './ComprehensionCheckBoundary';
import { ComprehensionExamBuilder } from './ComprehensionExamBuilder';
import { useRSVP } from '../hooks/useRSVP';
import { useKeyboard } from '../hooks/useKeyboard';
import { calculateRemainingTime, formatTime, calculateProgress } from '../lib/rsvp';
import {
  loadArticles,
  saveArticles,
  loadFeeds,
  saveFeeds,
  generateId,
  loadSettings,
  saveSettings,
  loadDailyInfo,
  saveDailyInfo,
  loadPassages,
  upsertPassage,
  updatePassageReviewState,
  touchPassageReview,
  loadSessionSnapshot,
  saveSessionSnapshot,
  clearSessionSnapshot,
  loadComprehensionAttempts,
  getComprehensionApiKeyStorageMode,
  loadPreferredComprehensionApiKey,
  savePreferredComprehensionApiKey,
} from '../lib/storage';
import type { ComprehensionApiKeyStorageMode, Settings } from '../lib/storage';
import { fetchFeed } from '../lib/feeds';
import {
  fetchDailyArticle,
  fetchRandomFeaturedArticle,
  getTodayUTC,
  isWikipediaSource,
  normalizeWikipediaContentForReader,
} from '../lib/wikipedia';
import type {
  Article,
  Feed,
  TokenMode,
  Activity,
  DisplayMode,
  SaccadePacerStyle,
  SaccadeFocusTarget,
  Passage,
  PassageCaptureKind,
  PassageReviewMode,
  PassageReviewState,
  ThemePreference,
  ComprehensionAttempt,
} from '../types';
import { PREDICTION_LINE_WIDTHS } from '../types';
import { measureTextMetrics } from '../lib/textMetrics';
import { formatBookName } from '../lib/libraryFormatting';
import {
  appViewStateReducer,
  getInitialViewState,
  viewStateToAction,
  type ComprehensionBuilderState,
} from '../lib/appViewState';
import {
  planCloseActiveExercise,
  planContinueSession,
  planFeaturedArticleLaunch,
  planStartReadingFromPreview,
} from '../lib/sessionTransitions';
import {
  getHeaderBackAction,
  getActiveWpmActivity,
  getHeaderTitle,
  isActiveView,
  planContentBrowserArticleSelection,
  resolveContinueSessionInfo,
  shouldShowBackButton,
} from '../lib/appViewSelectors';
import type { ViewState } from '../lib/appViewState';
import { planEscapeAction } from '../lib/appKeyboard';
import { buildPassageReviewLaunchPlan } from '../lib/passageReviewLaunch';
import {
  getFeaturedFetchErrorMessage,
  planFeaturedFetchResult,
  resolveDailyFeaturedArticle,
} from '../lib/featuredArticleLaunch';
import { buildPassageReviewQueue } from '../lib/passageQueue';
import {
  normalizeCaptureLineText,
  planLastLinesCapture,
  planParagraphCapture,
  planSentenceCapture,
} from '../lib/passageCapture';
import {
  appendFeed,
  mergeFeedArticles,
  updateFeedLastFetched,
} from '../lib/appFeedTransitions';
import { createComprehensionAdapter } from '../lib/comprehensionAdapter';

const PASSAGE_CAPTURE_LAST_LINE_COUNT = 3;
const MIN_WPM = 100;
const MAX_WPM = 800;

function clipPassagePreview(text: string, maxChars: number = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}...`;
}

function resolveThemePreference(themePreference: ThemePreference, systemTheme: 'dark' | 'light'): 'dark' | 'light' {
  if (themePreference === 'system') return systemTheme;
  return themePreference;
}

function clampWpm(value: number): number {
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(value)));
}

function captureKindLabel(captureKind: PassageCaptureKind): string {
  switch (captureKind) {
    case 'sentence':
      return 'sentence';
    case 'paragraph':
      return 'paragraph';
    case 'last-lines':
      return 'lines';
    case 'line':
    default:
      return 'line';
  }
}

export function App() {
  const [displaySettings, setDisplaySettings] = useState<Settings>(() => loadSettings());
  const settings = displaySettings;
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() => {
    if (!window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [articles, setArticles] = useState<Article[]>(() => {
    const loaded = loadArticles();
    let needsUpdate = false;
    const migrated = loaded.map(article => {
      let updated = article;
      if (isWikipediaSource(updated.source)) {
        const normalized = normalizeWikipediaContentForReader(updated.content);
        if (normalized && normalized !== updated.content) {
          needsUpdate = true;
          const metrics = measureTextMetrics(normalized);
          updated = { ...updated, content: normalized, ...metrics };
        }
      }
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
    let cancelled = false;

    (async () => {
      const sources = await window.library!.getSources();
      const filenameToGroup = new Map<string, string>();
      const listResults = await Promise.allSettled(
        sources.map((source) => window.library!.listBooks(source.path))
      );

      if (cancelled) return;

      listResults.forEach((result, index) => {
        if (result.status !== 'fulfilled') {
          const source = sources[index];
          console.warn(`Failed to backfill Library groups for source: ${source?.name ?? source?.path ?? 'unknown'}`, result.reason);
          return;
        }

        for (const item of result.value) {
          if (!item.parentDir) continue;
          filenameToGroup.set(item.name, formatBookName(item.parentDir));
        }
      });

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
    })().catch((err) => {
      if (cancelled) return;
      console.warn('Library group backfill failed', err);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const [feeds, setFeeds] = useState<Feed[]>(() => loadFeeds());
  const articlesRef = useRef<Article[]>(articles);
  const [viewState, dispatchViewState] = useReducer(
    appViewStateReducer,
    window.location.search,
    getInitialViewState
  );
  const setViewState = useCallback((next: ViewState) => {
    dispatchViewState(viewStateToAction(next));
  }, []);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [dailyStatus, setDailyStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [randomStatus, setRandomStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [randomError, setRandomError] = useState<string | null>(null);
  const [passages, setPassages] = useState<Passage[]>(() => loadPassages());
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [isPassageWorkspaceOpen, setIsPassageWorkspaceOpen] = useState(false);
  const [comprehensionApiKey, setComprehensionApiKey] = useState<string>('');
  const [comprehensionApiKeyStorageMode, setComprehensionApiKeyStorageMode] = useState<ComprehensionApiKeyStorageMode>('local');
  const [comprehensionAttempts, setComprehensionAttempts] = useState<ComprehensionAttempt[]>(() => loadComprehensionAttempts());
  const comprehensionAdapter = useMemo(() => {
    return createComprehensionAdapter({
      apiKey: comprehensionApiKey || undefined,
      model: settings.comprehensionGeminiModel,
    });
  }, [comprehensionApiKey, settings.comprehensionGeminiModel]);

  const resolvedTheme = useMemo(
    () => resolveThemePreference(displaySettings.themePreference, systemTheme),
    [displaySettings.themePreference, systemTheme]
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storageMode, apiKey] = await Promise.all([
        getComprehensionApiKeyStorageMode(),
        loadPreferredComprehensionApiKey(),
      ]);
      if (cancelled) return;
      setComprehensionApiKeyStorageMode(storageMode);
      setComprehensionApiKey(apiKey ?? '');
    })().catch((err) => {
      console.error('Failed to initialize comprehension API key storage', err);
      if (cancelled) return;
      setComprehensionApiKeyStorageMode('unavailable');
      setComprehensionApiKey('');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const rsvp = useRSVP({
    initialWpm: settings.wpmByActivity['paced-reading'],
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

  const getActivityWpm = useCallback((activity: Activity): number => {
    return settings.wpmByActivity[activity] ?? settings.defaultWpm;
  }, [settings.defaultWpm, settings.wpmByActivity]);

  const setActivityWpm = useCallback((activity: Activity, nextWpm: number) => {
    const clamped = clampWpm(nextWpm);
    rsvp.setWpm(clamped);
    setDisplaySettings(prev => {
      const next: Settings = {
        ...prev,
        wpmByActivity: {
          ...prev.wpmByActivity,
          [activity]: clamped,
        },
      };
      if (activity === 'paced-reading') {
        next.defaultWpm = clamped;
      }
      saveSettings(next);
      return next;
    });
  }, [rsvp]);

  const syncWpmForActivity = useCallback((activity: Activity) => {
    rsvp.setWpm(getActivityWpm(activity));
  }, [getActivityWpm, rsvp]);

  const navigate = useCallback((next: ViewState) => {
    rsvp.pause();
    setViewState(next);
  }, [rsvp, setViewState]);

  const goHome = useCallback(() => {
    rsvp.pause();
    setViewState({ screen: 'home' });
  }, [rsvp, setViewState]);

  const closeActiveExercise = useCallback(() => {
    const snapshot = loadSessionSnapshot();
    const closePlan = planCloseActiveExercise(snapshot, articles, Date.now());

    if (closePlan.type === 'resume-reading') {
      syncWpmForActivity('paced-reading');
      rsvp.loadArticle(closePlan.plan.article, { displayMode: closePlan.plan.displayMode });
      setViewState({ screen: 'active-reader' });
      window.setTimeout(() => {
        rsvp.goToIndex(closePlan.plan.chunkIndex);
      }, 0);
      saveSessionSnapshot(closePlan.plan.snapshot);
      return;
    }

    if (closePlan.clearSnapshot) {
      clearSessionSnapshot();
    }

    goHome();
  }, [articles, goHome, rsvp, setViewState, syncWpmForActivity]);

  const closeActiveComprehension = useCallback(() => {
    if (viewState.screen !== 'active-comprehension') {
      goHome();
      return;
    }

    if (viewState.entryPoint === 'post-reading') {
      setViewState({ screen: 'active-reader' });
      return;
    }

    goHome();
  }, [goHome, setViewState, viewState]);

  // Keyboard shortcuts
  const activeView = isActiveView(viewState);
  const activeWpmActivity: Activity | null = getActiveWpmActivity(viewState);

  useKeyboard({
    onSpace: activeView && rsvp.displayMode !== 'prediction' && rsvp.displayMode !== 'recall' && rsvp.displayMode !== 'training'
      ? rsvp.toggle : undefined,
    onLeft: activeView ? rsvp.prev : undefined,
    onRight: activeView ? rsvp.next : undefined,
    onBracketLeft: activeView && activeWpmActivity
      ? () => setActivityWpm(activeWpmActivity, rsvp.wpm - 10)
      : undefined,
    onBracketRight: activeView && activeWpmActivity
      ? () => setActivityWpm(activeWpmActivity, rsvp.wpm + 10)
      : undefined,
    onEscape: () => {
      const escapeAction = planEscapeAction(viewState);
      if (escapeAction === 'close-active-exercise') {
        closeActiveExercise();
      } else if (escapeAction === 'close-active-comprehension') {
        closeActiveComprehension();
      } else if (escapeAction === 'go-home') {
        goHome();
      }
    },
  });

  useEffect(() => {
    if (!captureNotice) return;
    const timer = window.setTimeout(() => setCaptureNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [captureNotice]);

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
    // If in content-browser stay there; if launched from add screen go home
    if (viewState.screen === 'add') {
      setViewState({ screen: 'home' });
    }
  }, [articles, setViewState, viewState.screen]);

  const handleRemoveArticle = useCallback((id: string) => {
    const updated = articles.filter(a => a.id !== id);
    setArticles(updated);
    saveArticles(updated);
  }, [articles]);

  const handleAddFeed = useCallback(async (url: string) => {
    setIsLoadingFeed(true);
    try {
      const { feed, articles: feedArticles } = await fetchFeed(url);
      setFeeds((prevFeeds) => {
        const nextFeeds = appendFeed(prevFeeds, feed);
        saveFeeds(nextFeeds);
        return nextFeeds;
      });
      setArticles((prevArticles) => {
        const articlePlan = mergeFeedArticles(prevArticles, feedArticles);
        if (articlePlan.addedArticleCount === 0) return prevArticles;
        saveArticles(articlePlan.nextArticles);
        return articlePlan.nextArticles;
      });
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  const handleRemoveFeed = useCallback((id: string) => {
    const updated = feeds.filter(f => f.id !== id);
    setFeeds(updated);
    saveFeeds(updated);
  }, [feeds]);

  const handleRefreshFeed = useCallback(async (feed: Feed) => {
    setIsLoadingFeed(true);
    try {
      const { articles: feedArticles } = await fetchFeed(feed.url);
      setArticles((prevArticles) => {
        const articlePlan = mergeFeedArticles(prevArticles, feedArticles);
        if (articlePlan.addedArticleCount === 0) return prevArticles;
        saveArticles(articlePlan.nextArticles);
        return articlePlan.nextArticles;
      });
      setFeeds((prevFeeds) => {
        const feedPlan = updateFeedLastFetched(prevFeeds, feed.id, Date.now());
        if (!feedPlan.changed) return prevFeeds;
        saveFeeds(feedPlan.nextFeeds);
        return feedPlan.nextFeeds;
      });
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  // --- Settings handlers (unchanged) ---

  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setDisplaySettings(newSettings);
    saveSettings(newSettings);
  }, []);

  const handleComprehensionApiKeyChange = useCallback(async (apiKey: string) => {
    const normalizedApiKey = apiKey.trim();
    await savePreferredComprehensionApiKey(normalizedApiKey);
    setComprehensionApiKey(normalizedApiKey);
    setComprehensionApiKeyStorageMode(await getComprehensionApiKeyStorageMode());
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

  const handleSaccadePacerStyleChange = useCallback((style: SaccadePacerStyle) => {
    setDisplaySettings(prev => {
      const next = { ...prev, saccadePacerStyle: style, saccadeShowSweep: style === 'sweep' };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleSaccadeFocusTargetChange = useCallback((target: SaccadeFocusTarget) => {
    setDisplaySettings(prev => {
      const next = { ...prev, saccadeFocusTarget: target };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleSaccadeMergeShortFunctionWordsChange = useCallback((enabled: boolean) => {
    setDisplaySettings(prev => {
      const next = { ...prev, saccadeMergeShortFunctionWords: enabled };
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

  const flatSaccadeLines = useMemo(() => {
    const chunkIndexByLineKey = new Map<string, number>();
    for (let i = 0; i < rsvp.chunks.length; i++) {
      const sac = rsvp.chunks[i].saccade;
      if (!sac) continue;
      const key = `${sac.pageIndex}:${sac.lineIndex}`;
      if (!chunkIndexByLineKey.has(key)) {
        chunkIndexByLineKey.set(key, i);
      }
    }

    return rsvp.saccadePages.flatMap((page, pageIndex) =>
      page.lines.map((line, lineIndex) => {
        const key = `${pageIndex}:${lineIndex}`;
        const chunkIndex = chunkIndexByLineKey.get(key);
        return {
          globalLineIndex: 0, // backfilled below
          pageIndex,
          lineIndex,
          type: line.type,
          text: line.text,
          chunkIndex,
        };
      })
    ).map((line, idx) => ({ ...line, globalLineIndex: idx }));
  }, [rsvp.chunks, rsvp.saccadePages]);

  const currentSaccadeCaptureContext = useMemo(() => {
    if (rsvp.displayMode !== 'saccade') return null;
    if (!rsvp.article || !rsvp.currentChunk?.saccade) return null;

    const currentSac = rsvp.currentChunk.saccade;
    const globalLineIndex = flatSaccadeLines.findIndex((line) =>
      line.pageIndex === currentSac.pageIndex && line.lineIndex === currentSac.lineIndex
    );
    if (globalLineIndex < 0) return null;

    const line = flatSaccadeLines[globalLineIndex];
    if (!line || line.type === 'blank' || normalizeCaptureLineText(line.text).length === 0) return null;

    return {
      article: rsvp.article,
      pageIndex: currentSac.pageIndex,
      lineIndex: currentSac.lineIndex,
      globalLineIndex,
      currentChunkIndex: rsvp.currentChunkIndex,
    };
  }, [flatSaccadeLines, rsvp.article, rsvp.currentChunk, rsvp.currentChunkIndex, rsvp.displayMode]);

  const capturePassageFromLines = useCallback((
    captureKind: PassageCaptureKind,
    selectedLines: Array<{
      pageIndex: number;
      lineIndex: number;
      text: string;
      type: string;
      chunkIndex?: number;
    }>,
    textOverride?: string
  ): Passage | null => {
    const ctx = currentSaccadeCaptureContext;
    if (!ctx) return null;

    const lines = selectedLines
      .filter((line) => line.type !== 'blank')
      .map((line) => ({
        ...line,
        text: normalizeCaptureLineText(line.text),
      }))
      .filter((line) => line.text.length > 0);
    if (lines.length === 0 && !textOverride) return null;

    const joinedText = captureKind === 'last-lines'
      ? lines.map((line) => line.text).join('\n')
      : lines.map((line) => line.text).join(' ');
    const text = (textOverride ?? joinedText).trim();
    if (!text) return null;

    const now = Date.now();
    const firstLine = lines[0];
    const passage: Passage = {
      id: generateId(),
      articleId: ctx.article.id,
      articleTitle: ctx.article.title,
      sourceMode: 'saccade',
      captureKind,
      text,
      createdAt: now,
      updatedAt: now,
      sourceChunkIndex: firstLine?.chunkIndex ?? ctx.currentChunkIndex,
      sourcePageIndex: firstLine?.pageIndex ?? ctx.pageIndex,
      sourceLineIndex: firstLine?.lineIndex ?? ctx.lineIndex,
      reviewState: 'new',
      reviewCount: 0,
    };

    upsertPassage(passage);
    setPassages((prev) => [passage, ...prev.filter((existing) => existing.id !== passage.id)]);
    setCaptureNotice(`Saved ${captureKindLabel(captureKind)} to passage queue`);
    return passage;
  }, [currentSaccadeCaptureContext]);

  const handleCaptureSentence = useCallback(() => {
    const ctx = currentSaccadeCaptureContext;
    if (!ctx) return;
    const sentencePlan = planSentenceCapture(flatSaccadeLines, ctx.globalLineIndex);
    if (!sentencePlan) return;
    capturePassageFromLines('sentence', sentencePlan.sentenceLines, sentencePlan.sentenceText);
  }, [capturePassageFromLines, currentSaccadeCaptureContext, flatSaccadeLines]);

  const handleCaptureParagraph = useCallback(() => {
    const ctx = currentSaccadeCaptureContext;
    if (!ctx) return;
    const paragraphLines = planParagraphCapture(flatSaccadeLines, ctx.globalLineIndex);
    if (!paragraphLines) return;
    capturePassageFromLines('paragraph', paragraphLines);
  }, [capturePassageFromLines, currentSaccadeCaptureContext, flatSaccadeLines]);

  const handleCaptureLastLines = useCallback(() => {
    const ctx = currentSaccadeCaptureContext;
    if (!ctx) return;
    const selected = planLastLinesCapture(flatSaccadeLines, ctx.globalLineIndex, PASSAGE_CAPTURE_LAST_LINE_COUNT);
    capturePassageFromLines('last-lines', selected);
  }, [capturePassageFromLines, currentSaccadeCaptureContext, flatSaccadeLines]);

  const reviewQueue = useMemo(() => {
    return buildPassageReviewQueue(passages);
  }, [passages]);

  useEffect(() => {
    if (reviewQueue.length === 0 && isPassageWorkspaceOpen) {
      setIsPassageWorkspaceOpen(false);
    }
  }, [isPassageWorkspaceOpen, reviewQueue.length]);

  useEffect(() => {
    if (activePassageId && !reviewQueue.some((passage) => passage.id === activePassageId)) {
      setActivePassageId(null);
    }
  }, [activePassageId, reviewQueue]);

  const refreshPassagesFromStorage = useCallback(() => {
    setPassages(loadPassages());
  }, []);

  const markPassageReviewState = useCallback((passageId: string, reviewState: PassageReviewState) => {
    updatePassageReviewState(passageId, reviewState);
    refreshPassagesFromStorage();
  }, [refreshPassagesFromStorage]);

  const startPassageReview = useCallback((passage: Passage, mode: PassageReviewMode) => {
    const sourceArticle = articles.find((article) => article.id === passage.articleId);
    const currentReading = rsvp.article ? {
      articleId: rsvp.article.id,
      chunkIndex: rsvp.currentChunkIndex,
      displayMode: rsvp.displayMode,
    } : undefined;
    const launchPlan = buildPassageReviewLaunchPlan({
      passage,
      mode,
      now: Date.now(),
      currentReading,
      sourceArticle,
    });

    saveSessionSnapshot(launchPlan.snapshot);

    touchPassageReview(passage.id, mode);
    setActivePassageId(passage.id);
    refreshPassagesFromStorage();
    setIsPassageWorkspaceOpen(false);
    syncWpmForActivity('active-recall');

    rsvp.pause();
    rsvp.loadArticle(launchPlan.article, { displayMode: launchPlan.displayMode });
    setViewState({ screen: 'active-exercise' });
  }, [articles, refreshPassagesFromStorage, rsvp, setViewState, syncWpmForActivity]);

  // --- Navigation handlers ---

  const saveLastSession = useCallback((articleId: string, activity: Activity, displayMode: DisplayMode) => {
    setDisplaySettings(prev => {
      const next = { ...prev, lastSession: { articleId, activity, displayMode } };
      saveSettings(next);
      return next;
    });
  }, []);

  const applySessionLaunchPlan = useCallback((plan: ReturnType<typeof planContinueSession>) => {
    if (plan.clearSnapshot) {
      clearSessionSnapshot();
    }
    syncWpmForActivity(plan.syncWpmActivity);
    rsvp.loadArticle(plan.article, plan.loadOptions);
    if (plan.saveLastSession) {
      saveLastSession(
        plan.saveLastSession.articleId,
        plan.saveLastSession.activity,
        plan.saveLastSession.displayMode
      );
    }
    setViewState(plan.nextView);
    if (plan.autoPlay) {
      setTimeout(() => rsvp.play(), 100);
    }
  }, [rsvp, saveLastSession, setViewState, syncWpmForActivity]);

  const handleSelectActivity = useCallback((activity: Activity) => {
    syncWpmForActivity(activity);
    navigate({ screen: 'content-browser', activity });
  }, [navigate, syncWpmForActivity]);

  const handleStartDrill = useCallback(() => {
    syncWpmForActivity('training');
    navigate({ screen: 'active-training' });
  }, [navigate, syncWpmForActivity]);

  const handleStartComprehensionFromReading = useCallback(() => {
    if (!rsvp.article) return;
    rsvp.pause();
    setViewState({
      screen: 'active-comprehension',
      article: rsvp.article,
      entryPoint: 'post-reading',
      comprehension: {
        runMode: 'quick-check',
        sourceArticleIds: [rsvp.article.id],
      },
    });
  }, [rsvp, setViewState]);

  const handleStartComprehensionBuilder = useCallback(() => {
    setViewState({ screen: 'comprehension-builder' });
  }, [setViewState]);

  const handleLaunchComprehensionBuilder = useCallback((builderState: ComprehensionBuilderState) => {
    const articleById = new Map(articles.map((article) => [article.id, article]));
    const resolvedSourceArticles = builderState.sourceArticleIds
      .map((articleId) => articleById.get(articleId))
      .filter((article): article is Article => article !== undefined);
    if (resolvedSourceArticles.length === 0) {
      setViewState({ screen: 'home' });
      return;
    }

    setViewState({
      screen: 'active-comprehension',
      article: resolvedSourceArticles[0],
      entryPoint: 'launcher',
      comprehension: {
        runMode: 'exam',
        sourceArticleIds: resolvedSourceArticles.map((article) => article.id),
        examPreset: builderState.preset,
        difficultyTarget: builderState.difficultyTarget,
        openBookSynthesis: builderState.openBookSynthesis,
      },
    });
  }, [articles, setViewState]);

  const handleComprehensionAttemptSaved = useCallback((attempt: ComprehensionAttempt) => {
    setComprehensionAttempts((existing) => [attempt, ...existing].slice(0, 200));
  }, []);

  const launchFeaturedArticle = useCallback(async ({
    fetchArticle,
    source,
    setStatus,
    setError,
    fallbackError,
    today,
  }: {
    fetchArticle: () => Promise<{ title: string; content: string; url: string }>;
    source: 'Wikipedia Daily' | 'Wikipedia Featured';
    setStatus: (status: 'idle' | 'loading' | 'error') => void;
    setError: (message: string | null) => void;
    fallbackError: string;
    today?: string;
  }) => {
    setStatus('loading');
    setError(null);

    try {
      const { title, content, url } = await fetchArticle();
      const resultPlan = planFeaturedFetchResult({
        existingArticles: articlesRef.current,
        payload: { title, content, url },
        source,
        now: Date.now(),
        generateId,
        today,
      });
      if (resultPlan.upserted.changed) {
        articlesRef.current = resultPlan.upserted.articles;
        setArticles(resultPlan.upserted.articles);
        saveArticles(resultPlan.upserted.articles);
      }
      const article = resultPlan.upserted.article;

      if (resultPlan.dailyInfo) {
        saveDailyInfo(resultPlan.dailyInfo.date, resultPlan.dailyInfo.articleId);
      }
      setStatus('idle');
      applySessionLaunchPlan(planFeaturedArticleLaunch(article));
    } catch (err) {
      setStatus('error');
      setError(getFeaturedFetchErrorMessage(err, fallbackError));
    }
  }, [applySessionLaunchPlan]);

  const handleStartDaily = useCallback(async () => {
    const today = getTodayUTC();

    // Check if we already fetched today's article
    const cachedDaily = resolveDailyFeaturedArticle(today, loadDailyInfo(), articlesRef.current);
    if (cachedDaily) {
      applySessionLaunchPlan(planFeaturedArticleLaunch(cachedDaily));
      return;
    }

    await launchFeaturedArticle({
      fetchArticle: fetchDailyArticle,
      source: 'Wikipedia Daily',
      setStatus: setDailyStatus,
      setError: setDailyError,
      fallbackError: 'Failed to fetch daily article',
      today,
    });
  }, [applySessionLaunchPlan, launchFeaturedArticle]);

  const handleStartRandom = useCallback(async () => {
    await launchFeaturedArticle({
      fetchArticle: fetchRandomFeaturedArticle,
      source: 'Wikipedia Featured',
      setStatus: setRandomStatus,
      setError: setRandomError,
      fallbackError: 'Failed to fetch article',
    });
  }, [launchFeaturedArticle]);

  // Content browser → article selected → preview
  const handleContentBrowserSelectArticle = useCallback((article: Article) => {
    if (viewState.screen === 'content-browser') {
      navigate(planContentBrowserArticleSelection(viewState.activity, article));
    }
  }, [viewState, navigate]);

  // Preview → start reading
  const handleStartReading = useCallback((article: Article, wpm: number, mode: TokenMode) => {
    if (viewState.screen !== 'preview') return;
    const launchPlan = planStartReadingFromPreview(viewState.activity, article, mode);
    if (!launchPlan) return;

    setActivityWpm(launchPlan.syncWpmActivity, wpm);
    applySessionLaunchPlan(launchPlan);
  }, [applySessionLaunchPlan, setActivityWpm, viewState]);

  // Continue from home screen
  const continueInfo = useMemo(() => {
    return resolveContinueSessionInfo(settings.lastSession, articles);
  }, [settings.lastSession, articles]);

  const comprehensionSummary = useMemo(() => {
    const lastAttempt = comprehensionAttempts[0];
    return {
      attemptCount: comprehensionAttempts.length,
      lastScore: lastAttempt?.overallScore ?? null,
    };
  }, [comprehensionAttempts]);

  const activeComprehensionSourceArticles = useMemo(() => {
    if (viewState.screen !== 'active-comprehension') return [];
    if (viewState.comprehension.runMode !== 'exam') {
      return [viewState.article];
    }
    return viewState.comprehension.sourceArticleIds
      .map((articleId) => articles.find((article) => article.id === articleId))
      .filter((article): article is Article => article !== undefined);
  }, [articles, viewState]);

  const handleContinue = useCallback((info: { article: Article; activity: Activity; displayMode: DisplayMode }) => {
    applySessionLaunchPlan(planContinueSession(info));
  }, [applySessionLaunchPlan]);

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
  const isAtEndOfText = rsvp.chunks.length > 0 && rsvp.currentChunkIndex >= rsvp.chunks.length - 1;

  // Header title based on view
  const headerTitle = getHeaderTitle(viewState);

  const showBackButton = shouldShowBackButton(viewState);
  const headerBackAction = getHeaderBackAction(viewState);
  const appMainClassName = viewState.screen === 'active-reader' ? 'app-main app-main-active-reader' : 'app-main';

  // --- Render helpers ---

  const renderReaderControls = (allowedModes: DisplayMode[], activity: Activity) => (
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
      onWpmChange={(nextWpm) => setActivityWpm(activity, nextWpm)}
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
      saccadePacerStyle={displaySettings.saccadePacerStyle}
      onSaccadePacerStyleChange={handleSaccadePacerStyleChange}
      saccadeFocusTarget={displaySettings.saccadeFocusTarget}
      onSaccadeFocusTargetChange={handleSaccadeFocusTargetChange}
      saccadeMergeShortFunctionWords={displaySettings.saccadeMergeShortFunctionWords}
      onSaccadeMergeShortFunctionWordsChange={handleSaccadeMergeShortFunctionWordsChange}
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

  const renderPassageWorkspace = () => {
    const canCapture = viewState.screen === 'active-reader'
      && rsvp.displayMode === 'saccade'
      && !rsvp.isPlaying
      && !!currentSaccadeCaptureContext;
    const queueItems = reviewQueue;

    return (
      <section className={`passage-workspace ${isPassageWorkspaceOpen ? 'passage-workspace-open' : ''}`}>
        <div className="passage-workspace-toolbar">
          <div className="passage-workspace-header">
            <strong>Passage Workspace</strong>
            <span className="passage-workspace-count">{reviewQueue.length} queued</span>
          </div>
          <button
            className={`control-btn passage-workspace-toggle ${isPassageWorkspaceOpen ? 'control-btn-active' : ''}`}
            onClick={() => setIsPassageWorkspaceOpen((open) => !open)}
            title={queueItems.length === 0
              ? 'Capture passages to enable queue review'
              : isPassageWorkspaceOpen
                ? 'Hide passage queue'
                : 'Show passage queue'}
            aria-expanded={isPassageWorkspaceOpen}
            aria-controls="passage-queue-panel"
            disabled={queueItems.length === 0}
          >
            {isPassageWorkspaceOpen ? 'Hide Queue' : 'Show Queue'}
          </button>
        </div>

        <div className="passage-capture-actions">
          <button
            className="control-btn"
            onClick={handleCaptureSentence}
            disabled={!canCapture}
            title={!canCapture ? 'Pause Saccade reading to capture passages' : 'Save sentence at current focus'}
          >
            Save Sentence
          </button>
          <button
            className="control-btn"
            onClick={handleCaptureParagraph}
            disabled={!canCapture}
            title={!canCapture ? 'Pause Saccade reading to capture passages' : 'Save current paragraph'}
          >
            Save Paragraph
          </button>
          <button
            className="control-btn"
            onClick={handleCaptureLastLines}
            disabled={!canCapture}
            title={!canCapture ? 'Pause Saccade reading to capture passages' : `Save last ${PASSAGE_CAPTURE_LAST_LINE_COUNT} lines`}
          >
            Save Last {PASSAGE_CAPTURE_LAST_LINE_COUNT}
          </button>
          <button
            className="control-btn"
            onClick={() => {
              if (reviewQueue.length === 0) return;
              startPassageReview(reviewQueue[0], 'recall');
            }}
            disabled={reviewQueue.length === 0}
            title="Start quick recall with the highest-priority queued passage"
          >
            Review Next
          </button>
        </div>

        {captureNotice && (
          <div className="passage-capture-notice-toast" role="status" aria-live="polite">
            {captureNotice}
          </div>
        )}

        {isPassageWorkspaceOpen && queueItems.length > 0 && (
          <div id="passage-queue-panel" className="passage-workspace-panel">
            <div className="passage-queue-list">
              {queueItems.map((passage) => (
                <article
                  key={passage.id}
                  className={`passage-queue-item ${activePassageId === passage.id ? 'active' : ''}`}
                >
                  <div className="passage-queue-meta">
                    <span>{passage.articleTitle}</span>
                    <span>{passage.captureKind} • {passage.reviewState}</span>
                  </div>
                  <div className="passage-queue-text">{clipPassagePreview(passage.text)}</div>
                  <div className="passage-queue-actions">
                    <button className="control-btn" onClick={() => startPassageReview(passage, 'recall')}>
                      Recall
                    </button>
                    <button className="control-btn" onClick={() => startPassageReview(passage, 'prediction')}>
                      Predict
                    </button>
                    <button className="control-btn" onClick={() => markPassageReviewState(passage.id, 'hard')}>
                      Hard
                    </button>
                    <button className="control-btn" onClick={() => markPassageReviewState(passage.id, 'easy')}>
                      Easy
                    </button>
                    <button className="control-btn" onClick={() => markPassageReviewState(passage.id, 'done')}>
                      Done
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  };

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
            <button
              className="control-btn app-back-btn"
              onClick={
                headerBackAction === 'close-active-exercise'
                  ? closeActiveExercise
                  : headerBackAction === 'close-active-comprehension'
                    ? closeActiveComprehension
                    : goHome
              }
            >
              Home
            </button>
          )}
          <h1>{headerTitle}</h1>
        </div>
        <button
          className="settings-gear-btn"
          onClick={() => navigate({ screen: 'settings' })}
          title="Display settings"
          aria-label="Display settings"
        >
          <svg
            className="settings-gear-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M19.4 15.1a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-1.1 1.1a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2a1.2 1.2 0 0 1-1.2 1.2h-1.6a1.2 1.2 0 0 1-1.2-1.2v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-1.1-1.1a1.2 1.2 0 0 1 0-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6h-.2A1.2 1.2 0 0 1 2 13.9v-1.6A1.2 1.2 0 0 1 3.2 11h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1L4 9.2a1.2 1.2 0 0 1 0-1.7l1.1-1.1a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9v-.2A1.2 1.2 0 0 1 9.8 4h1.6a1.2 1.2 0 0 1 1.2 1.2v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l1.1 1.1a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.2 1.2 0 0 1 1.2 1.2v1.6a1.2 1.2 0 0 1-1.2 1.2h-.2a1 1 0 0 0-.9.6Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <main className={appMainClassName}>
        {/* Home Screen */}
        {viewState.screen === 'home' && (
          <HomeScreen
            onSelectActivity={handleSelectActivity}
            onContinue={handleContinue}
            onStartDrill={handleStartDrill}
            onStartComprehensionBuilder={handleStartComprehensionBuilder}
            onStartDaily={handleStartDaily}
            dailyStatus={dailyStatus}
            dailyError={dailyError}
            onStartRandom={handleStartRandom}
            randomStatus={randomStatus}
            randomError={randomError}
            continueInfo={continueInfo}
            comprehensionSummary={comprehensionSummary}
            comprehensionAttempts={comprehensionAttempts}
          />
        )}

        {viewState.screen === 'comprehension-builder' && (
          <ComprehensionExamBuilder
            articles={articles}
            onClose={goHome}
            onLaunch={handleLaunchComprehensionBuilder}
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
            initialWpm={getActivityWpm(viewState.activity)}
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
              saccadePacerStyle={displaySettings.saccadePacerStyle}
              saccadeFocusTarget={displaySettings.saccadeFocusTarget}
              saccadeMergeShortFunctionWords={displaySettings.saccadeMergeShortFunctionWords}
              saccadeLength={displaySettings.saccadeLength}
            />
            <ProgressBar progress={progress} onChange={handleProgressChange} />
            {renderArticleInfo()}
            {renderReaderControls(['rsvp', 'saccade'], 'paced-reading')}
            {isAtEndOfText && (
              <div className="reader-finish-actions">
                <button className="control-btn" onClick={handleStartComprehensionFromReading}>
                  Comprehension Check
                </button>
              </div>
            )}
            {renderPassageWorkspace()}
          </>
        )}

        {/* Active Recall: Prediction / Recall */}
        {viewState.screen === 'active-exercise' && (
          <>
            <div className="exercise-return-bar">
              <button className="control-btn" onClick={closeActiveExercise}>
                Return to Reading
              </button>
            </div>
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
                  onClose={closeActiveExercise}
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
                  onClose={closeActiveExercise}
                  stats={rsvp.predictionStats}
                  wpm={rsvp.wpm}
                  goToIndex={rsvp.goToIndex}
                  onWpmChange={(nextWpm) => setActivityWpm('active-recall', nextWpm)}
                  previewMode={displaySettings.predictionPreviewMode}
                  previewSentenceCount={displaySettings.predictionPreviewSentenceCount}
                />
              </div>
            )}
            {renderReaderControls(['prediction', 'recall'], 'active-recall')}
          </>
        )}

        {/* Training */}
        {viewState.screen === 'active-training' && (
          <div className="training-container">
            <TrainingReader
              article={viewState.article}
              initialWpm={getActivityWpm('training')}
              saccadeShowOVP={displaySettings.saccadeShowOVP}
              saccadeShowSweep={displaySettings.saccadeShowSweep}
              saccadePacerStyle={displaySettings.saccadePacerStyle}
              saccadeFocusTarget={displaySettings.saccadeFocusTarget}
              saccadeMergeShortFunctionWords={displaySettings.saccadeMergeShortFunctionWords}
              saccadeLength={displaySettings.saccadeLength}
              onClose={goHome}
              onWpmChange={(nextWpm) => setActivityWpm('training', nextWpm)}
              onSelectArticle={() => navigate({ screen: 'content-browser', activity: 'training' })}
            />
          </div>
        )}

        {viewState.screen === 'active-comprehension' && (
          <ComprehensionCheckBoundary onClose={closeActiveComprehension}>
            <ComprehensionCheck
              article={viewState.article}
              entryPoint={viewState.entryPoint}
              sourceArticles={activeComprehensionSourceArticles}
              comprehension={viewState.comprehension}
              adapter={comprehensionAdapter}
              onClose={closeActiveComprehension}
              onOpenSettings={() => navigate({ screen: 'settings' })}
              onAttemptSaved={handleComprehensionAttemptSaved}
            />
          </ComprehensionCheckBoundary>
        )}

        {/* Add Article */}
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
            comprehensionApiKey={comprehensionApiKey}
            comprehensionApiKeyStorageMode={comprehensionApiKeyStorageMode}
            onComprehensionApiKeyChange={handleComprehensionApiKeyChange}
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
