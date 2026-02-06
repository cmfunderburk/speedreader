import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import type { Article, Chunk, TrainingParagraphResult } from '../types';
import { segmentIntoParagraphs, tokenizeParagraphSaccade, tokenizeParagraphRecall, calculateSaccadeLineDuration, countWords } from '../lib/saccade';
import { normalizedLoss, isExactMatch } from '../lib/levenshtein';
import { loadTrainingHistory, saveTrainingHistory } from '../lib/storage';
import type { TrainingHistory } from '../lib/storage';
import { SaccadeLineComponent } from './SaccadeReader';

type TrainingPhase = 'setup' | 'reading' | 'recall' | 'feedback' | 'complete';

interface TrainingReaderProps {
  article: Article;
  initialWpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadeLength?: number;
  onClose: () => void;
  onWpmChange: (wpm: number) => void;
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
  totalLoss: number;
}

export function TrainingReader({
  article,
  initialWpm,
  saccadeShowOVP,
  saccadeShowSweep,
  saccadeLength,
  onClose,
  onWpmChange,
}: TrainingReaderProps) {
  const paragraphs = useMemo(
    () => segmentIntoParagraphs(article.content),
    [article.content]
  );

  const [trainingHistory, setTrainingHistory] = useState<TrainingHistory>(
    () => loadTrainingHistory(article.id)
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

  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [phase, setPhase] = useState<TrainingPhase>('setup');
  const [wpm, setWpm] = useState(initialWpm);
  const [paused, setPaused] = useState(false);

  // Reading phase state
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [readingLeadIn, setReadingLeadIn] = useState(false);
  const readingStepRef = useRef(0);

  // Recall phase state
  const [recallInput, setRecallInput] = useState('');
  const [recallWordIndex, setRecallWordIndex] = useState(0);
  const [showingMiss, setShowingMiss] = useState(false);
  const [lastMissResult, setLastMissResult] = useState<{ predicted: string; actual: string; loss: number } | null>(null);
  const [completedWords, setCompletedWords] = useState<Map<WordKey, CompletedWord>>(new Map());
  const [paragraphStats, setParagraphStats] = useState<ParagraphStats>({ totalWords: 0, exactMatches: 0, totalLoss: 0 });

  // Session history
  const [sessionHistory, setSessionHistory] = useState<TrainingParagraphResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const inputContainerRef = useRef<HTMLSpanElement>(null);

  const currentParagraph = paragraphs[currentParagraphIndex] ?? '';

  // Saccade data for reading phase
  const saccadeData = useMemo(
    () => tokenizeParagraphSaccade(currentParagraph),
    [currentParagraph]
  );

  // Recall data for recall phase
  const recallData = useMemo(
    () => tokenizeParagraphRecall(currentParagraph),
    [currentParagraph]
  );

  const currentRecallChunk = recallData.chunks[recallWordIndex] ?? null;

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
  const finishRecallPhase = useCallback((stats: ParagraphStats, finalWord: { loss: number; exact: boolean } | null) => {
    // Compute final stats including the last word
    let totalWords = stats.totalWords;
    let exactMatches = stats.exactMatches;
    let totalLoss = stats.totalLoss;

    if (finalWord) {
      totalWords += 1;
      exactMatches += finalWord.exact ? 1 : 0;
      totalLoss += finalWord.loss;
    }

    const avgLoss = totalWords > 0 ? totalLoss / totalWords : 0;
    const score = Math.round((1 - avgLoss) * 100);

    const result: TrainingParagraphResult = {
      paragraphIndex: currentParagraphIndex,
      score: score / 100,
      wpm,
      repeated: sessionHistory.some(r => r.paragraphIndex === currentParagraphIndex),
      wordCount: totalWords,
      exactMatches,
    };

    setSessionHistory(prev => [...prev, result]);

    // Persist to training history
    setTrainingHistory(prev => {
      const updated = { ...prev, [currentParagraphIndex]: { score: score / 100, wpm, timestamp: Date.now() } };
      saveTrainingHistory(article.id, updated);
      return updated;
    });

    // Determine WPM adjustment
    let newWpm = wpm;
    if (score < 90) {
      newWpm = Math.max(100, wpm - 25);
    } else if (score >= 95) {
      newWpm = Math.min(800, wpm + 15);
    }
    setWpm(newWpm);
    onWpmChange(newWpm);

    setPhase('feedback');
  }, [currentParagraphIndex, wpm, sessionHistory, onWpmChange, article.id]);

  const handleRecallSubmit = useCallback(() => {
    if (!currentRecallChunk || recallInput.trim() === '') return;

    const actual = currentRecallChunk.text;
    const loss = normalizedLoss(recallInput, actual);
    const exact = isExactMatch(recallInput, actual);

    const key = makeWordKey(
      currentRecallChunk.saccade!.lineIndex,
      currentRecallChunk.saccade!.startChar
    );

    if (exact) {
      setCompletedWords(prev => new Map(prev).set(key, { text: actual, correct: true }));
      setRecallInput('');

      const nextIdx = recallWordIndex + 1;
      if (nextIdx >= recallData.chunks.length) {
        finishRecallPhase(paragraphStats, { loss, exact: true });
      } else {
        setParagraphStats(prev => ({
          totalWords: prev.totalWords + 1,
          exactMatches: prev.exactMatches + 1,
          totalLoss: prev.totalLoss + loss,
        }));
        setRecallWordIndex(nextIdx);
      }
    } else {
      setCompletedWords(prev => new Map(prev).set(key, { text: actual, correct: false }));
      setLastMissResult({ predicted: recallInput.trim(), actual, loss });
      setShowingMiss(true);
    }
  }, [recallInput, currentRecallChunk, recallWordIndex, recallData.chunks.length, paragraphStats, finishRecallPhase]);

  const handleMissContinue = useCallback(() => {
    const loss = lastMissResult?.loss ?? 1;
    setShowingMiss(false);
    setLastMissResult(null);
    setRecallInput('');

    const nextIdx = recallWordIndex + 1;
    if (nextIdx >= recallData.chunks.length) {
      finishRecallPhase(paragraphStats, { loss, exact: false });
    } else {
      setParagraphStats(prev => ({
        totalWords: prev.totalWords + 1,
        exactMatches: prev.exactMatches,
        totalLoss: prev.totalLoss + loss,
      }));
      setRecallWordIndex(nextIdx);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [lastMissResult, recallWordIndex, recallData.chunks.length, paragraphStats, finishRecallPhase]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleRecallSubmit();
    }
  }, [handleRecallSubmit]);

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
  const lastScore = lastResult ? Math.round(lastResult.score * 100) : 0;
  const shouldRepeat = lastScore < 90;

  const handleContinue = useCallback(() => {
    // Reset recall state
    setRecallInput('');
    setRecallWordIndex(0);
    setShowingMiss(false);
    setLastMissResult(null);
    setCompletedWords(new Map());
    setParagraphStats({ totalWords: 0, exactMatches: 0, totalLoss: 0 });
    setCurrentLineIndex(-1);
    readingStepRef.current = 0;
    setReadingLeadIn(true);

    if (shouldRepeat) {
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
  }, [shouldRepeat, currentParagraphIndex, paragraphs.length]);

  const handleStart = useCallback(() => {
    readingStepRef.current = 0;
    setReadingLeadIn(true);
    setPhase('reading');
  }, []);

  const handleReturnToSetup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPaused(false);
    setShowingMiss(false);
    setLastMissResult(null);
    setRecallInput('');
    setRecallWordIndex(0);
    setCompletedWords(new Map());
    setParagraphStats({ totalWords: 0, exactMatches: 0, totalLoss: 0 });
    setCurrentLineIndex(-1);
    readingStepRef.current = 0;
    setPhase('setup');
  }, []);

  const togglePause = useCallback(() => {
    setPaused(p => !p);
  }, []);

  // Spacebar/Enter to continue from feedback screen
  useEffect(() => {
    if (phase === 'feedback') {
      const handler = (e: globalThis.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleContinue();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
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
    return (
      <div className="training-reader">
        <div className="training-setup">
          <h2>Training Mode</h2>
          <p className="training-setup-desc">
            Read each paragraph at saccade pace, then recall its words.
            WPM adjusts based on your comprehension score.
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
        </div>
      </div>
    );
  }

  // Complete phase
  if (phase === 'complete') {
    return (
      <div className="training-reader">
        <div className="training-complete">
          <h2>Training Complete</h2>
          {sessionSummary && (
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
            <button onClick={onClose} className="control-btn control-btn-primary">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Feedback phase
  if (phase === 'feedback') {
    const wpmDelta = lastResult
      ? (() => {
          const s = Math.round(lastResult.score * 100);
          if (s < 90) return -25;
          if (s >= 95) return +15;
          return 0;
        })()
      : 0;

    return (
      <div className="training-reader">
        <div className="training-header">
          <span className="training-phase-label">Feedback</span>
          <span className="training-progress">
            Paragraph {currentParagraphIndex + 1} / {paragraphs.length}
          </span>
          <span className="training-wpm">{wpm} WPM</span>
          <button onClick={handleReturnToSetup} className="control-btn training-pause-btn" title="Return to paragraph list">
            Exit
          </button>
        </div>
        <div className="training-feedback">
          <div className="training-score-value">{lastScore}%</div>
          <div className="training-score-detail">
            {lastResult && `${lastResult.exactMatches} / ${lastResult.wordCount} exact`}
          </div>
          {wpmDelta !== 0 && (
            <div className="training-wpm-change">
              WPM {wpmDelta > 0 ? '+' : ''}{wpmDelta} → {wpm}
            </div>
          )}
          {shouldRepeat && (
            <div className="training-repeat-notice">
              Score below 90% — repeating paragraph
            </div>
          )}
          <button onClick={handleContinue} className="control-btn control-btn-primary">
            {shouldRepeat ? 'Retry' : currentParagraphIndex + 1 >= paragraphs.length ? 'Finish' : 'Continue'}
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
            Paragraph {currentParagraphIndex + 1} / {paragraphs.length}
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
              isFutureLine={!paused && !readingLeadIn && currentLineIndex >= 0 && lineIndex > currentLineIndex}
              showPacer={!paused && !readingLeadIn}
              wpm={wpm}
              saccadeShowOVP={saccadeShowOVP}
              saccadeShowSweep={saccadeShowSweep}
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
          {recallWordIndex} / {totalRecallWords} words
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
                isHeading={isHeading}
                showingMiss={showingMiss}
                input={recallInput}
                setInput={setRecallInput}
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
    </div>
  );
}

// --- Recall line rendering (inlined from RecallReader pattern) ---

interface TrainingRecallLineProps {
  lineText: string;
  lineChunks: Chunk[];
  currentChunk: Chunk | null;
  completedWords: Map<WordKey, CompletedWord>;
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
          <span className="recall-scaffold-first">{firstLetter}</span>
          <span className="recall-scaffold-rest">{rest}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\s/g, ''))}
            onKeyDown={onKeyDown}
            className="recall-input"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ width: `${word.length}ch` }}
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
          <span className="recall-scaffold-first">{firstLetter}</span>
          <span className="recall-scaffold-rest">{rest}</span>
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
