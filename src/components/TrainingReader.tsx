import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import type { Article, Chunk, TrainingParagraphResult, SaccadePacerStyle, SaccadeFocusTarget } from '../types';
import type { CorpusArticle, CorpusFamily, CorpusInfo, CorpusTier } from '../types/electron';
import { segmentIntoParagraphs, segmentIntoSentences, tokenizeParagraphSaccade, tokenizeParagraphRecall, calculateSaccadeLineDuration, countWords } from '../lib/saccade';
import { isExactMatch, isWordKnown, isDetailWord } from '../lib/levenshtein';
import {
  loadTrainingHistory,
  saveTrainingHistory,
  loadDrillState,
  saveDrillState,
  loadTrainingSentenceMode,
  saveTrainingSentenceMode,
  loadTrainingScoreDetails,
  saveTrainingScoreDetails,
  loadTrainingScaffold,
  saveTrainingScaffold,
} from '../lib/storage';
import { DRILL_WPM_STEP, getDrillRound } from '../lib/trainingDrill';
import { planTrainingContinue, planTrainingStart } from '../lib/trainingPhase';
import {
  applyStatsDelta,
  buildRemainingMissStats,
  collectRemainingPreviewWordKeys,
  consumeRecallTokens,
  makeRecallWordKey,
  parseNoScaffoldRecallInput,
  planScaffoldMissContinue,
  planScaffoldRecallSubmission,
} from '../lib/trainingRecall';
import { planTrainingReadingStart, planTrainingReadingStep } from '../lib/trainingReading';
import type { TrainingFinalWord } from '../lib/trainingScoring';
import { planFinishRecallPhase } from '../lib/trainingFeedback';
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
const MIN_WPM = 100;
const MAX_WPM = 800;

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

interface CompletedWord {
  text: string;
  correct: boolean;
  forfeited?: boolean;
}

interface ParagraphStats {
  totalWords: number;
  exactMatches: number;
  knownWords: number;
  detailTotal: number;
  detailKnown: number;
}

