import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import type { Chunk, SaccadePage, PredictionResult, PredictionStats } from '../types';
import { normalizedLoss, isExactMatch } from '../lib/levenshtein';
import { LossMeter } from './LossMeter';
import { PredictionComplete } from './PredictionComplete';

interface RecallReaderProps {
  pages: SaccadePage[];
  chunks: Chunk[];
  currentChunkIndex: number;
  onAdvance: () => void;
  onPredictionResult: (result: PredictionResult) => void;
  onReset: () => void;
  onClose: () => void;
  stats: PredictionStats;
  goToIndex: (index: number) => void;
}

/**
 * Build a set of global chunk indices that have been completed,
 * keyed by pageIndex-lineIndex-startChar for fast lookup during rendering.
 */
type WordKey = string;
function makeWordKey(pageIndex: number, lineIndex: number, startChar: number): WordKey {
  return `${pageIndex}:${lineIndex}:${startChar}`;
}

interface CompletedWord {
  text: string;
  correct: boolean;
}

export function RecallReader({
  pages,
  chunks,
  currentChunkIndex,
  onAdvance,
  onPredictionResult,
  onReset,
  onClose,
  stats,
  goToIndex,
}: RecallReaderProps) {
  const [input, setInput] = useState('');
  const [showingMiss, setShowingMiss] = useState(false);
  const [lastResult, setLastResult] = useState<PredictionResult | null>(null);
  const [completedWords, setCompletedWords] = useState<Map<WordKey, CompletedWord>>(new Map());

  const inputRef = useRef<HTMLInputElement>(null);
  const inputContainerRef = useRef<HTMLSpanElement>(null);

  const currentChunk = chunks[currentChunkIndex] ?? null;
  const isComplete = currentChunkIndex >= chunks.length;

  const currentPageIndex = currentChunk?.saccade?.pageIndex ?? 0;
  const currentPage = pages[currentPageIndex] ?? null;

  // Focus input when ready
  useEffect(() => {
    if (!showingMiss && !isComplete) {
      inputRef.current?.focus();
    }
  }, [showingMiss, isComplete, currentChunkIndex]);

  // Scroll current word into view
  useEffect(() => {
    if (inputContainerRef.current) {
      inputContainerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentChunkIndex]);

  const handleSubmit = useCallback(() => {
    if (!currentChunk || input.trim() === '' || isComplete) return;

    const actual = currentChunk.text;
    const loss = normalizedLoss(input, actual);
    const correct = isExactMatch(input, actual);

    const result: PredictionResult = {
      predicted: input.trim(),
      actual,
      loss,
      timestamp: Date.now(),
      wordIndex: currentChunkIndex,
    };

    onPredictionResult(result);

    const key = makeWordKey(
      currentChunk.saccade!.pageIndex,
      currentChunk.saccade!.lineIndex,
      currentChunk.saccade!.startChar
    );

    if (correct) {
      setCompletedWords(prev => new Map(prev).set(key, { text: actual, correct: true }));
      setInput('');
      onAdvance();
    } else {
      setCompletedWords(prev => new Map(prev).set(key, { text: actual, correct: false }));
      setLastResult(result);
      setShowingMiss(true);
    }
  }, [input, currentChunk, currentChunkIndex, isComplete, onPredictionResult, onAdvance]);

  const handleContinue = useCallback(() => {
    setShowingMiss(false);
    setLastResult(null);
    setInput('');
    onAdvance();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onAdvance]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Global key listener for miss state
  useEffect(() => {
    if (showingMiss) {
      const handler = (e: globalThis.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          handleContinue();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [showingMiss, handleContinue]);

  // Reset handler
  const handleReadAgain = useCallback(() => {
    setCompletedWords(new Map());
    setInput('');
    setShowingMiss(false);
    setLastResult(null);
    goToIndex(0);
    onReset();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [goToIndex, onReset]);

  // Global reset key
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === '`') {
        e.preventDefault();
        handleReadAgain();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleReadAgain]);

  if (isComplete) {
    return (
      <PredictionComplete
        stats={stats}
        onReadAgain={handleReadAgain}
        onClose={onClose}
      />
    );
  }

  if (!currentPage) {
    return (
      <div className="reader saccade-reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  return (
    <div className="recall-reader">
      <div className="saccade-page">
        {currentPage.lines.map((line, lineIndex) => {
          if (line.type === 'blank') {
            return (
              <div key={lineIndex} className="saccade-line">
                <span>{'\u00A0'}</span>
              </div>
            );
          }

          const isHeading = line.type === 'heading';
          const lineChunks = currentPage.lineChunks[lineIndex] || [];

          return (
            <div
              key={lineIndex}
              className={`saccade-line ${isHeading ? 'saccade-line-heading' : ''}`}
            >
              <RecallLine
                lineText={line.text}
                lineChunks={lineChunks}
                currentChunk={currentChunk}
                completedWords={completedWords}
                isHeading={isHeading}
                showingMiss={showingMiss}
                input={input}
                setInput={setInput}
                onKeyDown={handleKeyDown}
                inputRef={inputRef}
                inputContainerRef={inputContainerRef}
              />
            </div>
          );
        })}
      </div>

      {showingMiss && lastResult && (
        <div className="prediction-feedback">
          <LossMeter loss={lastResult.loss} />
          <div className="prediction-comparison">
            <span className="prediction-you-said">"{lastResult.predicted}"</span>
            <span className="prediction-arrow">→</span>
            <span className="prediction-actual">"{lastResult.actual}"</span>
          </div>
          <div className="prediction-continue-hint">
            Press Space to continue
          </div>
        </div>
      )}
    </div>
  );
}

interface RecallLineProps {
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

function RecallLine({
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
}: RecallLineProps) {
  if (lineChunks.length === 0) {
    const className = isHeading ? 'saccade-heading' : 'saccade-body';
    return <span className={className}>{lineText || '\u00A0'}</span>;
  }

  const elements: JSX.Element[] = [];
  let lastEnd = 0;

  for (let i = 0; i < lineChunks.length; i++) {
    const chunk = lineChunks[i];
    const sac = chunk.saccade!;

    // Add spacing before this word
    if (sac.startChar > lastEnd) {
      elements.push(
        <span key={`gap-${i}`} className="recall-space">
          {lineText.slice(lastEnd, sac.startChar)}
        </span>
      );
    }

    const isCurrent = currentChunk?.saccade &&
      sac.pageIndex === currentChunk.saccade.pageIndex &&
      sac.lineIndex === currentChunk.saccade.lineIndex &&
      sac.startChar === currentChunk.saccade.startChar;

    const wordKey = makeWordKey(sac.pageIndex, sac.lineIndex, sac.startChar);
    const completed = completedWords.get(wordKey);

    if (completed) {
      // Revealed word
      const cls = isHeading
        ? completed.correct ? 'saccade-heading recall-correct' : 'saccade-heading recall-wrong'
        : completed.correct ? 'recall-correct' : 'recall-wrong';
      elements.push(
        <span key={`word-${i}`} className={cls}>{completed.text}</span>
      );
    } else if (isCurrent && !showingMiss) {
      // Active input overlaid on scaffold — scaffold stays in flow for stable layout
      const word = chunk.text;
      const firstLetter = word[0] || '';
      const rest = word.slice(1);
      const scaffold = rest.replace(/[^\s]/g, '\u00B7');
      elements.push(
        <span key={`word-${i}`} ref={inputContainerRef} className="recall-input-word">
          <span className="recall-scaffold-first">{firstLetter}</span>
          <span className="recall-scaffold-rest">{scaffold}</span>
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
      // Scaffold: first letter + dim placeholders
      const word = chunk.text;
      const firstLetter = word[0] || '';
      const rest = word.slice(1);
      const scaffold = rest.replace(/[^\s]/g, '\u00B7');
      const cls = isHeading ? 'saccade-heading' : '';
      elements.push(
        <span key={`word-${i}`} className={cls}>
          <span className="recall-scaffold-first">{firstLetter}</span>
          <span className="recall-scaffold-rest">{scaffold}</span>
        </span>
      );
    }

    lastEnd = sac.endChar;
  }

  // Trailing text after last word
  if (lastEnd < lineText.length) {
    elements.push(
      <span key="trailing">{lineText.slice(lastEnd)}</span>
    );
  }

  return <>{elements}</>;
}
