import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import type { Article, Chunk, TrainingParagraphResult, SaccadePacerStyle, SaccadeFocusTarget } from '../types';
import type { CorpusArticle, CorpusFamily, CorpusInfo, CorpusTier } from '../types/electron';
import { segmentIntoParagraphs, segmentIntoSentences, tokenizeParagraphSaccade, tokenizeParagraphRecall, calculateSaccadeLineDuration, countWords } from '../lib/saccade';
import { isExactMatch, isWordKnown, isDetailWord } from '../lib/levenshtein';
import { loadTrainingHistory, saveTrainingHistory, loadDrillState, saveDrillState } from '../lib/storage';
import { adjustDrillDifficulty, getDrillRound, MIN_CHAR_LIMIT } from '../lib/trainingDrill';
import type { TrainingHistory, DrillState } from '../lib/storage';
import { SaccadeLineComponent } from './SaccadeReader';

type TrainingPhase = 'setup' | 'reading' | 'recall' | 'feedback' | 'complete';
type DrillMode = 'article' | 'random';

const SESSION_PRESETS = [
  { label: 'Until I stop', value: null },
  { label: '5 min', value: 5 * 60 },
  { label: '10 min', value: 10 * 60 },
  { label: '20 min', value: 20 * 60 },
] as const;
const DRILL_TIERS: CorpusTier[] = ['easy', 'medium', 'hard'];
const DRILL_FAMILIES: Array<{ id: CorpusFamily; label: string }> = [
  { id: 'wiki', label: 'Wikipedia' },
  { id: 'prose', label: 'Prose' },
];

interface TrainingReaderProps {
  article?: Article;
  initialWpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadePacerStyle?: SaccadePacerStyle;
  saccadeFocusTarget?: SaccadeFocusTarget;
  saccadeMergeShortFunctionWords?: boolean;
  saccadeLength?: number;
  onClose: () => void;
  onWpmChange: (wpm: number) => void;
  onSelectArticle?: () => void;
}

type WordKey = string;
function makeWordKey(lineIndex: number, startChar: number): WordKey {
  return `0:${lineIndex}:${startChar}`;
}

interface CompletedWord {
  text: string;
  correct: boolean;
}

interface ParagraphStats {
  totalWords: number;
  exactMatches: number;
  knownWords: number;
  detailTotal: number;
  detailKnown: number;
}

