import type { Chunk, DisplayMode, SaccadePage } from '../types';
import { isBreakChunk } from '../lib/rsvp';
import { calculateORP } from '../lib/tokenizer';
import { SaccadeReader } from './SaccadeReader';

interface ReaderProps {
  chunk: Chunk | null;
  isPlaying: boolean;
  displayMode: DisplayMode;
  saccadePage?: SaccadePage | null;
  showPacer?: boolean;
  wpm: number;
  colorPhase?: 'a' | 'b';
  showORP?: boolean;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadeLength?: number;
}

export function Reader({ chunk, displayMode, saccadePage, showPacer = true, wpm, colorPhase, showORP = true, saccadeShowOVP, saccadeShowSweep, saccadeLength }: ReaderProps) {
  // Saccade mode uses its own reader component
  if (displayMode === 'saccade') {
    return <SaccadeReader page={saccadePage ?? null} chunk={chunk} showPacer={showPacer} wpm={wpm} saccadeShowOVP={saccadeShowOVP} saccadeShowSweep={saccadeShowSweep} saccadeLength={saccadeLength} />;
  }
  // No article loaded
  if (!chunk) {
    return (
      <div className="reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  // Paragraph break marker
  if (isBreakChunk(chunk)) {
    return (
      <div className="reader">
        <div className="reader-display">
          <span className="reader-break">{chunk.text}</span>
        </div>
      </div>
    );
  }

  const { text } = chunk;

  // For multi-word chunks, center on the first word's ORP (parafoveal training).
  // For single words, use the chunk's own orpIndex.
  const isMultiWord = text.includes(' ');
  const firstWord = isMultiWord ? text.split(' ', 1)[0] : text;
  const orp = calculateORP(firstWord);

  const beforeOrp = text.slice(0, orp);
  const orpChar = text[orp] || '';
  const afterOrp = text.slice(orp + 1);

  return (
    <div className="reader">
      <div className={`reader-display${colorPhase ? ` reader-color-${colorPhase}` : ''}`}>
        <div className="reader-text">
          <span className="reader-before">{beforeOrp}</span>
          <span className={showORP ? 'reader-orp' : 'reader-before'}>{orpChar}</span>
          <span className="reader-after">{afterOrp}</span>
        </div>
        <div className="reader-marker">▲</div>
      </div>
    </div>
  );
}
