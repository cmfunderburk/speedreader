import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Chunk, TokenMode, Article, SaccadePage, DisplayMode, PredictionStats, PredictionResult, RampCurve } from '../types';
import { tokenize } from '../lib/tokenizer';
import { tokenizeSaccade, tokenizeRecall, calculateSaccadeLineDuration } from '../lib/saccade';
import { calculateDisplayTime, getEffectiveWpm } from '../lib/rsvp';
import { mapChunkIndexByProgress } from '../lib/indexMapping';
import { updateArticlePosition, updateArticlePredictionPosition } from '../lib/storage';
import { isExactMatch, isWordKnown } from '../lib/levenshtein';
import { usePlaybackTimer } from './usePlaybackTimer';

const PACED_LINE_DEFAULT_LINES_PER_PAGE = 25;

interface UseRSVPOptions {
  initialWpm?: number;
  initialMode?: TokenMode;
  initialDisplayMode?: DisplayMode;
  initialCustomCharWidth?: number;
  initialRampEnabled?: boolean;
  rampCurve?: RampCurve;
  rampStartPercent?: number;
  rampRate?: number;
  rampInterval?: number;
  saccadeLength?: number;
  onComplete?: () => void;
}

interface UseRSVPReturn {
  chunks: Chunk[];
  currentChunkIndex: number;
  currentChunk: Chunk | null;
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  displayMode: DisplayMode;
  customCharWidth: number;
  article: Article | null;
  saccadePages: SaccadePage[];
  currentSaccadePage: SaccadePage | null;
  currentSaccadePageIndex: number;
  showPacer: boolean;
  linesPerPage: number;
  predictionStats: PredictionStats;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  goToIndex: (index: number) => void;
  setWpm: (wpm: number) => void;
  setMode: (mode: TokenMode) => void;
  setDisplayMode: (displayMode: DisplayMode) => void;
  setCustomCharWidth: (width: number) => void;
  setShowPacer: (show: boolean) => void;
  setLinesPerPage: (lines: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  loadArticle: (article: Article, options?: LoadArticleOptions) => void;
  reset: () => void;
  handlePredictionResult: (result: PredictionResult) => void;
  resetPredictionStats: () => void;
  advanceSelfPaced: () => void;
  rampEnabled: boolean;
  setRampEnabled: (enabled: boolean) => void;
  effectiveWpm: number;
}

interface LoadArticleOptions {
  mode?: TokenMode;
  displayMode?: DisplayMode;
}

function clampChunkIndex(index: number, totalChunks: number): number {
  if (totalChunks <= 0) return 0;
  return Math.max(0, Math.min(index, totalChunks - 1));
}

function clampProgressIndex(index: number, totalChunks: number): number {
  return Math.max(0, Math.min(index, totalChunks));
}

export function useRSVP(options: UseRSVPOptions = {}): UseRSVPReturn {
  const {
    initialWpm = 400,
    initialMode = 'word',
    initialDisplayMode = 'rsvp',
    initialCustomCharWidth = 30,
    initialRampEnabled = false,
    rampCurve = 'linear',
    rampStartPercent = 50,
    rampRate = 25,
    rampInterval = 30,
    saccadeLength = 10,
    onComplete,
  } = options;

  const [article, setArticle] = useState<Article | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [wpm, setWpm] = useState(initialWpm);
  const [mode, setMode] = useState<TokenMode>(initialMode);
  const [displayMode, setDisplayModeState] = useState<DisplayMode>(initialDisplayMode);
  const [customCharWidth, setCustomCharWidthState] = useState(initialCustomCharWidth);
  const [saccadePages, setSaccadePages] = useState<SaccadePage[]>([]);
  const [showPacer, setShowPacer] = useState(true);
  const [linesPerPage, setLinesPerPageState] = useState(PACED_LINE_DEFAULT_LINES_PER_PAGE);
  const [predictionStats, setPredictionStats] = useState<PredictionStats>({
    totalWords: 0,
    exactMatches: 0,
    knownWords: 0,
  });

  const [rampEnabled, setRampEnabledState] = useState(initialRampEnabled);

  const isSelfPacedDisplay = displayMode === 'recall' || displayMode === 'training';
  const isLinePacedDisplay = displayMode === 'saccade' || displayMode === 'generation';
  const shouldAutoPlay = !isSelfPacedDisplay && (!isLinePacedDisplay || showPacer);

  const chunksRef = useRef<Chunk[]>(chunks);
  const indexRef = useRef(currentChunkIndex);
  const wpmRef = useRef(wpm);
  const articleRef = useRef<Article | null>(article);
  const customCharWidthRef = useRef(customCharWidth);
  const displayModeRef = useRef(displayMode);
  const modeRef = useRef(mode);
  const showPacerRef = useRef(showPacer);
  const linesPerPageRef = useRef(linesPerPage);

  const saccadeLengthRef = useRef(saccadeLength);
  const rampEnabledRef = useRef(rampEnabled);
  const rampCurveRef = useRef(rampCurve);
  const rampStartPercentRef = useRef(rampStartPercent);
  const rampRateRef = useRef(rampRate);
  const rampIntervalRef = useRef(rampInterval);
  const playStartTimeRef = useRef<number | null>(null);
  const accumulatedPlayTimeRef = useRef(0);

  // Prediction mode position tracking (word index, separate from RSVP/saccade)
  const predictionWordIndexRef = useRef<number>(0);
  const advanceToNextRef = useRef<() => void>(() => {});

  const getElapsedPlayTimeMs = useCallback((): number => {
    const accumulated = accumulatedPlayTimeRef.current;
    if (playStartTimeRef.current == null) return accumulated;
    return accumulated + (performance.now() - playStartTimeRef.current);
  }, []);

  const getCurrentDuration = useCallback((): number | null => {
    const chunks = chunksRef.current;
    const currentIndex = indexRef.current;

    if (currentIndex >= chunks.length) {
      return null;
    }

    const chunk = chunks[currentIndex];
    if (!chunk) {
      return null;
    }

    let effectiveWpm = wpmRef.current;
    if (rampEnabledRef.current) {
      effectiveWpm = getEffectiveWpm(
        wpmRef.current,
        getElapsedPlayTimeMs(),
        rampRateRef.current,
        rampIntervalRef.current,
        rampCurveRef.current,
        rampStartPercentRef.current
      );
    }

    // Saccade mode: character-based timing to match continuous sweep
    if ((displayModeRef.current === 'saccade' || displayModeRef.current === 'generation') && chunk.text) {
      return calculateSaccadeLineDuration(chunk.text.length, effectiveWpm);
    }

    return calculateDisplayTime(chunk, effectiveWpm, modeRef.current);
  }, [getElapsedPlayTimeMs]);

  // Keep refs in sync with state
  useEffect(() => { chunksRef.current = chunks; }, [chunks]);
  useEffect(() => { indexRef.current = currentChunkIndex; }, [currentChunkIndex]);
  useEffect(() => { wpmRef.current = wpm; }, [wpm]);
  useEffect(() => { articleRef.current = article; }, [article]);
  useEffect(() => { customCharWidthRef.current = customCharWidth; }, [customCharWidth]);
  useEffect(() => { displayModeRef.current = displayMode; }, [displayMode]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { showPacerRef.current = showPacer; }, [showPacer]);
  useEffect(() => { linesPerPageRef.current = linesPerPage; }, [linesPerPage]);
  useEffect(() => { saccadeLengthRef.current = saccadeLength; }, [saccadeLength]);

  // Retokenize when saccadeLength changes in custom RSVP mode
  useEffect(() => {
    if (article && mode === 'custom' && displayMode === 'rsvp') {
      const { chunks: newChunks, pages } = retokenize(
        article.content, displayMode, mode, saccadeLength, linesPerPageRef.current, article.assetBaseUrl, article.sourcePath
      );
      setSaccadePages(pages);
      setChunks(newChunks);
      setCurrentChunkIndex(
        mapChunkIndexByProgress(currentChunkIndex, chunks.length, newChunks.length)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to saccadeLength changes
  }, [saccadeLength]);

  useEffect(() => { rampEnabledRef.current = rampEnabled; }, [rampEnabled]);
  useEffect(() => { rampCurveRef.current = rampCurve; }, [rampCurve]);
  useEffect(() => { rampStartPercentRef.current = rampStartPercent; }, [rampStartPercent]);
  useEffect(() => { rampRateRef.current = rampRate; }, [rampRate]);
  useEffect(() => { rampIntervalRef.current = rampInterval; }, [rampInterval]);


  // Helper to tokenize based on current display mode and chunk mode
  const retokenize = useCallback((
    content: string,
    dm: DisplayMode,
    tm: TokenMode,
    sacLen: number,
    pageLines: number = PACED_LINE_DEFAULT_LINES_PER_PAGE,
    figureAssetBaseUrl?: string,
    sourcePath?: string
  ): { chunks: Chunk[]; pages: SaccadePage[] } => {
    if (dm === 'training') {
      return { chunks: [], pages: [] };
    } else if (dm === 'saccade' || dm === 'generation') {
      const result = tokenizeSaccade(content, pageLines, figureAssetBaseUrl, sourcePath);
      return { chunks: result.chunks, pages: result.pages };
    } else if (dm === 'recall') {
      const result = tokenizeRecall(content, pageLines);
      return { chunks: result.chunks, pages: result.pages };
    } else if (dm === 'prediction') {
      // Prediction mode always uses word tokenization
      const newChunks = tokenize(content, 'word');
      return { chunks: newChunks, pages: [] };
    } else {
      const newChunks = tokenize(content, tm, tm === 'custom' ? sacLen : undefined);
      return { chunks: newChunks, pages: [] };
    }
  }, []);

  // Advance to next chunk
  const { isPlaying, play: startTimer, pause: stopTimer } = usePlaybackTimer({
    enabled: shouldAutoPlay && chunks.length > 0,
    watch: currentChunkIndex,
    getDurationMs: getCurrentDuration,
    onTick: () => advanceToNextRef.current(),
  });

  const advanceToNext = useCallback(() => {
    const chunks = chunksRef.current;
    const currentIndex = indexRef.current;

    if (currentIndex >= chunks.length - 1) {
      stopTimer();
      if (articleRef.current) {
        updateArticlePosition(articleRef.current.id, clampChunkIndex(currentIndex, chunks.length));
      }
      onComplete?.();
      return;
    }

    // Move to next chunk
    const nextIndex = currentIndex + 1;
    setCurrentChunkIndex(nextIndex);

    // Persist position periodically
    if (articleRef.current && (nextIndex % 10 === 0 || nextIndex === chunks.length - 1)) {
      updateArticlePosition(articleRef.current.id, nextIndex);
    }
  }, [onComplete, stopTimer]);

  useEffect(() => {
    advanceToNextRef.current = advanceToNext;
  }, [advanceToNext]);

  const play = useCallback(() => {
    if (chunks.length > 0 && currentChunkIndex < chunks.length) {
      playStartTimeRef.current = performance.now();
      startTimer();
    }
  }, [chunks.length, currentChunkIndex, startTimer]);

  const pause = useCallback(() => {
    // Accumulate elapsed play time for ramp tracking
    if (isPlaying && playStartTimeRef.current != null) {
      accumulatedPlayTimeRef.current += performance.now() - playStartTimeRef.current;
      playStartTimeRef.current = null;
    }
    stopTimer();

    // Persist position on pause/exit even when not auto-playing.
    if (articleRef.current) {
      const total = chunksRef.current.length;
      if (displayModeRef.current === 'prediction') {
        updateArticlePredictionPosition(
          articleRef.current.id,
          clampProgressIndex(indexRef.current, total)
        );
      } else {
        updateArticlePosition(
          articleRef.current.id,
          clampChunkIndex(indexRef.current, total)
        );
      }
    }
  }, [isPlaying, stopTimer]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const next = useCallback(() => {
    setCurrentChunkIndex(i => clampChunkIndex(i + 1, chunks.length));
  }, [chunks.length]);

  const prev = useCallback(() => {
    setCurrentChunkIndex(i => Math.max(i - 1, 0));
  }, []);

  const goToIndex = useCallback((index: number) => {
    setCurrentChunkIndex(clampChunkIndex(index, chunks.length));
  }, [chunks.length]);

  // Page navigation for saccade mode
  const nextPage = useCallback(() => {
    if ((displayMode !== 'saccade' && displayMode !== 'generation') || saccadePages.length === 0) return;

    const currentPageIndex = chunks[currentChunkIndex]?.saccade?.pageIndex ?? 0;
    if (currentPageIndex >= saccadePages.length - 1) return;

    // Find first chunk of next page
    const nextPageIndex = currentPageIndex + 1;
    const firstChunkOfNextPage = chunks.findIndex(c => c.saccade?.pageIndex === nextPageIndex);
    if (firstChunkOfNextPage !== -1) {
      setCurrentChunkIndex(firstChunkOfNextPage);
    }
  }, [displayMode, saccadePages.length, chunks, currentChunkIndex]);

  const prevPage = useCallback(() => {
    if ((displayMode !== 'saccade' && displayMode !== 'generation') || saccadePages.length === 0) return;

    const currentPageIndex = chunks[currentChunkIndex]?.saccade?.pageIndex ?? 0;
    if (currentPageIndex <= 0) return;

    // Find first chunk of previous page
    const prevPageIndex = currentPageIndex - 1;
    const firstChunkOfPrevPage = chunks.findIndex(c => c.saccade?.pageIndex === prevPageIndex);
    if (firstChunkOfPrevPage !== -1) {
      setCurrentChunkIndex(firstChunkOfPrevPage);
    }
  }, [displayMode, saccadePages.length, chunks, currentChunkIndex]);

  const handleSetMode = useCallback((newMode: TokenMode) => {
    modeRef.current = newMode;
    setMode(newMode);
    const activeArticle = articleRef.current;
    if (activeArticle) {
      const { chunks: newChunks, pages } = retokenize(
        activeArticle.content,
        displayModeRef.current,
        newMode,
        saccadeLengthRef.current,
        linesPerPageRef.current,
        activeArticle.assetBaseUrl,
        activeArticle.sourcePath
      );
      setSaccadePages(pages);

      // Try to preserve approximate position
      setChunks(newChunks);
      setCurrentChunkIndex(
        mapChunkIndexByProgress(currentChunkIndex, chunks.length, newChunks.length)
      );
    }
  }, [chunks.length, currentChunkIndex, retokenize]);

  const handleSetDisplayMode = useCallback((newDisplayMode: DisplayMode) => {
    if (newDisplayMode === 'prediction' || newDisplayMode === 'recall' || newDisplayMode === 'training') {
      pause();
    }
    const prevDisplayMode = displayModeRef.current;
    displayModeRef.current = newDisplayMode;
    setDisplayModeState(newDisplayMode);

    const activeArticle = articleRef.current;
    if (activeArticle) {
      // Save prediction position when leaving prediction mode
      if (prevDisplayMode === 'prediction') {
        predictionWordIndexRef.current = indexRef.current;
        updateArticlePredictionPosition(
          activeArticle.id,
          clampProgressIndex(indexRef.current, chunksRef.current.length)
        );
      }

      // Prediction mode forces word tokenization
      const effectiveMode = newDisplayMode === 'prediction' ? 'word' : modeRef.current;

      const { chunks: newChunks, pages } = retokenize(
        activeArticle.content,
        newDisplayMode,
        effectiveMode,
        saccadeLengthRef.current,
        linesPerPageRef.current,
        activeArticle.assetBaseUrl,
        activeArticle.sourcePath
      );
      setSaccadePages(pages);

      if (newDisplayMode === 'training') {
        // Training manages its own state; just set empty chunks
        setCurrentChunkIndex(0);
      } else if (newDisplayMode === 'prediction') {
        // Entering prediction: load word index (from ref or localStorage)
        const savedIndex = predictionWordIndexRef.current ||
                           activeArticle.predictionPosition || 0;
        setCurrentChunkIndex(clampProgressIndex(savedIndex, newChunks.length));
        // Reset stats when entering prediction mode
        setPredictionStats({
          totalWords: 0,
          exactMatches: 0,
          knownWords: 0,
        });
      } else if (newDisplayMode === 'recall') {
        // Entering recall: start from beginning, reset stats
        setCurrentChunkIndex(0);
        setPredictionStats({
          totalWords: 0,
          exactMatches: 0,
          knownWords: 0,
        });
      } else {
        // Entering RSVP/Saccade: use ratio-based mapping
        setCurrentChunkIndex(
          mapChunkIndexByProgress(currentChunkIndex, chunks.length, newChunks.length)
        );
      }

      setChunks(newChunks);
    }
  }, [chunks.length, currentChunkIndex, pause, retokenize]);

  const setCustomCharWidth = useCallback((width: number) => {
    setCustomCharWidthState(width);
  }, []);

  const setLinesPerPage = useCallback((lines: number) => {
    setLinesPerPageState(lines);
    const activeArticle = articleRef.current;
    if (
      activeArticle
      && (displayModeRef.current === 'saccade' || displayModeRef.current === 'generation' || displayModeRef.current === 'recall')
    ) {
      const { chunks: newChunks, pages } = retokenize(
        activeArticle.content,
        displayModeRef.current,
        modeRef.current,
        saccadeLengthRef.current,
        lines,
        activeArticle.assetBaseUrl,
        activeArticle.sourcePath
      );
      setSaccadePages(pages);

      setChunks(newChunks);
      setCurrentChunkIndex(
        mapChunkIndexByProgress(currentChunkIndex, chunks.length, newChunks.length)
      );
    }
  }, [chunks.length, currentChunkIndex, retokenize]);

  const loadArticle = useCallback((newArticle: Article, options?: LoadArticleOptions) => {
    pause();
    accumulatedPlayTimeRef.current = 0;
    playStartTimeRef.current = null;

    const requestedMode = options?.mode ?? modeRef.current;
    const requestedDisplayMode = options?.displayMode ?? displayModeRef.current;

    modeRef.current = requestedMode;
    displayModeRef.current = requestedDisplayMode;
    setMode(requestedMode);
    setDisplayModeState(requestedDisplayMode);

    setArticle(newArticle);
    predictionWordIndexRef.current = newArticle.predictionPosition || 0;

    const effectiveMode = requestedDisplayMode === 'prediction' ? 'word' : requestedMode;
    const { chunks: newChunks, pages } = retokenize(
      newArticle.content,
      requestedDisplayMode,
      effectiveMode,
      saccadeLengthRef.current,
      linesPerPageRef.current,
      newArticle.assetBaseUrl,
      newArticle.sourcePath
    );
    setSaccadePages(pages);
    setChunks(newChunks);

    if (requestedDisplayMode === 'prediction') {
      const startIndex = predictionWordIndexRef.current || newArticle.predictionPosition || 0;
      setCurrentChunkIndex(clampProgressIndex(startIndex, newChunks.length));
    } else if (requestedDisplayMode === 'recall' || requestedDisplayMode === 'training') {
      setCurrentChunkIndex(0);
    } else {
      const startIndex = newArticle.readPosition || 0;
      setCurrentChunkIndex(clampChunkIndex(startIndex, newChunks.length));
    }
  }, [pause, retokenize]);

  const resetRampTime = useCallback(() => {
    accumulatedPlayTimeRef.current = 0;
    playStartTimeRef.current = isPlaying ? performance.now() : null;
  }, [isPlaying]);

  const setRampEnabled = useCallback((enabled: boolean) => {
    setRampEnabledState(enabled);
    resetRampTime();
  }, [resetRampTime]);

  const reset = useCallback(() => {
    pause();
    setCurrentChunkIndex(0);
  }, [pause]);

  // Prediction mode handlers
  const handlePredictionResult = useCallback((result: PredictionResult) => {
    setPredictionStats(prev => {
      const totalWords = prev.totalWords + 1;
      const exact = isExactMatch(result.predicted, result.actual);
      const known = isWordKnown(result.predicted, result.actual);

      return {
        totalWords,
        exactMatches: prev.exactMatches + (exact ? 1 : 0),
        knownWords: prev.knownWords + (known ? 1 : 0),
      };
    });
  }, []);

  const resetPredictionStats = useCallback(() => {
    setPredictionStats({
      totalWords: 0,
      exactMatches: 0,
      knownWords: 0,
    });
    setCurrentChunkIndex(0);
  }, []);

  const advanceSelfPaced = useCallback(() => {
    setCurrentChunkIndex(prevIndex => {
      const total = chunksRef.current.length;
      const nextIndex = Math.min(prevIndex + 1, total);
      if (articleRef.current && displayModeRef.current === 'prediction') {
        updateArticlePredictionPosition(articleRef.current.id, nextIndex);
      }
      return nextIndex;
    });
  }, []);

  // Recompute every render so ramp display stays in sync with chunk advances.
  const effectiveWpm = !rampEnabled
    ? wpm
    : getEffectiveWpm(wpm, getElapsedPlayTimeMs(), rampRate, rampInterval, rampCurve, rampStartPercent);

  // Compute current saccade page
  const currentChunk = chunks[currentChunkIndex] ?? null;
  const currentSaccadePageIndex = useMemo(() => {
    if ((displayMode !== 'saccade' && displayMode !== 'generation') || !currentChunk?.saccade) return 0;
    return currentChunk.saccade.pageIndex;
  }, [displayMode, currentChunk]);

  const currentSaccadePage = useMemo(() => {
    if (displayMode !== 'saccade' && displayMode !== 'generation') return null;
    return saccadePages[currentSaccadePageIndex] ?? null;
  }, [displayMode, saccadePages, currentSaccadePageIndex]);

  return {
    chunks,
    currentChunkIndex,
    currentChunk,
    isPlaying,
    wpm,
    mode,
    displayMode,
    customCharWidth,
    article,
    saccadePages,
    currentSaccadePage,
    currentSaccadePageIndex,
    showPacer,
    linesPerPage,
    predictionStats,
    play,
    pause,
    toggle,
    next,
    prev,
    goToIndex,
    setWpm,
    setMode: handleSetMode,
    setDisplayMode: handleSetDisplayMode,
    setCustomCharWidth,
    setShowPacer,
    setLinesPerPage,
    nextPage,
    prevPage,
    loadArticle,
    reset,
    handlePredictionResult,
    resetPredictionStats,
    advanceSelfPaced,
    rampEnabled,
    setRampEnabled,
    effectiveWpm,
  };
}
