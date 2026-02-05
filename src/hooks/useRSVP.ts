import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Chunk, TokenMode, Article, SaccadePage, DisplayMode, PredictionStats, PredictionResult } from '../types';
import { tokenize } from '../lib/tokenizer';
import { tokenizeSaccade, tokenizeRecall, SACCADE_LINES_PER_PAGE } from '../lib/saccade';
import { calculateDisplayTime } from '../lib/rsvp';
import { updateArticlePosition, updateArticlePredictionPosition } from '../lib/storage';
import { isExactMatch } from '../lib/levenshtein';
import { usePlaybackTimer } from './usePlaybackTimer';

interface UseRSVPOptions {
  initialWpm?: number;
  initialMode?: TokenMode;
  initialDisplayMode?: DisplayMode;
  initialCustomCharWidth?: number;
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
  loadArticle: (article: Article) => void;
  reset: () => void;
  handlePredictionResult: (result: PredictionResult) => void;
  resetPredictionStats: () => void;
  advanceSelfPaced: () => void;
}

export function useRSVP(options: UseRSVPOptions = {}): UseRSVPReturn {
  const {
    initialWpm = 400,
    initialMode = 'phrase',
    initialDisplayMode = 'rsvp',
    initialCustomCharWidth = 30,
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
  const [linesPerPage, setLinesPerPageState] = useState(SACCADE_LINES_PER_PAGE);
  const [predictionStats, setPredictionStats] = useState<PredictionStats>({
    totalWords: 0,
    exactMatches: 0,
    averageLoss: 0,
  });

  const shouldAutoPlay = displayMode !== 'recall' && (displayMode !== 'saccade' || showPacer);

  const chunksRef = useRef<Chunk[]>(chunks);
  const indexRef = useRef(currentChunkIndex);
  const wpmRef = useRef(wpm);
  const articleRef = useRef<Article | null>(article);
  const customCharWidthRef = useRef(customCharWidth);
  const displayModeRef = useRef(displayMode);
  const modeRef = useRef(mode);
  const showPacerRef = useRef(showPacer);
  const linesPerPageRef = useRef(linesPerPage);

  // Prediction mode position tracking (word index, separate from RSVP/saccade)
  const predictionWordIndexRef = useRef<number>(0);
  const advanceToNextRef = useRef<() => void>(() => {});

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

    return calculateDisplayTime(chunk, wpmRef.current);
  }, []);

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


  // Helper to tokenize based on current display mode and chunk mode
  const retokenize = useCallback((
    content: string,
    dm: DisplayMode,
    tm: TokenMode,
    charWidth: number,
    pageLines: number = SACCADE_LINES_PER_PAGE
  ): { chunks: Chunk[]; pages: SaccadePage[] } => {
    if (dm === 'saccade') {
      const result = tokenizeSaccade(content, pageLines);
      return { chunks: result.chunks, pages: result.pages };
    } else if (dm === 'recall') {
      const result = tokenizeRecall(content, pageLines);
      return { chunks: result.chunks, pages: result.pages };
    } else if (dm === 'prediction') {
      // Prediction mode always uses word tokenization
      const newChunks = tokenize(content, 'word');
      return { chunks: newChunks, pages: [] };
    } else {
      const newChunks = tokenize(content, tm, tm === 'custom' ? charWidth : undefined);
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
      onComplete?.();
      return;
    }

    // Move to next chunk
    const nextIndex = currentIndex + 1;
    setCurrentChunkIndex(nextIndex);

    // Persist position periodically
    if (articleRef.current && nextIndex % 10 === 0) {
      updateArticlePosition(articleRef.current.id, nextIndex);
    }
  }, [onComplete, stopTimer]);

  useEffect(() => {
    advanceToNextRef.current = advanceToNext;
  }, [advanceToNext]);

  const play = useCallback(() => {
    if (chunks.length > 0 && currentChunkIndex < chunks.length) {
      startTimer();
    }
  }, [chunks.length, currentChunkIndex, startTimer]);

  const pause = useCallback(() => {
    if (!isPlaying) {
      return;
    }
    stopTimer();
    // Persist position on pause
    if (articleRef.current) {
      updateArticlePosition(articleRef.current.id, currentChunkIndex);
    }
  }, [currentChunkIndex, isPlaying, stopTimer]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const next = useCallback(() => {
    setCurrentChunkIndex(i => Math.min(i + 1, chunks.length - 1));
  }, [chunks.length]);

  const prev = useCallback(() => {
    setCurrentChunkIndex(i => Math.max(i - 1, 0));
  }, []);

  const goToIndex = useCallback((index: number) => {
    setCurrentChunkIndex(Math.max(0, Math.min(index, chunks.length - 1)));
  }, [chunks.length]);

  // Page navigation for saccade mode (manual navigation when pacer is off)
  const nextPage = useCallback(() => {
    if (displayMode !== 'saccade' || saccadePages.length === 0) return;

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
    if (displayMode !== 'saccade' || saccadePages.length === 0) return;

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
    setMode(newMode);
    if (article) {
      const { chunks: newChunks, pages } = retokenize(
        article.content,
        displayMode,
        newMode,
        customCharWidthRef.current,
        linesPerPageRef.current
      );
      setSaccadePages(pages);

      // Try to preserve approximate position
      const progress = chunks.length > 0 ? currentChunkIndex / chunks.length : 0;
      const newIndex = Math.floor(progress * newChunks.length);
      setChunks(newChunks);
      setCurrentChunkIndex(Math.min(newIndex, newChunks.length - 1));
    }
  }, [article, displayMode, chunks.length, currentChunkIndex, retokenize]);

  const handleSetDisplayMode = useCallback((newDisplayMode: DisplayMode) => {
    const prevDisplayMode = displayModeRef.current;
    setDisplayModeState(newDisplayMode);

    if (article) {
      // Save prediction position when leaving prediction mode
      if (prevDisplayMode === 'prediction') {
        predictionWordIndexRef.current = indexRef.current;
        updateArticlePredictionPosition(article.id, indexRef.current);
      }

      // Prediction mode forces word tokenization
      const effectiveMode = newDisplayMode === 'prediction' ? 'word' : mode;

      const { chunks: newChunks, pages } = retokenize(
        article.content,
        newDisplayMode,
        effectiveMode,
        customCharWidthRef.current,
        linesPerPageRef.current
      );
      setSaccadePages(pages);

      if (newDisplayMode === 'prediction') {
        // Entering prediction: load word index (from ref or localStorage)
        const savedIndex = predictionWordIndexRef.current ||
                           article.predictionPosition || 0;
        setCurrentChunkIndex(Math.min(savedIndex, newChunks.length - 1));
        // Reset stats when entering prediction mode
        setPredictionStats({
          totalWords: 0,
          exactMatches: 0,
          averageLoss: 0,
        });
      } else if (newDisplayMode === 'recall') {
        // Entering recall: start from beginning, reset stats
        setCurrentChunkIndex(0);
        setPredictionStats({
          totalWords: 0,
          exactMatches: 0,
          averageLoss: 0,
        });
      } else {
        // Entering RSVP/Saccade: use ratio-based mapping
        const progress = chunks.length > 0 ? currentChunkIndex / chunks.length : 0;
        const newIndex = Math.floor(progress * newChunks.length);
        setCurrentChunkIndex(Math.min(newIndex, newChunks.length - 1));
      }

      setChunks(newChunks);
    }
  }, [article, mode, chunks.length, currentChunkIndex, retokenize]);

  const setCustomCharWidth = useCallback((width: number) => {
    setCustomCharWidthState(width);
    if (article && mode === 'custom') {
      const { chunks: newChunks, pages } = retokenize(
        article.content,
        displayMode,
        'custom',
        width,
        linesPerPageRef.current
      );
      setSaccadePages(pages);

      // Try to preserve approximate position
      const progress = chunks.length > 0 ? currentChunkIndex / chunks.length : 0;
      const newIndex = Math.floor(progress * newChunks.length);
      setChunks(newChunks);
      setCurrentChunkIndex(Math.min(newIndex, newChunks.length - 1));
    }
  }, [article, mode, displayMode, chunks.length, currentChunkIndex, retokenize]);

  const setLinesPerPage = useCallback((lines: number) => {
    setLinesPerPageState(lines);
    if (article && (displayMode === 'saccade' || displayMode === 'recall')) {
      const { chunks: newChunks, pages } = retokenize(
        article.content,
        displayMode,
        mode,
        customCharWidthRef.current,
        lines
      );
      setSaccadePages(pages);

      const progress = chunks.length > 0 ? currentChunkIndex / chunks.length : 0;
      const newIndex = Math.floor(progress * newChunks.length);
      setChunks(newChunks);
      setCurrentChunkIndex(Math.min(newIndex, newChunks.length - 1));
    }
  }, [article, displayMode, mode, chunks.length, currentChunkIndex, retokenize]);

  const loadArticle = useCallback((newArticle: Article) => {
    pause();
    setArticle(newArticle);

    const { chunks: newChunks, pages } = retokenize(
      newArticle.content,
      displayModeRef.current,
      modeRef.current,
      customCharWidthRef.current,
      linesPerPageRef.current
    );
    setSaccadePages(pages);
    setChunks(newChunks);

    // Resume from saved position if available
    const startIndex = newArticle.readPosition || 0;
    setCurrentChunkIndex(Math.min(startIndex, newChunks.length - 1));
  }, [pause, retokenize]);

  const reset = useCallback(() => {
    pause();
    setCurrentChunkIndex(0);
  }, [pause]);

  // Prediction mode handlers
  const handlePredictionResult = useCallback((result: PredictionResult) => {
    setPredictionStats(prev => {
      const totalWords = prev.totalWords + 1;
      const correct = isExactMatch(result.predicted, result.actual);
      const exactMatches = prev.exactMatches + (correct ? 1 : 0);
      const totalLoss = prev.averageLoss * prev.totalWords + result.loss;

      return {
        totalWords,
        exactMatches,
        averageLoss: totalWords > 0 ? totalLoss / totalWords : 0,
      };
    });
  }, []);

  const resetPredictionStats = useCallback(() => {
    setPredictionStats({
      totalWords: 0,
      exactMatches: 0,
      averageLoss: 0,
    });
    setCurrentChunkIndex(0);
  }, []);

  const advanceSelfPaced = useCallback(() => {
    setCurrentChunkIndex(prevIndex => {
      const total = chunksRef.current.length;
      if (total === 0) {
        return 0;
      }
      if (prevIndex >= total) {
        return total;
      }
      const nextIndex = prevIndex + 1;
      return nextIndex > total ? total : nextIndex;
    });
  }, []);

  // Compute current saccade page
  const currentChunk = chunks[currentChunkIndex] ?? null;
  const currentSaccadePageIndex = useMemo(() => {
    if (displayMode !== 'saccade' || !currentChunk?.saccade) return 0;
    return currentChunk.saccade.pageIndex;
  }, [displayMode, currentChunk]);

  const currentSaccadePage = useMemo(() => {
    if (displayMode !== 'saccade') return null;
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
  };
}
