import type { Chunk, DisplayMode, SaccadePage } from '../types';
import { isBreakChunk } from '../lib/rsvp';
import { SaccadeReader } from './SaccadeReader';

interface ReaderProps {
  chunk: Chunk | null;
  isPlaying: boolean;
  displayMode: DisplayMode;
  saccadePage?: SaccadePage | null;
  showPacer?: boolean;
}

/**
 * Calculate OVP index for a single word (35% position).
 */
function calculateWordOVP(word: string): number {
  if (word.length <= 1) return 0;
  if (word.length <= 3) return 1;
  return Math.floor(word.length * 0.35);
}

/**
 * Render a single word with its OVP highlighted.
 */
function WordWithOVP({ word }: { word: string }) {
  const ovpIndex = calculateWordOVP(word);
  const before = word.slice(0, ovpIndex);
  const ovpChar = word[ovpIndex] || '';
  const after = word.slice(ovpIndex + 1);

  return (
    <span className="reader-word">
      <span className="reader-word-before">{before}</span>
      <span className="reader-orp">{ovpChar}</span>
      <span className="reader-word-after">{after}</span>
    </span>
  );
}

export function Reader({ chunk, displayMode, saccadePage, showPacer = true }: ReaderProps) {
  // Saccade mode uses its own reader component
  if (displayMode === 'saccade') {
    return <SaccadeReader page={saccadePage ?? null} chunk={chunk} showPacer={showPacer} />;
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

  const { text, orpIndex } = chunk;
  const isMultiWord = text.includes(' ') && text.length > 15;

  // Multi-word chunks over 15 chars: show per-word OVP
  if (isMultiWord) {
    const words = text.split(' ').filter(w => w.length > 0);
    return (
      <div className="reader">
        <div className="reader-display">
          <div className="reader-text-multiword">
            {words.map((word, i) => (
              <span key={i}>
                <WordWithOVP word={word} />
                {i < words.length - 1 && <span className="reader-word-space"> </span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Single word or short chunk: use single OVP with marker
  const beforeOrp = text.slice(0, orpIndex);
  const orpChar = text[orpIndex] || '';
  const afterOrp = text.slice(orpIndex + 1);

  return (
    <div className="reader">
      <div className="reader-display">
        <div className="reader-text">
          <span className="reader-before">{beforeOrp}</span>
          <span className="reader-orp">{orpChar}</span>
          <span className="reader-after">{afterOrp}</span>
        </div>
        <div className="reader-marker">▲</div>
      </div>
    </div>
  );
}