export function TrainingReader({
  article,
  initialWpm,
  saccadeShowOVP,
  saccadeShowSweep,
  saccadePacerStyle,
  saccadeFocusTarget,
  saccadeMergeShortFunctionWords,
  saccadeLength,
  onClose,
  onWpmChange,
  onSelectArticle,
}: TrainingReaderProps) {
  const paragraphs = useMemo(
    () => article ? segmentIntoParagraphs(article.content) : [],
    [article]
  );

  const [trainingHistory, setTrainingHistory] = useState<TrainingHistory>(
    () => article ? loadTrainingHistory(article.id) : {}
  );

  // Paragraph previews for setup TOC
  const paragraphPreviews = useMemo(
    () => paragraphs.map(p => {
      const words = countWords(p);
      const preview = p.length > 60 ? p.slice(0, 57) + '...' : p;
      return { preview, words };
    }),
    [paragraphs]
  );

  // Load persisted drill state once on mount (used as defaults below)
  const [savedDrill] = useState<DrillState | null>(() => loadDrillState());

  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [phase, setPhase] = useState<TrainingPhase>('setup');
  const [wpm, setWpm] = useState(savedDrill?.wpm ?? initialWpm);
  const [paused, setPaused] = useState(false);

  // Sentence mode: cycle read→recall per sentence within a paragraph
  const [sentenceMode, setSentenceModeState] = useState(() => {
    try { return localStorage.getItem('speedread_training_sentence') === 'true'; } catch { return false; }
  });
  const setSentenceMode = useCallback((on: boolean) => {
    setSentenceModeState(on);
    try { localStorage.setItem('speedread_training_sentence', String(on)); } catch {
      // Ignore storage failures (private mode, quota).
    }
  }, []);
  // Score details toggle: include proper nouns / numbers in the score
  const [scoreDetails, setScoreDetailsState] = useState(() => {
    try { return localStorage.getItem('speedread_training_score_details') === 'true'; } catch { return false; }
  });
  const setScoreDetails = useCallback((on: boolean) => {
    setScoreDetailsState(on);
    try { localStorage.setItem('speedread_training_score_details', String(on)); } catch {
      // Ignore storage failures (private mode, quota).
    }
  }, []);
  // Recall scaffold toggle: first-letter hints on/off.
  const [showFirstLetterScaffold, setShowFirstLetterScaffoldState] = useState(() => {
    try {
      const saved = localStorage.getItem('speedread_training_scaffold');
      return saved == null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const setShowFirstLetterScaffold = useCallback((on: boolean) => {
    setShowFirstLetterScaffoldState(on);
    try { localStorage.setItem('speedread_training_scaffold', String(on)); } catch {
      // Ignore storage failures (private mode, quota).
    }
  }, []);

  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);

  // Reading phase state
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [readingLeadIn, setReadingLeadIn] = useState(false);
  const readingStepRef = useRef(0);

  // Recall phase state
  const [recallInput, setRecallInput] = useState('');
  const [recallWordIndex, setRecallWordIndex] = useState(0);
  const [showingMiss, setShowingMiss] = useState(false);
  const [lastMissResult, setLastMissResult] = useState<{ predicted: string; actual: string } | null>(null);
  const [completedWords, setCompletedWords] = useState<Map<WordKey, CompletedWord>>(new Map());
  const [paragraphStats, setParagraphStats] = useState<ParagraphStats>({ totalWords: 0, exactMatches: 0, knownWords: 0, detailTotal: 0, detailKnown: 0 });

  // Session history
  const [sessionHistory, setSessionHistory] = useState<TrainingParagraphResult[]>([]);

  // --- Random Drill state ---
  const [drillMode, setDrillMode] = useState<DrillMode>('article');
  const [drillCorpusFamily, setDrillCorpusFamily] = useState<CorpusFamily>(() => savedDrill?.corpusFamily ?? 'wiki');
  const [drillTier, setDrillTier] = useState<CorpusTier>(() => savedDrill?.tier ?? 'hard');
  const [corpusInfo, setCorpusInfo] = useState<CorpusInfo | null>(null);
  const [drillArticle, setDrillArticle] = useState<CorpusArticle | null>(null);
  const [drillSentenceIndex, setDrillSentenceIndex] = useState(0);
  const [charLimit, setCharLimit] = useState(() => savedDrill?.charLimit ?? MIN_CHAR_LIMIT);
  const [autoAdjustDifficulty, setAutoAdjustDifficulty] = useState(() => savedDrill?.autoAdjustDifficulty ?? false);
  const [sessionTimeLimit, setSessionTimeLimit] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [rollingScores, setRollingScores] = useState<number[]>(() => savedDrill?.rollingScores ?? []);
  const [drillRoundsCompleted, setDrillRoundsCompleted] = useState(0);
  const [drillScoreSum, setDrillScoreSum] = useState(0);
  const [drillWpmStart, setDrillWpmStart] = useState(initialWpm);
  const [feedbackText, setFeedbackText] = useState('');

  const isDrill = drillMode === 'random';

  // Check corpus availability on mount
  useEffect(() => {
    window.corpus?.getInfo().then(info => setCorpusInfo(info ?? null));
  }, []);

  // Persist cross-session drill state whenever it changes
  useEffect(() => {
    saveDrillState({
      wpm,
      charLimit,
      rollingScores,
      corpusFamily: drillCorpusFamily,
      tier: drillTier,
      autoAdjustDifficulty,
    });
  }, [wpm, charLimit, rollingScores, drillCorpusFamily, drillTier, autoAdjustDifficulty]);

  // Keep selected tier valid for the selected corpus family.
  useEffect(() => {
    const familyInfo = corpusInfo?.[drillCorpusFamily];
    if (!familyInfo) return;
    if (familyInfo[drillTier]?.available) return;
    const fallbackTier = DRILL_TIERS.find(t => familyInfo[t]?.available);
    if (fallbackTier) setDrillTier(fallbackTier);
  }, [corpusInfo, drillCorpusFamily, drillTier]);

  const inputRef = useRef<HTMLInputElement>(null);
  const inputContainerRef = useRef<HTMLSpanElement>(null);
  const lastDrillAdjRef = useRef({ wpmDelta: 0, charDelta: 0 });
  const lastDetailCountRef = useRef(0);

  const currentParagraph = paragraphs[currentParagraphIndex] ?? '';

  // Sentence chunks: in sentence mode, split paragraph; otherwise just [paragraph]
  const sentenceChunks = useMemo(
    () => sentenceMode ? segmentIntoSentences(currentParagraph) : [currentParagraph],
    [currentParagraph, sentenceMode]
  );
  // Drill: split article into sentences, extract current round's text
  const drillSentences = useMemo(
    () => drillArticle ? segmentIntoSentences(drillArticle.text) : [],
    [drillArticle]
  );
  const articleId = article?.id;

  const { drillRoundText, drillRoundSentenceCount } = useMemo(() => {
    if (!isDrill) return { drillRoundText: '', drillRoundSentenceCount: 0 };
    const round = getDrillRound(drillSentences, drillSentenceIndex, charLimit, autoAdjustDifficulty);
    return { drillRoundText: round.text, drillRoundSentenceCount: round.sentenceCount };
  }, [isDrill, drillSentences, drillSentenceIndex, charLimit, autoAdjustDifficulty]);

  const currentText = isDrill && drillArticle
    ? drillRoundText
    : (sentenceChunks[currentSentenceIndex] ?? currentParagraph);

  // Saccade data for reading phase
  const saccadeData = useMemo(
    () => tokenizeParagraphSaccade(currentText),
    [currentText]
  );

  // Recall data for recall phase
  const recallData = useMemo(
    () => tokenizeParagraphRecall(currentText),
    [currentText]
  );

  const currentRecallChunk = recallData.chunks[recallWordIndex] ?? null;

  // Determine if a recall chunk is a detail word (proper noun or number)
  const isChunkDetail = useCallback((chunkIndex: number) => {
    const chunk = recallData.chunks[chunkIndex];
    if (!chunk) return false;
    const isFirst = chunkIndex === 0 ||
      /[.?!]$/.test(recallData.chunks[chunkIndex - 1].text);
    return isDetailWord(chunk.text, isFirst);
  }, [recallData.chunks]);

  // --- Reading phase timer ---
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find non-blank line indices
  const bodyLineIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < saccadeData.page.lines.length; i++) {
      const line = saccadeData.page.lines[i];
      if (line.type !== 'blank' && line.text.trim().length > 0) {
        indices.push(i);
      }
    }
    return indices;
  }, [saccadeData.page.lines]);

  // Lead-in: show text with static ORPs for 1s before sweep begins
  useEffect(() => {
    if (phase !== 'reading' || paused || !readingLeadIn) return;

    timerRef.current = setTimeout(() => setReadingLeadIn(false), 500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, paused, readingLeadIn]);

  // Sweep timer: runs after lead-in completes
  useEffect(() => {
    if (phase !== 'reading' || paused || readingLeadIn) return;

    if (bodyLineIndices.length === 0) {
      setPhase('recall');
      return;
    }

    function advanceLine() {
      const step = readingStepRef.current;
      if (step >= bodyLineIndices.length) {
        readingStepRef.current = 0;
        setCurrentLineIndex(-1);
        setPhase('recall');
        return;
      }

      const lineIdx = bodyLineIndices[step];
      setCurrentLineIndex(lineIdx);

      const lineText = saccadeData.page.lines[lineIdx].text;
      const duration = calculateSaccadeLineDuration(lineText.length, wpm);

      readingStepRef.current = step + 1;
      timerRef.current = setTimeout(advanceLine, duration);
    }

    advanceLine();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, paused, readingLeadIn, bodyLineIndices, saccadeData.page.lines, wpm, currentParagraphIndex]);

  // Focus input when entering recall phase
  useEffect(() => {
    if (phase === 'recall' && !showingMiss) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase, showingMiss, recallWordIndex]);

  // Scroll current word into view
  useEffect(() => {
    if (phase === 'recall' && inputContainerRef.current) {
      inputContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [phase, recallWordIndex]);

  // --- Recall handlers ---
  const finishRecallPhase = useCallback((stats: ParagraphStats, finalWord: { known: boolean; exact: boolean; isDetail: boolean } | null) => {
    // Compute final stats including the last word
    let totalWords = stats.totalWords;
    let exactMatches = stats.exactMatches;
    let knownWords = stats.knownWords;
    let detailTotal = stats.detailTotal;
    let detailKnown = stats.detailKnown;

    if (finalWord) {
      totalWords += 1;
      exactMatches += finalWord.exact ? 1 : 0;
      knownWords += finalWord.known ? 1 : 0;
      if (finalWord.isDetail) {
        detailTotal += 1;
        detailKnown += finalWord.known ? 1 : 0;
      }
    }

    // Sentence mode: if more sentences remain, advance and loop back to reading (article mode only)
    if (!isDrill && sentenceMode && currentSentenceIndex < sentenceChunks.length - 1) {
      setParagraphStats({ totalWords, exactMatches, knownWords, detailTotal, detailKnown });
      setCurrentSentenceIndex(prev => prev + 1);
      setRecallInput('');
      setRecallWordIndex(0);
      setCompletedWords(new Map());
      setShowingMiss(false);
      setLastMissResult(null);
      setCurrentLineIndex(-1);
      readingStepRef.current = 0;
      setReadingLeadIn(true);
      setPhase('reading');
      return;
    }

    // Effective score: exclude detail words unless scoreDetails is on
    const effectiveTotal = scoreDetails ? totalWords : totalWords - detailTotal;
    const effectiveKnown = scoreDetails ? knownWords : knownWords - detailKnown;
    const score = effectiveTotal > 0 ? Math.round((effectiveKnown / effectiveTotal) * 100) : 0;
    const scoreNorm = score / 100;
    // Snapshot the exact just-completed text so feedback remains stable
    // even if adaptive drill settings change before render.
    setFeedbackText(currentText);

    if (isDrill) {
      // Random drill: track stats, apply difficulty ladder
      setDrillRoundsCompleted(n => n + 1);
      setDrillScoreSum(s => s + scoreNorm);
      setRollingScores(prev => [...prev, scoreNorm]);

      if (autoAdjustDifficulty && (score < 90 || score >= 95)) {
        const adjustment = adjustDrillDifficulty(wpm, charLimit, score >= 95);
        lastDrillAdjRef.current = { wpmDelta: adjustment.wpm - wpm, charDelta: adjustment.charLimit - charLimit };
        if (adjustment.wpm !== wpm) { setWpm(adjustment.wpm); onWpmChange(adjustment.wpm); }
        if (adjustment.charLimit !== charLimit) setCharLimit(adjustment.charLimit);
      } else {
        lastDrillAdjRef.current = { wpmDelta: 0, charDelta: 0 };
      }
    } else {
      // Article mode: persist to training history
      const result: TrainingParagraphResult = {
        paragraphIndex: currentParagraphIndex,
        score: scoreNorm,
        wpm,
        repeated: sessionHistory.some(r => r.paragraphIndex === currentParagraphIndex),
        wordCount: totalWords,
        exactMatches,
      };

      setSessionHistory(prev => [...prev, result]);

      setTrainingHistory(prev => {
        const updated = { ...prev, [currentParagraphIndex]: { score: scoreNorm, wpm, timestamp: Date.now() } };
        if (articleId) saveTrainingHistory(articleId, updated);
        return updated;
      });

      // Article mode WPM adjustment
      let newWpm = wpm;
      if (score < 90) {
        newWpm = Math.max(100, wpm - 25);
      } else if (score >= 95) {
        newWpm = Math.min(800, wpm + 15);
      }
      setWpm(newWpm);
      onWpmChange(newWpm);
    }

    lastDetailCountRef.current = detailTotal;
    setPhase('feedback');
  }, [isDrill, currentParagraphIndex, wpm, charLimit, autoAdjustDifficulty, sessionHistory, onWpmChange, articleId, sentenceMode, currentSentenceIndex, sentenceChunks.length, scoreDetails, currentText]);

  const processRecallTokens = useCallback((tokens: string[]) => {
    if (tokens.length === 0) return false;

    const nextCompleted = new Map(completedWords);
    let nextStats = { ...paragraphStats };
    let nextRecallIndex = recallWordIndex;

    for (const token of tokens) {
      const chunk = recallData.chunks[nextRecallIndex];
      if (!chunk) break;

      const actual = chunk.text;
      const known = isWordKnown(token, actual);
      const exact = isExactMatch(token, actual);
      const detail = isChunkDetail(nextRecallIndex);

      const key = makeWordKey(
        chunk.saccade!.lineIndex,
        chunk.saccade!.startChar
      );

      nextCompleted.set(key, { text: actual, correct: known });
      nextStats = {
        totalWords: nextStats.totalWords + 1,
        exactMatches: nextStats.exactMatches + (exact ? 1 : 0),
        knownWords: nextStats.knownWords + (known ? 1 : 0),
        detailTotal: nextStats.detailTotal + (detail ? 1 : 0),
        detailKnown: nextStats.detailKnown + (known && detail ? 1 : 0),
      };
      nextRecallIndex += 1;
    }

    setCompletedWords(nextCompleted);
    setParagraphStats(nextStats);

    if (nextRecallIndex >= recallData.chunks.length) {
      setRecallWordIndex(recallData.chunks.length);
      finishRecallPhase(nextStats, null);
      return true;
    }

    setRecallWordIndex(nextRecallIndex);
    return false;
  }, [completedWords, paragraphStats, recallWordIndex, recallData.chunks, finishRecallPhase, isChunkDetail]);

  const handleRecallInputChange = useCallback((value: string) => {
    // Scaffold mode remains single-token input (no spaces).
    if (showFirstLetterScaffold) {
      setRecallInput(value.replace(/\s/g, ''));
      return;
    }

    // No-scaffold mode: consume complete space-delimited tokens immediately.
    const endsWithSpace = /\s$/.test(value);
    const parts = value.split(/\s+/);
    const completeTokens = (endsWithSpace ? parts : parts.slice(0, -1)).filter(Boolean);
    const pendingToken = endsWithSpace ? '' : (parts[parts.length - 1] || '');

    if (completeTokens.length > 0) {
      const finished = processRecallTokens(completeTokens);
      if (finished) {
        setRecallInput('');
        return;
      }
    }

    setRecallInput(pendingToken);
  }, [showFirstLetterScaffold, processRecallTokens]);

  const handleRecallSubmit = useCallback(() => {
    if (!currentRecallChunk || recallInput.trim() === '') return;

    // No-scaffold mode: submit current in-progress token (prediction-style flow).
    if (!showFirstLetterScaffold) {
      processRecallTokens([recallInput.trim()]);
      setRecallInput('');
      setLastMissResult(null);
      setShowingMiss(false);
      return;
    }

    const actual = currentRecallChunk.text;
    const known = isWordKnown(recallInput, actual);
    const exact = isExactMatch(recallInput, actual);
    const detail = isChunkDetail(recallWordIndex);

    const key = makeWordKey(
      currentRecallChunk.saccade!.lineIndex,
      currentRecallChunk.saccade!.startChar
    );

    if (known) {
      setCompletedWords(prev => new Map(prev).set(key, { text: actual, correct: true }));
      setRecallInput('');

      const nextIdx = recallWordIndex + 1;
      if (nextIdx >= recallData.chunks.length) {
        finishRecallPhase(paragraphStats, { known: true, exact, isDetail: detail });
      } else {
        setParagraphStats(prev => ({
          totalWords: prev.totalWords + 1,
          exactMatches: prev.exactMatches + (exact ? 1 : 0),
          knownWords: prev.knownWords + 1,
          detailTotal: prev.detailTotal + (detail ? 1 : 0),
          detailKnown: prev.detailKnown + (detail ? 1 : 0),
        }));
        setRecallWordIndex(nextIdx);
      }
    } else {
      setCompletedWords(prev => new Map(prev).set(key, { text: actual, correct: false }));

      // In random drill mode, keep flow uninterrupted: mark wrong inline and continue.
      if (isDrill) {
        setRecallInput('');
        setLastMissResult(null);
        setShowingMiss(false);

        const nextIdx = recallWordIndex + 1;
        if (nextIdx >= recallData.chunks.length) {
          finishRecallPhase(paragraphStats, { known: false, exact: false, isDetail: detail });
        } else {
          setParagraphStats(prev => ({
            totalWords: prev.totalWords + 1,
            exactMatches: prev.exactMatches,
            knownWords: prev.knownWords,
            detailTotal: prev.detailTotal + (detail ? 1 : 0),
            detailKnown: prev.detailKnown,
          }));
          setRecallWordIndex(nextIdx);
        }
      } else {
        setLastMissResult({ predicted: recallInput.trim(), actual });
        setShowingMiss(true);
      }
    }
  }, [
    recallInput,
    currentRecallChunk,
    recallWordIndex,
    recallData.chunks,
    paragraphStats,
    finishRecallPhase,
    isChunkDetail,
    isDrill,
    showFirstLetterScaffold,
    processRecallTokens,
  ]);

  const handleGiveUp = useCallback(() => {
    // Score all remaining words (including current) as misses
    const remaining = recallData.chunks.length - recallWordIndex;
    // Count detail words among remaining (missed) chunks
    let remainingDetails = 0;
    for (let i = recallWordIndex; i < recallData.chunks.length; i++) {
      if (isChunkDetail(i)) remainingDetails++;
    }
    finishRecallPhase({
      totalWords: paragraphStats.totalWords + remaining,
      exactMatches: paragraphStats.exactMatches,
      knownWords: paragraphStats.knownWords,
      detailTotal: paragraphStats.detailTotal + remainingDetails,
      detailKnown: paragraphStats.detailKnown,
    }, null);
  }, [recallWordIndex, recallData.chunks.length, paragraphStats, finishRecallPhase, isChunkDetail]);

  const handleMissContinue = useCallback(() => {
    setShowingMiss(false);
    setLastMissResult(null);
    setRecallInput('');

    const detail = isChunkDetail(recallWordIndex);
    const nextIdx = recallWordIndex + 1;
    if (nextIdx >= recallData.chunks.length) {
      finishRecallPhase(paragraphStats, { known: false, exact: false, isDetail: detail });
    } else {
      setParagraphStats(prev => ({
        totalWords: prev.totalWords + 1,
        exactMatches: prev.exactMatches,
        knownWords: prev.knownWords,
        detailTotal: prev.detailTotal + (detail ? 1 : 0),
        detailKnown: prev.detailKnown,
      }));
      setRecallWordIndex(nextIdx);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [recallWordIndex, recallData.chunks.length, paragraphStats, finishRecallPhase, isChunkDetail]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    // Scaffold mode keeps per-word flow (Space/Enter submit).
    // No-scaffold mode allows spaces for full-sentence typing (Enter submit).
    const submitOnSpace = showFirstLetterScaffold;
    if ((submitOnSpace && e.key === ' ') || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleRecallSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleGiveUp();
    }
  }, [handleRecallSubmit, handleGiveUp, showFirstLetterScaffold]);

  // Global key listener for miss state
  useEffect(() => {
    if (showingMiss) {
      const handler = (e: globalThis.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleMissContinue();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [showingMiss, handleMissContinue]);

  // --- Feedback phase handlers ---
  const lastResult = sessionHistory[sessionHistory.length - 1];
  const lastArticleScore = lastResult ? Math.round(lastResult.score * 100) : 0;
  // In drill mode, use rolling scores; in article mode, use session history
  const lastScore = isDrill
    ? Math.round((rollingScores[rollingScores.length - 1] ?? 0) * 100)
    : lastArticleScore;
  const shouldRepeat = !isDrill && lastScore < 90;

  const handleContinue = useCallback(() => {
    // Reset recall state
    setRecallInput('');
    setRecallWordIndex(0);
    setShowingMiss(false);
    setLastMissResult(null);
    setCompletedWords(new Map());
    setParagraphStats({ totalWords: 0, exactMatches: 0, knownWords: 0, detailTotal: 0, detailKnown: 0 });
    setCurrentLineIndex(-1);
    readingStepRef.current = 0;
    setReadingLeadIn(true);
    setCurrentSentenceIndex(0);
    setFeedbackText('');

    if (isDrill) {
      // Check timed session expiry
      if (sessionTimeLimit != null && sessionStartTime != null) {
        const elapsed = (Date.now() - sessionStartTime) / 1000;
        if (elapsed >= sessionTimeLimit) {
          setPhase('complete');
          return;
        }
      }

      // Advance within article or fetch next
      const nextIdx = drillSentenceIndex + drillRoundSentenceCount;
      if (nextIdx < drillSentences.length) {
        setDrillSentenceIndex(nextIdx);
        setPhase('reading');
      } else {
        // Article exhausted — fetch next
        window.corpus?.sampleArticle(drillCorpusFamily, drillTier).then(article => {
          if (article) {
            setDrillArticle(article);
            setDrillSentenceIndex(0);
            setPhase('reading');
          } else {
            setPhase('complete');
          }
        });
      }
    } else if (shouldRepeat) {
      // Repeat same paragraph
      setPhase('reading');
    } else {
      const nextIdx = currentParagraphIndex + 1;
      if (nextIdx >= paragraphs.length) {
        setPhase('complete');
      } else {
        setCurrentParagraphIndex(nextIdx);
        setPhase('reading');
      }
    }
  }, [isDrill, shouldRepeat, currentParagraphIndex, paragraphs.length, sessionTimeLimit, sessionStartTime, drillSentenceIndex, drillRoundSentenceCount, drillSentences.length, drillCorpusFamily, drillTier]);

  const handleStart = useCallback(() => {
    readingStepRef.current = 0;
    setReadingLeadIn(true);
    setCurrentSentenceIndex(0);

    if (isDrill) {
      // Reset per-session counters (cross-session state persists from init)
      setDrillRoundsCompleted(0);
      setDrillScoreSum(0);
      setDrillWpmStart(wpm);
      setSessionStartTime(Date.now());
      setDrillSentenceIndex(0);

      window.corpus?.sampleArticle(drillCorpusFamily, drillTier).then(article => {
        if (article) {
          setDrillArticle(article);
          setPhase('reading');
        }
      });
    } else {
      setPhase('reading');
    }
  }, [isDrill, wpm, drillCorpusFamily, drillTier]);

  const handleReturnToSetup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPaused(false);
    setShowingMiss(false);
    setLastMissResult(null);
    setRecallInput('');
    setRecallWordIndex(0);
    setCompletedWords(new Map());
    setParagraphStats({ totalWords: 0, exactMatches: 0, knownWords: 0, detailTotal: 0, detailKnown: 0 });
    setCurrentLineIndex(-1);
    readingStepRef.current = 0;
    setCurrentSentenceIndex(0);
    setFeedbackText('');
    setPhase('setup');
  }, []);

  const togglePause = useCallback(() => {
    setPaused(p => !p);
  }, []);

  // Spacebar/Enter to continue from feedback screen
  // Delay listener registration to prevent the same keydown event (or a fast
  // key-repeat) that submitted the final recall word from immediately advancing
  // past the feedback screen before the user can read it.
  useEffect(() => {
    if (phase === 'feedback') {
      const handler = (e: globalThis.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleContinue();
        }
      };
      const timer = setTimeout(() => {
        window.addEventListener('keydown', handler);
      }, 200);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handler);
      };
    }
  }, [phase, handleContinue]);

  // Refocus input when unpausing recall
  useEffect(() => {
    if (phase === 'recall' && !paused && !showingMiss) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase, paused, showingMiss]);

  // --- Compute session summary ---
  const sessionSummary = useMemo(() => {
    if (sessionHistory.length === 0) return null;
    const totalWords = sessionHistory.reduce((s, r) => s + r.wordCount, 0);
    const totalExact = sessionHistory.reduce((s, r) => s + r.exactMatches, 0);
    const avgScore = Math.round(sessionHistory.reduce((s, r) => s + r.score, 0) / sessionHistory.length * 100);
    const repeats = sessionHistory.filter(r => r.repeated).length;
    const wpmStart = sessionHistory[0].wpm;
    const wpmEnd = wpm;
    return { totalWords, totalExact, avgScore, repeats, wpmStart, wpmEnd, paragraphCount: paragraphs.length };
  }, [sessionHistory, wpm, paragraphs.length]);

  // --- Render ---

  // Setup phase
  if (phase === 'setup') {
    const trainedCount = Object.keys(trainingHistory).length;
    const anyTierAvailable = corpusInfo != null && DRILL_FAMILIES.some(({ id }) =>
      DRILL_TIERS.some(t => corpusInfo[id]?.[t]?.available)
    );
    const selectedFamilyInfo = corpusInfo?.[drillCorpusFamily];
    const tierInfo = selectedFamilyInfo?.[drillTier];
    const drillPacingText = autoAdjustDifficulty
      ? 'WPM and round length adjust based on your comprehension score.'
      : 'WPM stays fixed at your setting and each round is one sentence.';
    const drillDescription = drillCorpusFamily === 'wiki'
      ? (drillTier === 'easy'
        ? 'Simple English Wikipedia (Good and Very Good articles). Read at saccade pace, then recall.'
        : drillTier === 'hard'
          ? 'Standard Wikipedia Good Article introductions. Read at saccade pace, then recall.'
          : 'Readability-graded Standard Wikipedia articles (familiar vocabulary, moderate sentence length). Read at saccade pace, then recall.')
      : (drillTier === 'easy'
        ? 'Short stories and essays, easiest readability tier. Read at saccade pace, then recall.'
        : drillTier === 'hard'
          ? 'Short stories and essays, hardest readability tier. Read at saccade pace, then recall.'
          : 'Short stories and essays, medium readability tier. Read at saccade pace, then recall.');
    return (
      <div className="training-reader">
        <div className="training-setup">
          <h2>Training Mode</h2>

          {anyTierAvailable && (
            <div className="training-mode-toggle">
              <button
                className={`training-mode-btn${!isDrill ? ' training-mode-active' : ''}`}
                onClick={() => setDrillMode('article')}
              >
                Article
              </button>
              <button
                className={`training-mode-btn${isDrill ? ' training-mode-active' : ''}`}
                onClick={() => setDrillMode('random')}
              >
                Random Drill
              </button>
            </div>
          )}

          <p className="training-setup-desc">
            {isDrill
              ? drillDescription
              : 'Read each paragraph at saccade pace, then recall its words.'
            }
            {' '}{isDrill ? drillPacingText : 'WPM adjusts based on your comprehension score.'}
          </p>

          <label className="training-setup-wpm">
            <span className="control-label">Speed:</span>
            <input
              type="range"
              min="100"
              max="800"
              step="10"
              value={wpm}
              onChange={e => { const v = Number(e.target.value); setWpm(v); onWpmChange(v); }}
              className="control-slider wpm-slider"
            />
            <span className="control-value">{wpm} WPM</span>
          </label>

          {isDrill ? (
            <>
              <div className="training-mode-toggle">
                {DRILL_FAMILIES.map(({ id, label }) => {
                  const available = DRILL_TIERS.some(t => corpusInfo?.[id]?.[t]?.available);
                  return (
                    <button
                      key={id}
                      className={`training-mode-btn${drillCorpusFamily === id ? ' training-mode-active' : ''}${!available ? ' training-mode-disabled' : ''}`}
                      onClick={() => available && setDrillCorpusFamily(id)}
                      disabled={!available}
                      title={available ? `Use ${label} corpus` : `${label} corpus not installed`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="training-mode-toggle">
                {DRILL_TIERS.map(t => {
                  const ti = selectedFamilyInfo?.[t];
                  const available = ti?.available ?? false;
                  return (
                    <button
                      key={t}
                      className={`training-mode-btn${drillTier === t ? ' training-mode-active' : ''}${!available ? ' training-mode-disabled' : ''}`}
                      onClick={() => available && setDrillTier(t)}
                      disabled={!available}
                      title={available ? `${ti!.totalArticles.toLocaleString()} articles` : 'Corpus not installed'}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  );
                })}
              </div>
              <label className="training-setup-wpm">
                <span className="control-label">Session:</span>
                <select
                  value={sessionTimeLimit ?? ''}
                  onChange={e => setSessionTimeLimit(e.target.value ? Number(e.target.value) : null)}
                  className="control-select"
                >
                  {SESSION_PRESETS.map(p => (
                    <option key={p.label} value={p.value ?? ''}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="training-setup-sentence">
                <input
                  type="checkbox"
                  checked={autoAdjustDifficulty}
                  onChange={e => setAutoAdjustDifficulty(e.target.checked)}
                />
                <span className="control-label">Auto-adjust drill difficulty</span>
              </label>
              <label className="training-setup-sentence">
                <input
                  type="checkbox"
                  checked={scoreDetails}
                  onChange={e => setScoreDetails(e.target.checked)}
                />
                <span className="control-label">Score names/dates</span>
              </label>
              <label className="training-setup-sentence">
                <input
                  type="checkbox"
                  checked={showFirstLetterScaffold}
                  onChange={e => setShowFirstLetterScaffold(e.target.checked)}
                />
                <span className="control-label">Show first-letter scaffolds</span>
              </label>
              <div className="training-setup-info">
                {(tierInfo?.totalArticles ?? 0).toLocaleString()} articles
              </div>
              <button
                onClick={handleStart}
                className="control-btn control-btn-primary"
                disabled={!tierInfo?.available}
              >
                Start Drill
              </button>
            </>
          ) : !article ? (
            <>
              <div className="training-setup-info">No article selected</div>
              {onSelectArticle && (
                <button onClick={onSelectArticle} className="control-btn control-btn-primary">
                  Select Article
                </button>
              )}
            </>
          ) : (
            <>
              <label className="training-setup-sentence">
                <input
                  type="checkbox"
                  checked={sentenceMode}
                  onChange={e => setSentenceMode(e.target.checked)}
                />
                <span className="control-label">Sentence mode</span>
              </label>
              <label className="training-setup-sentence">
                <input
                  type="checkbox"
                  checked={scoreDetails}
                  onChange={e => setScoreDetails(e.target.checked)}
                />
                <span className="control-label">Score names/dates</span>
              </label>
              <label className="training-setup-sentence">
                <input
                  type="checkbox"
                  checked={showFirstLetterScaffold}
                  onChange={e => setShowFirstLetterScaffold(e.target.checked)}
                />
                <span className="control-label">Show first-letter scaffolds</span>
              </label>
              <div className="training-setup-info">
                {paragraphs.length} paragraph{paragraphs.length !== 1 ? 's' : ''}
                {trainedCount > 0 && ` · ${trainedCount} trained`}
              </div>
              <div className="training-toc">
                {paragraphPreviews.map((p, i) => {
                  const hist = trainingHistory[i];
                  const isSelected = i === currentParagraphIndex;
                  return (
                    <button
                      key={i}
                      className={`training-toc-item${isSelected ? ' training-toc-selected' : ''}`}
                      onClick={() => setCurrentParagraphIndex(i)}
                    >
                      <span className="training-toc-num">{i + 1}</span>
                      <span className="training-toc-preview">{p.preview}</span>
                      <span className="training-toc-meta">
                        {p.words}w
                        {hist && (
                          <span className={`training-toc-score${hist.score >= 0.9 ? ' training-toc-pass' : ''}`}>
                            {' '}{Math.round(hist.score * 100)}%
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button onClick={handleStart} className="control-btn control-btn-primary">
                Start from {currentParagraphIndex + 1}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Complete phase
  if (phase === 'complete') {
    const drillAvgScore = drillRoundsCompleted > 0
      ? Math.round((drillScoreSum / drillRoundsCompleted) * 100)
      : 0;
    const drillDuration = sessionStartTime
      ? Math.round((Date.now() - sessionStartTime) / 1000)
      : 0;
    const drillMinutes = Math.floor(drillDuration / 60);
    const drillSeconds = drillDuration % 60;

    return (
      <div className="training-reader">
        <div className="training-complete">
          <h2>{isDrill ? 'Drill Complete' : 'Training Complete'}</h2>
          {isDrill ? (
            <div className="prediction-complete-stats">
              <div className="prediction-stat">
                <span className="prediction-stat-value">{drillRoundsCompleted}</span>
                <span className="prediction-stat-label">rounds</span>
              </div>
              <div className="prediction-stat">
                <span className="prediction-stat-value">{drillAvgScore}%</span>
                <span className="prediction-stat-label">avg score</span>
              </div>
              <div className="prediction-stat">
                <span className="prediction-stat-value">{drillWpmStart} → {wpm}</span>
                <span className="prediction-stat-label">WPM</span>
              </div>
              <div className="prediction-stat">
                <span className="prediction-stat-value">{drillMinutes}:{String(drillSeconds).padStart(2, '0')}</span>
                <span className="prediction-stat-label">duration</span>
              </div>
            </div>
          ) : sessionSummary && (
            <div className="prediction-complete-stats">
              <div className="prediction-stat">
                <span className="prediction-stat-value">{sessionSummary.paragraphCount}</span>
                <span className="prediction-stat-label">paragraphs</span>
              </div>
              <div className="prediction-stat">
                <span className="prediction-stat-value">{sessionSummary.totalWords}</span>
                <span className="prediction-stat-label">words recalled</span>
              </div>
              <div className="prediction-stat">
                <span className="prediction-stat-value">{sessionSummary.avgScore}%</span>
                <span className="prediction-stat-label">avg score</span>
              </div>
              <div className="prediction-stat">
                <span className="prediction-stat-value">{sessionSummary.wpmStart} → {sessionSummary.wpmEnd}</span>
                <span className="prediction-stat-label">WPM</span>
              </div>
              {sessionSummary.repeats > 0 && (
                <div className="prediction-stat">
                  <span className="prediction-stat-value">{sessionSummary.repeats}</span>
                  <span className="prediction-stat-label">repeats</span>
                </div>
              )}
            </div>
          )}
          <div className="prediction-complete-actions">
            <button onClick={handleReturnToSetup} className="control-btn control-btn-primary">
              {isDrill ? 'Drill Again' : 'Close'}
            </button>
            {isDrill && (
              <button onClick={onClose} className="control-btn">
                Exit
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Feedback phase
  if (phase === 'feedback') {
    const drillAdj = lastDrillAdjRef.current;
    const feedbackContextText = (feedbackText || currentText).trim();
    const articleWpmDelta = (() => {
      if (lastScore < 90) return -25;
      if (lastScore >= 95) return +15;
      return 0;
    })();

    return (
      <div className="training-reader">
        <div className="training-header">
          <span className="training-phase-label">Feedback</span>
          <span className="training-progress">
            {isDrill
              ? `${drillArticle?.title ?? ''} · ${Math.min(drillSentenceIndex + drillRoundSentenceCount, drillSentences.length)}/${drillSentences.length} · ${autoAdjustDifficulty ? `≤${charLimit}ch` : '1 sentence'}`
              : `Paragraph ${currentParagraphIndex + 1} / ${paragraphs.length}`
            }
          </span>
          <span className="training-wpm">{wpm} WPM</span>
          <button onClick={handleReturnToSetup} className="control-btn training-pause-btn" title="Return to setup">
            Exit
          </button>
        </div>
        <div className="training-feedback">
          <div className="training-score-value">{lastScore}%</div>
          {!isDrill && lastResult && (
            <div className="training-score-detail">
              {lastResult.exactMatches} / {lastResult.wordCount} exact
            </div>
          )}
          {isDrill && drillArticle && (
            <div className="training-score-detail">
              From: {drillArticle.title} ({drillArticle.domain})
            </div>
          )}
          {lastDetailCountRef.current > 0 && (
            <div className="training-score-detail">
              ({lastDetailCountRef.current} name{lastDetailCountRef.current !== 1 ? 's' : ''}/date{lastDetailCountRef.current !== 1 ? 's' : ''} {scoreDetails ? 'included' : 'excluded'})
            </div>
          )}
          {isDrill ? (
            <>
              {autoAdjustDifficulty && drillAdj.wpmDelta !== 0 && (
                <div className="training-wpm-change">
                  WPM {drillAdj.wpmDelta > 0 ? '+' : ''}{drillAdj.wpmDelta} → {wpm}
                </div>
              )}
              {autoAdjustDifficulty && drillAdj.charDelta !== 0 && (
                <div className="training-wpm-change">
                  Limit {drillAdj.charDelta > 0 ? '+' : ''}{drillAdj.charDelta} → {charLimit}ch
                </div>
              )}
            </>
          ) : (
            <>
              {articleWpmDelta !== 0 && (
                <div className="training-wpm-change">
                  WPM {articleWpmDelta > 0 ? '+' : ''}{articleWpmDelta} → {wpm}
                </div>
              )}
            </>
          )}
          {shouldRepeat && (
            <div className="training-repeat-notice">
              Score below 90% — repeating paragraph
            </div>
          )}
          {feedbackContextText && (
            <div className="training-feedback-context">
              <div className="training-feedback-context-label">Just read</div>
              <div className="training-feedback-context-text">{feedbackContextText}</div>
            </div>
          )}
          <button onClick={handleContinue} className="control-btn control-btn-primary">
            {isDrill ? 'Next' : shouldRepeat ? 'Retry' : currentParagraphIndex + 1 >= paragraphs.length ? 'Finish' : 'Continue'}
          </button>
          <div className="prediction-continue-hint">Press Space to continue</div>
        </div>
      </div>
    );
  }

  // Reading phase
  if (phase === 'reading') {
    return (
      <div className="training-reader">
        <div className="training-header">
          <span className="training-phase-label">{paused ? 'Paused' : 'Read'}</span>
          <span className="training-progress">
            {isDrill
              ? `${drillArticle?.title ?? ''} · ${Math.min(drillSentenceIndex + drillRoundSentenceCount, drillSentences.length)}/${drillSentences.length} · ${autoAdjustDifficulty ? `≤${charLimit}ch` : '1 sentence'}`
              : <>Paragraph {currentParagraphIndex + 1} / {paragraphs.length}
                {sentenceMode && sentenceChunks.length > 1 && ` · Sentence ${currentSentenceIndex + 1} / ${sentenceChunks.length}`}</>
            }
          </span>
          <span className="training-wpm">{wpm} WPM</span>
          <button onClick={togglePause} className="control-btn training-pause-btn">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button onClick={handleReturnToSetup} className="control-btn training-pause-btn" title="Return to paragraph list">
            Exit
          </button>
        </div>
        <div className="saccade-page">
          {saccadeData.page.lines.map((line, lineIndex) => (
            <SaccadeLineComponent
              key={lineIndex}
              line={line}
              lineIndex={lineIndex}
              isActiveLine={!paused && !readingLeadIn && lineIndex === currentLineIndex}
              isPlaying={!paused && !readingLeadIn}
              isFutureLine={!paused && !readingLeadIn && currentLineIndex >= 0 && lineIndex > currentLineIndex}
              showPacer={!paused && !readingLeadIn}
              wpm={wpm}
              saccadeShowOVP={saccadeShowOVP}
              saccadeShowSweep={saccadeShowSweep}
              saccadePacerStyle={saccadePacerStyle}
              saccadeFocusTarget={saccadeFocusTarget}
              saccadeMergeShortFunctionWords={saccadeMergeShortFunctionWords}
              saccadeLength={saccadeLength}
            />
          ))}
        </div>
      </div>
    );
  }

  // Recall phase
  const recallPage = recallData.page;
  const totalRecallWords = recallData.chunks.length;

  return (
    <div className="training-reader">
      <div className="training-header">
        <span className="training-phase-label">{paused ? 'Paused' : 'Recall'}</span>
        <span className="training-progress">
          {isDrill
            ? `${drillArticle?.title ?? ''} · ${Math.min(drillSentenceIndex + drillRoundSentenceCount, drillSentences.length)}/${drillSentences.length} · ${autoAdjustDifficulty ? `≤${charLimit}ch` : '1 sentence'} · ${recallWordIndex} / ${totalRecallWords} words`
            : sentenceMode && sentenceChunks.length > 1
              ? `Sentence ${currentSentenceIndex + 1} / ${sentenceChunks.length} · ${recallWordIndex} / ${totalRecallWords} words`
              : `${recallWordIndex} / ${totalRecallWords} words`
          }
        </span>
        <span className="training-wpm">{wpm} WPM</span>
        <button onClick={togglePause} className="control-btn training-pause-btn">
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button onClick={handleReturnToSetup} className="control-btn training-pause-btn" title="Return to paragraph list">
          Exit
        </button>
      </div>
      {paused ? (
        <div className="training-paused-overlay">
          <span className="training-paused-text">Paused</span>
        </div>
      ) : (
      <div className="saccade-page">
        {recallPage.lines.map((line, lineIndex) => {
          if (line.type === 'blank') {
            return (
              <div key={lineIndex} className="saccade-line">
                <span>{'\u00A0'}</span>
              </div>
            );
          }

          const isHeading = line.type === 'heading';
          const lineChunks = recallPage.lineChunks[lineIndex] || [];

          return (
            <div
              key={lineIndex}
              className={`saccade-line ${isHeading ? 'saccade-line-heading' : ''}`}
            >
              <TrainingRecallLine
                lineText={line.text}
                lineChunks={lineChunks}
                currentChunk={currentRecallChunk}
                completedWords={completedWords}
                showFirstLetterScaffold={showFirstLetterScaffold}
                isHeading={isHeading}
                showingMiss={showingMiss}
                input={recallInput}
                setInput={handleRecallInputChange}
                onKeyDown={handleKeyDown}
                inputRef={inputRef}
                inputContainerRef={inputContainerRef}
              />
            </div>
          );
        })}
      </div>
      )}

      {!paused && showingMiss && lastMissResult && (
        <div className="prediction-feedback">
          <div className="prediction-comparison">
            <span className="prediction-you-said">"{lastMissResult.predicted}"</span>
            <span className="prediction-arrow">→</span>
            <span className="prediction-actual">"{lastMissResult.actual}"</span>
          </div>
          <div className="prediction-continue-hint">
            Press Space to continue
          </div>
        </div>
      )}

      {!paused && !showingMiss && recallWordIndex > 0 && (
        <div className="prediction-continue-hint">
          Esc to skip remaining
        </div>
      )}
    </div>
  );
}

// --- Recall line rendering (inlined from RecallReader pattern) ---

interface TrainingRecallLineProps {
  lineText: string;
  lineChunks: Chunk[];
  currentChunk: Chunk | null;
  completedWords: Map<WordKey, CompletedWord>;
  showFirstLetterScaffold: boolean;
  isHeading: boolean;
  showingMiss: boolean;
  input: string;
  setInput: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  inputContainerRef: React.RefObject<HTMLSpanElement>;
}

function TrainingRecallLine({
  lineText,
  lineChunks,
  currentChunk,
  completedWords,
  showFirstLetterScaffold,
  isHeading,
  showingMiss,
  input,
  setInput,
  onKeyDown,
  inputRef,
  inputContainerRef,
}: TrainingRecallLineProps) {
  if (lineChunks.length === 0) {
    const className = isHeading ? 'saccade-heading' : 'saccade-body';
    return <span className={className}>{lineText || '\u00A0'}</span>;
  }

  const elements: JSX.Element[] = [];
  let lastEnd = 0;

  for (let i = 0; i < lineChunks.length; i++) {
    const chunk = lineChunks[i];
    const sac = chunk.saccade!;

    if (sac.startChar > lastEnd) {
      elements.push(
        <span key={`gap-${i}`} className="recall-space">
          {lineText.slice(lastEnd, sac.startChar)}
        </span>
      );
    }

    const isCurrent = currentChunk?.saccade &&
      sac.lineIndex === currentChunk.saccade.lineIndex &&
      sac.startChar === currentChunk.saccade.startChar;

    const wordKey = makeWordKey(sac.lineIndex, sac.startChar);
    const completed = completedWords.get(wordKey);

    if (completed) {
      const cls = isHeading
        ? completed.correct ? 'saccade-heading recall-correct' : 'saccade-heading recall-wrong'
        : completed.correct ? 'recall-correct' : 'recall-wrong';
      elements.push(
        <span key={`word-${i}`} className={cls}>{completed.text}</span>
      );
    } else if (isCurrent && !showingMiss) {
      const word = chunk.text;
      const firstLetter = word[0] || '';
      const rest = word.slice(1);
      elements.push(
        <span key={`word-${i}`} ref={inputContainerRef} className="recall-input-word">
          {showFirstLetterScaffold ? (
            <>
              <span className="recall-scaffold-first">{firstLetter}</span>
              <span className="recall-scaffold-rest">{rest}</span>
            </>
          ) : (
            <span className="recall-scaffold-rest">{word}</span>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(
              showFirstLetterScaffold
                ? e.target.value.replace(/\s/g, '')
                : e.target.value
            )}
            onKeyDown={onKeyDown}
            className="recall-input"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ width: `${Math.max(word.length, input.length || 1)}ch` }}
          />
        </span>
      );
    } else {
      const word = chunk.text;
      const firstLetter = word[0] || '';
      const rest = word.slice(1);
      const cls = isHeading ? 'saccade-heading' : '';
      elements.push(
        <span key={`word-${i}`} className={cls}>
          {showFirstLetterScaffold ? (
            <>
              <span className="recall-scaffold-first">{firstLetter}</span>
              <span className="recall-scaffold-rest">{rest}</span>
            </>
          ) : (
            <span className="recall-scaffold-rest">{word}</span>
          )}
        </span>
      );
    }

    lastEnd = sac.endChar;
  }

  if (lastEnd < lineText.length) {
    elements.push(
      <span key="trailing">{lineText.slice(lastEnd)}</span>
    );
  }

  return <>{elements}</>;
}