function createEmptyParagraphStats(): ParagraphStats {
  return { totalWords: 0, exactMatches: 0, knownWords: 0, detailTotal: 0, detailKnown: 0 };
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
  const [sentenceMode, setSentenceModeState] = useState(() => loadTrainingSentenceMode());
  const setSentenceMode = useCallback((on: boolean) => {
    setSentenceModeState(on);
    saveTrainingSentenceMode(on);
  }, []);
  // Score details toggle: include proper nouns / numbers in the score
  const [scoreDetails, setScoreDetailsState] = useState(() => loadTrainingScoreDetails());
  const setScoreDetails = useCallback((on: boolean) => {
    setScoreDetailsState(on);
    saveTrainingScoreDetails(on);
  }, []);
  // Recall scaffold toggle: first-letter hints on/off.
  const [showFirstLetterScaffold, setShowFirstLetterScaffoldState] = useState(() => loadTrainingScaffold());
  const setShowFirstLetterScaffold = useCallback((on: boolean) => {
    setShowFirstLetterScaffoldState(on);
    saveTrainingScaffold(on);
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
  const [lastPreviewPenaltyCount, setLastPreviewPenaltyCount] = useState(0);
  const [drillForfeitedWordKeys, setDrillForfeitedWordKeys] = useState<Set<WordKey>>(new Set());
  const [drillPreviewWordKeys, setDrillPreviewWordKeys] = useState<WordKey[]>([]);
  const [drillPreviewVisibleCount, setDrillPreviewVisibleCount] = useState(0);
  const [completedWords, setCompletedWords] = useState<Map<WordKey, CompletedWord>>(new Map());
  const [paragraphStats, setParagraphStats] = useState<ParagraphStats>(createEmptyParagraphStats);

  // Session history
  const [sessionHistory, setSessionHistory] = useState<TrainingParagraphResult[]>([]);

  // --- Random Drill state ---
  const [drillMode, setDrillMode] = useState<DrillMode>('article');
  const [drillCorpusFamily, setDrillCorpusFamily] = useState<CorpusFamily>(() => savedDrill?.corpusFamily ?? 'wiki');
  const [drillTier, setDrillTier] = useState<CorpusTier>(() => savedDrill?.tier ?? 'hard');
  const [corpusInfo, setCorpusInfo] = useState<CorpusInfo | null>(null);
  const [drillArticle, setDrillArticle] = useState<CorpusArticle | null>(null);
  const [drillSentenceIndex, setDrillSentenceIndex] = useState(0);
  const [autoAdjustDifficulty, setAutoAdjustDifficulty] = useState(() => savedDrill?.autoAdjustDifficulty ?? false);
  const [drillMinWpm, setDrillMinWpm] = useState(() => savedDrill?.minWpm ?? Math.max(MIN_WPM, (savedDrill?.wpm ?? initialWpm) - 50));
  const [drillMaxWpm, setDrillMaxWpm] = useState(() => savedDrill?.maxWpm ?? Math.min(MAX_WPM, (savedDrill?.wpm ?? initialWpm) + 50));
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
    let cancelled = false;
    window.corpus?.getInfo()
      .then((info) => {
        if (cancelled) return;
        setCorpusInfo(info ?? null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('Failed to load corpus info', error);
        setCorpusInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist cross-session drill state whenever it changes
  useEffect(() => {
    saveDrillState({
      wpm,
      rollingScores,
      corpusFamily: drillCorpusFamily,
      tier: drillTier,
      minWpm: drillMinWpm,
      maxWpm: drillMaxWpm,
      autoAdjustDifficulty,
    });
  }, [wpm, rollingScores, drillCorpusFamily, drillTier, drillMinWpm, drillMaxWpm, autoAdjustDifficulty]);

  // Keep selected tier valid for the selected corpus family.
  useEffect(() => {
    const familyInfo = corpusInfo?.[drillCorpusFamily];
    if (!familyInfo) return;
    if (familyInfo[drillTier]?.available) return;
    const fallbackTier = DRILL_TIERS.find(t => familyInfo[t]?.available);
    if (fallbackTier) setDrillTier(fallbackTier);
  }, [corpusInfo, drillCorpusFamily, drillTier]);

  useEffect(() => {
    if (drillMinWpm > drillMaxWpm) {
      setDrillMaxWpm(drillMinWpm);
      return;
    }
    if (!autoAdjustDifficulty) return;
    if (wpm < drillMinWpm) {
      setWpm(drillMinWpm);
      onWpmChange(drillMinWpm);
    } else if (wpm > drillMaxWpm) {
      setWpm(drillMaxWpm);
      onWpmChange(drillMaxWpm);
    }
  }, [autoAdjustDifficulty, drillMinWpm, drillMaxWpm, wpm, onWpmChange]);

  const inputRef = useRef<HTMLInputElement>(null);
  const inputContainerRef = useRef<HTMLSpanElement>(null);
  const isMountedRef = useRef(true);
  const drillFetchRequestRef = useRef(0);
  const lastDrillAdjRef = useRef({ wpmDelta: 0 });
  const lastDetailCountRef = useRef(0);
  const drillPreviewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drillPreviewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      drillFetchRequestRef.current += 1;
    };
  }, []);

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
    const round = getDrillRound(drillSentences, drillSentenceIndex);
    return { drillRoundText: round.text, drillRoundSentenceCount: round.sentenceCount };
  }, [isDrill, drillSentences, drillSentenceIndex]);

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
  const isDrillPreviewing = drillPreviewWordKeys.length > 0;
  const drillPreviewVisibleWordKeys = useMemo(
    () => new Set(drillPreviewWordKeys.slice(0, drillPreviewVisibleCount)),
    [drillPreviewWordKeys, drillPreviewVisibleCount]
  );

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

    const readingStartPlan = planTrainingReadingStart(bodyLineIndices.length);
    if (readingStartPlan.type === 'to-recall') {
      setPhase('recall');
      return;
    }

    function advanceLine() {
      const step = readingStepRef.current;
      const stepPlan = planTrainingReadingStep(step, bodyLineIndices);
      if (stepPlan.type === 'to-recall') {
        readingStepRef.current = 0;
        setCurrentLineIndex(-1);
        setPhase('recall');
        return;
      }

      const lineIdx = stepPlan.lineIndex;
      setCurrentLineIndex(lineIdx);

      const lineText = saccadeData.page.lines[lineIdx].text;
      const duration = calculateSaccadeLineDuration(lineText.length, wpm);

      readingStepRef.current = stepPlan.nextStep;
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

  // Random drill Tab preview: reveal remaining words at current WPM, then hide.
  useEffect(() => {
    if (drillPreviewTimerRef.current) {
      clearInterval(drillPreviewTimerRef.current);
      drillPreviewTimerRef.current = null;
    }
    if (drillPreviewHideTimerRef.current) {
      clearTimeout(drillPreviewHideTimerRef.current);
      drillPreviewHideTimerRef.current = null;
    }
    if (drillPreviewWordKeys.length === 0) {
      setDrillPreviewVisibleCount(0);
      return;
    }

    const stepMs = Math.max(80, Math.round(60000 / Math.max(MIN_WPM, wpm)));
    let shown = 0;
    setDrillPreviewVisibleCount(0);

    drillPreviewTimerRef.current = setInterval(() => {
      shown += 1;
      setDrillPreviewVisibleCount(shown);
      if (shown >= drillPreviewWordKeys.length) {
        if (drillPreviewTimerRef.current) {
          clearInterval(drillPreviewTimerRef.current);
          drillPreviewTimerRef.current = null;
        }
        drillPreviewHideTimerRef.current = setTimeout(() => {
          setDrillPreviewWordKeys([]);
          setDrillPreviewVisibleCount(0);
          drillPreviewHideTimerRef.current = null;
        }, stepMs);
      }
    }, stepMs);

    return () => {
      if (drillPreviewTimerRef.current) {
        clearInterval(drillPreviewTimerRef.current);
        drillPreviewTimerRef.current = null;
      }
      if (drillPreviewHideTimerRef.current) {
        clearTimeout(drillPreviewHideTimerRef.current);
        drillPreviewHideTimerRef.current = null;
      }
    };
  }, [drillPreviewWordKeys, wpm]);

  // --- Recall handlers ---
  const finishRecallPhase = useCallback((stats: ParagraphStats, finalWord: TrainingFinalWord | null) => {
    const finishPlan = planFinishRecallPhase({
      stats,
      finalWord,
      isDrill,
      sentenceMode,
      currentSentenceIndex,
      sentenceCount: sentenceChunks.length,
      includeDetailsInScore: scoreDetails,
      currentParagraphIndex,
      wpm,
      autoAdjustDifficulty,
      drillMinWpm,
      drillMaxWpm,
      hasRepeatedParagraph: sessionHistory.some((result) => result.paragraphIndex === currentParagraphIndex),
    });

    if (finishPlan.type === 'advance-sentence') {
      setParagraphStats(finishPlan.finalStats);
      setCurrentSentenceIndex(finishPlan.nextSentenceIndex);
      setRecallInput('');
      setRecallWordIndex(0);
      setCompletedWords(new Map());
      setShowingMiss(false);
      setLastMissResult(null);
      setCurrentLineIndex(-1);
      readingStepRef.current = 0;
      setReadingLeadIn(true);
      setDrillForfeitedWordKeys(new Set());
      setDrillPreviewWordKeys([]);
      setDrillPreviewVisibleCount(0);
      setPhase('reading');
      return;
    }

    // Snapshot the exact just-completed text so feedback remains stable
    // even if adaptive drill settings change before render.
    setFeedbackText(currentText);

    if (finishPlan.mode === 'drill') {
      // Random drill: track stats, apply difficulty ladder
      setDrillRoundsCompleted(n => n + 1);
      setDrillScoreSum(s => s + finishPlan.score.scoreNorm);
      setRollingScores(prev => [...prev, finishPlan.score.scoreNorm]);

      lastDrillAdjRef.current = { wpmDelta: finishPlan.wpmDelta };
      if (finishPlan.shouldApplyWpmChange) {
        setWpm(finishPlan.nextWpm);
        onWpmChange(finishPlan.nextWpm);
      }
    } else {
      // Article mode: persist to training history
      setSessionHistory(prev => [...prev, finishPlan.sessionResult]);

      setTrainingHistory(prev => {
        const updated = {
          ...prev,
          [finishPlan.historyUpdate.paragraphIndex]: {
            score: finishPlan.historyUpdate.score,
            wpm: finishPlan.historyUpdate.wpm,
            timestamp: Date.now(),
          },
        };
        if (articleId) saveTrainingHistory(articleId, updated);
        return updated;
      });

      // Article mode WPM adjustment
      setWpm(finishPlan.nextWpm);
      onWpmChange(finishPlan.nextWpm);
    }

    lastDetailCountRef.current = finishPlan.lastDetailCount;
    setLastPreviewPenaltyCount(drillForfeitedWordKeys.size);
    setDrillForfeitedWordKeys(new Set());
    setDrillPreviewWordKeys([]);
    setDrillPreviewVisibleCount(0);
    setPhase('feedback');
  }, [
    articleId,
    autoAdjustDifficulty,
    currentParagraphIndex,
    currentSentenceIndex,
    currentText,
    drillForfeitedWordKeys,
    drillMaxWpm,
    drillMinWpm,
    isDrill,
    onWpmChange,
    scoreDetails,
    sentenceChunks.length,
    sentenceMode,
    sessionHistory,
    wpm,
  ]);

  const processRecallTokens = useCallback((tokens: string[]) => {
    if (tokens.length === 0) return false;

    const tokenPlan = consumeRecallTokens({
      tokens,
      chunks: recallData.chunks,
      startIndex: recallWordIndex,
      stats: paragraphStats,
      forfeitedWordKeys: drillForfeitedWordKeys,
      isWordKnown,
      isExactMatch,
      isDetailChunk: isChunkDetail,
    });

    setCompletedWords(prev => {
      const next = new Map(prev);
      for (const scored of tokenPlan.scoredWords) {
        next.set(scored.key, {
          text: scored.text,
          correct: scored.correct,
          forfeited: scored.forfeited,
        });
      }
      return next;
    });
    setParagraphStats(tokenPlan.nextStats);

    if (tokenPlan.nextIndex >= recallData.chunks.length) {
      setRecallWordIndex(recallData.chunks.length);
      finishRecallPhase(tokenPlan.nextStats, null);
      return true;
    }

    setRecallWordIndex(tokenPlan.nextIndex);
    return false;
  }, [paragraphStats, recallWordIndex, recallData.chunks, finishRecallPhase, isChunkDetail, drillForfeitedWordKeys]);

  const handleRecallInputChange = useCallback((value: string) => {
    if (isDrillPreviewing) return;
    // Scaffold mode remains single-token input (no spaces).
    if (showFirstLetterScaffold) {
      setRecallInput(value.replace(/\s/g, ''));
      return;
    }

    // No-scaffold mode: consume complete space-delimited tokens immediately.
    const { completeTokens, pendingToken } = parseNoScaffoldRecallInput(value);

    if (completeTokens.length > 0) {
      const finished = processRecallTokens(completeTokens);
      if (finished) {
        setRecallInput('');
        return;
      }
    }

    setRecallInput(pendingToken);
  }, [showFirstLetterScaffold, processRecallTokens, isDrillPreviewing]);

  const handleRecallSubmit = useCallback(() => {
    if (isDrillPreviewing) return;
    if (!currentRecallChunk || recallInput.trim() === '') return;

    // No-scaffold mode: submit current in-progress token (prediction-style flow).
    if (!showFirstLetterScaffold) {
      processRecallTokens([recallInput.trim()]);
      setRecallInput('');
      setLastMissResult(null);
      setShowingMiss(false);
      return;
    }

    const transitionPlan = planScaffoldRecallSubmission({
      predicted: recallInput.trim(),
      chunk: currentRecallChunk,
      isDrill,
      currentIndex: recallWordIndex,
      chunkCount: recallData.chunks.length,
      isDetail: isChunkDetail(recallWordIndex),
      isWordKnown,
      isExactMatch,
    });

    setCompletedWords(prev => new Map(prev).set(transitionPlan.completedWord.key, {
      text: transitionPlan.completedWord.text,
      correct: transitionPlan.completedWord.correct,
    }));

    if (transitionPlan.type === 'show-miss') {
      setLastMissResult(transitionPlan.missResult);
      setShowingMiss(true);
      return;
    }

    setRecallInput('');
    setLastMissResult(null);
    setShowingMiss(false);

    if (transitionPlan.type === 'finish') {
      finishRecallPhase(paragraphStats, transitionPlan.finalWord);
    } else {
      setParagraphStats(prev => applyStatsDelta(prev, transitionPlan.statsDelta));
      setRecallWordIndex(transitionPlan.nextIndex);
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
    isDrillPreviewing,
  ]);

  const scoreRemainingAsMisses = useCallback(() => {
    const finalStats = buildRemainingMissStats({
      chunkCount: recallData.chunks.length,
      currentIndex: recallWordIndex,
      stats: paragraphStats,
      isDetailChunk: isChunkDetail,
    });
    if (!finalStats) return false;

    setRecallInput('');
    setShowingMiss(false);
    setLastMissResult(null);
    setDrillPreviewWordKeys([]);
    setDrillPreviewVisibleCount(0);
    finishRecallPhase(finalStats, null);
    return true;
  }, [recallWordIndex, recallData.chunks.length, paragraphStats, finishRecallPhase, isChunkDetail]);

  const handleGiveUp = useCallback(() => {
    scoreRemainingAsMisses();
  }, [scoreRemainingAsMisses]);

  const handleTabPreviewRemaining = useCallback(() => {
    if (isDrillPreviewing) return;
    const previewKeys: WordKey[] = collectRemainingPreviewWordKeys(recallData.chunks, recallWordIndex);
    if (previewKeys.length === 0) return;
    setRecallInput('');
    setShowingMiss(false);
    setLastMissResult(null);
    setDrillForfeitedWordKeys(prev => {
      const next = new Set(prev);
      for (const key of previewKeys) next.add(key);
      return next;
    });
    setDrillPreviewWordKeys(previewKeys);
    setDrillPreviewVisibleCount(0);
  }, [isDrillPreviewing, recallData.chunks, recallWordIndex]);

  const handleMissContinue = useCallback(() => {
    setShowingMiss(false);
    setLastMissResult(null);
    setRecallInput('');

    const transitionPlan = planScaffoldMissContinue({
      currentIndex: recallWordIndex,
      chunkCount: recallData.chunks.length,
      isDetail: isChunkDetail(recallWordIndex),
    });

    if (transitionPlan.type === 'finish') {
      finishRecallPhase(paragraphStats, transitionPlan.finalWord);
    } else {
      setParagraphStats(prev => applyStatsDelta(prev, transitionPlan.statsDelta));
      setRecallWordIndex(transitionPlan.nextIndex);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [recallWordIndex, recallData.chunks.length, paragraphStats, finishRecallPhase, isChunkDetail]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    // Scaffold mode keeps per-word flow (Space/Enter submit).
    // No-scaffold mode allows spaces for full-sentence typing (Enter submit).
    if (e.key === 'Tab' && isDrill && !showFirstLetterScaffold) {
      e.preventDefault();
      e.stopPropagation();
      handleTabPreviewRemaining();
      return;
    }
    const submitOnSpace = showFirstLetterScaffold;
    if (isDrillPreviewing && ((submitOnSpace && e.key === ' ') || e.key === 'Enter')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if ((submitOnSpace && e.key === ' ') || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleRecallSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleGiveUp();
    }
  }, [handleRecallSubmit, handleGiveUp, handleTabPreviewRemaining, showFirstLetterScaffold, isDrill, isDrillPreviewing]);

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

  const resetRecallRoundState = useCallback((nextLeadIn: boolean) => {
    setRecallInput('');
    setRecallWordIndex(0);
    setShowingMiss(false);
    setLastMissResult(null);
    setCompletedWords(new Map());
    setParagraphStats(createEmptyParagraphStats());
    setCurrentLineIndex(-1);
    readingStepRef.current = 0;
    setReadingLeadIn(nextLeadIn);
    setCurrentSentenceIndex(0);
    setDrillForfeitedWordKeys(new Set());
    setDrillPreviewWordKeys([]);
    setDrillPreviewVisibleCount(0);
    setLastPreviewPenaltyCount(0);
    setFeedbackText('');
  }, []);

  const fetchDrillArticle = useCallback((onMissing: 'complete' | 'stay') => {
    const corpus = window.corpus;
    if (!corpus) return;

    const requestId = drillFetchRequestRef.current + 1;
    drillFetchRequestRef.current = requestId;
    const isStaleRequest = () => !isMountedRef.current || drillFetchRequestRef.current !== requestId;

    corpus.sampleArticle(drillCorpusFamily, drillTier)
      .then((nextArticle) => {
        if (isStaleRequest()) return;
        if (nextArticle) {
          setDrillArticle(nextArticle);
          setDrillSentenceIndex(0);
          setPhase('reading');
          return;
        }
        if (onMissing === 'complete') {
          setPhase('complete');
        }
      })
      .catch((error) => {
        if (isStaleRequest()) return;
        console.warn('Failed to fetch drill article', error);
        if (onMissing === 'complete') {
          setPhase('complete');
        }
      });
  }, [drillCorpusFamily, drillTier]);

  const handleContinue = useCallback(() => {
    // Reset recall state
    resetRecallRoundState(true);

    const continuePlan = planTrainingContinue({
      isDrill,
      shouldRepeat,
      currentParagraphIndex,
      paragraphCount: paragraphs.length,
      sessionTimeLimit,
      sessionStartTime,
      now: Date.now(),
      drillSentenceIndex,
      drillRoundSentenceCount,
      drillSentenceCount: drillSentences.length,
    });

    if (continuePlan.type === 'complete') {
      setPhase('complete');
      return;
    }

    if (continuePlan.type === 'reading-same-paragraph') {
      setPhase('reading');
      return;
    }

    if (continuePlan.type === 'reading-next-paragraph') {
      setCurrentParagraphIndex(continuePlan.nextParagraphIndex);
      setPhase('reading');
      return;
    }

    if (continuePlan.type === 'drill-next-sentence') {
      setDrillSentenceIndex(continuePlan.nextSentenceIndex);
      setPhase('reading');
      return;
    }

    if (continuePlan.type === 'drill-fetch-next-article') {
      fetchDrillArticle('complete');
    }
  }, [
    currentParagraphIndex,
    drillRoundSentenceCount,
    drillSentenceIndex,
    drillSentences.length,
    fetchDrillArticle,
    isDrill,
    paragraphs.length,
    resetRecallRoundState,
    sessionStartTime,
    sessionTimeLimit,
    shouldRepeat,
  ]);

  const handleStart = useCallback(() => {
    resetRecallRoundState(true);

    const startPlan = planTrainingStart(isDrill);
    if (startPlan.type === 'drill-fetch-first-article') {
      // Reset per-session counters (cross-session state persists from init)
      setDrillRoundsCompleted(0);
      setDrillScoreSum(0);
      setDrillWpmStart(wpm);
      setSessionStartTime(Date.now());
      setDrillSentenceIndex(0);

      fetchDrillArticle('stay');
    } else {
      setPhase('reading');
    }
  }, [fetchDrillArticle, isDrill, resetRecallRoundState, wpm]);

  const handleReturnToSetup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    drillFetchRequestRef.current += 1;
    setPaused(false);
    resetRecallRoundState(false);
    setPhase('setup');
  }, [resetRecallRoundState]);

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
      ? `Auto-adjust uses ±${DRILL_WPM_STEP} WPM steps within your selected range.`
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
              min={MIN_WPM}
              max={MAX_WPM}
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
                  onChange={e => {
                    const next = e.target.checked;
                    setAutoAdjustDifficulty(next);
                    if (next) {
                      const clamped = Math.max(drillMinWpm, Math.min(drillMaxWpm, wpm));
                      if (clamped !== wpm) {
                        setWpm(clamped);
                        onWpmChange(clamped);
                      }
                    }
                  }}
                />
                <span className="control-label">Auto-adjust drill difficulty</span>
              </label>
              <label className="training-setup-wpm">
                <span className="control-label">Min WPM:</span>
                <input
                  type="range"
                  min={MIN_WPM}
                  max={MAX_WPM}
                  step="10"
                  value={drillMinWpm}
                  onChange={e => {
                    const nextMin = Number(e.target.value);
                    setDrillMinWpm(nextMin);
                    if (nextMin > drillMaxWpm) setDrillMaxWpm(nextMin);
                    if (autoAdjustDifficulty && wpm < nextMin) {
                      setWpm(nextMin);
                      onWpmChange(nextMin);
                    }
                  }}
                  className="control-slider wpm-slider"
                />
                <span className="control-value">{drillMinWpm}</span>
              </label>
              <label className="training-setup-wpm">
                <span className="control-label">Max WPM:</span>
                <input
                  type="range"
                  min={MIN_WPM}
                  max={MAX_WPM}
                  step="10"
                  value={drillMaxWpm}
                  onChange={e => {
                    const nextMax = Number(e.target.value);
                    setDrillMaxWpm(nextMax);
                    if (nextMax < drillMinWpm) setDrillMinWpm(nextMax);
                    if (autoAdjustDifficulty && wpm > nextMax) {
                      setWpm(nextMax);
                      onWpmChange(nextMax);
                    }
                  }}
                  className="control-slider wpm-slider"
                />
                <span className="control-value">{drillMaxWpm}</span>
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
                {(tierInfo?.totalArticles ?? 0).toLocaleString()} articles · range {drillMinWpm}-{drillMaxWpm} WPM
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
              ? `${drillArticle?.title ?? ''} · ${Math.min(drillSentenceIndex + drillRoundSentenceCount, drillSentences.length)}/${drillSentences.length} · 1 sentence`
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
          {isDrill && lastPreviewPenaltyCount > 0 && (
            <div className="training-score-detail">
              Tab preview used: {lastPreviewPenaltyCount} remaining word{lastPreviewPenaltyCount === 1 ? '' : 's'} scored 0
            </div>
          )}
          {isDrill ? (
            <>
              {autoAdjustDifficulty && drillAdj.wpmDelta !== 0 && (
                <div className="training-wpm-change">
                  WPM {drillAdj.wpmDelta > 0 ? '+' : ''}{drillAdj.wpmDelta} → {wpm}
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
              ? `${drillArticle?.title ?? ''} · ${Math.min(drillSentenceIndex + drillRoundSentenceCount, drillSentences.length)}/${drillSentences.length} · 1 sentence`
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
            ? `${drillArticle?.title ?? ''} · ${Math.min(drillSentenceIndex + drillRoundSentenceCount, drillSentences.length)}/${drillSentences.length} · 1 sentence · ${recallWordIndex} / ${totalRecallWords} words`
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
                previewWordKeys={drillPreviewVisibleWordKeys}
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

      {!paused && !showingMiss && (recallWordIndex > 0 || (isDrill && !showFirstLetterScaffold)) && (
        <div className="prediction-continue-hint">
          {isDrillPreviewing
            ? `Previewing remaining words at ${wpm} WPM...`
            : isDrill && !showFirstLetterScaffold
            ? `${drillForfeitedWordKeys.size > 0 ? 'Preview used; remaining words are practice-only (score 0).' : 'Tab to preview remaining (remaining words score 0).'}${recallWordIndex > 0 ? ' · Esc to skip remaining' : ''}`
            : 'Esc to skip remaining'}
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
  previewWordKeys: Set<WordKey>;
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
  previewWordKeys,
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

    const wordKey = makeRecallWordKey(sac.lineIndex, sac.startChar);
    const completed = completedWords.get(wordKey);

    if (completed) {
      const cls = completed.forfeited
        ? (isHeading ? 'saccade-heading recall-forfeited' : 'recall-forfeited')
        : isHeading
          ? completed.correct ? 'saccade-heading recall-correct' : 'saccade-heading recall-wrong'
          : completed.correct ? 'recall-correct' : 'recall-wrong';
      elements.push(
        <span key={`word-${i}`} className={cls}>{completed.text}</span>
      );
    } else if (isCurrent && !showingMiss && !previewWordKeys.has(wordKey)) {
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
          ) : previewWordKeys.has(wordKey) ? (
            <span className="prediction-preview-word">{word}</span>
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
