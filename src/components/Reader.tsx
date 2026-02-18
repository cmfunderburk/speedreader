import type {
  Chunk,
  DisplayMode,
  GenerationDifficulty,
  SaccadePage,
  SaccadePacerStyle,
  SaccadeFocusTarget,
} from '../types';
import { isBreakChunk } from '../lib/rsvp';
import { calculateORP, FUNCTION_WORDS } from '../lib/tokenizer';
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
  saccadePacerStyle?: SaccadePacerStyle;
  saccadeFocusTarget?: SaccadeFocusTarget;
  saccadeMergeShortFunctionWords?: boolean;
  saccadeLength?: number;
  generationDifficulty?: GenerationDifficulty;
  generationSweepReveal?: boolean;
  generationMaskSeed?: number;
  generationReveal?: boolean;
}

export function Reader({
  chunk,
  isPlaying,
  displayMode,
  saccadePage,
  showPacer = true,
  wpm,
  colorPhase,
  showORP = true,
  saccadeShowOVP,
  saccadeShowSweep,
  saccadePacerStyle,
  saccadeFocusTarget,
  saccadeMergeShortFunctionWords,
  saccadeLength,
  generationDifficulty = 'normal',
  generationSweepReveal = true,
  generationMaskSeed = 0,
  generationReveal = false,
}: ReaderProps) {
  // Saccade mode uses its own reader component
  if (displayMode === 'saccade') {
    return <SaccadeReader page={saccadePage ?? null} chunk={chunk} isPlaying={isPlaying} showPacer={showPacer} wpm={wpm} saccadeShowOVP={saccadeShowOVP} saccadeShowSweep={saccadeShowSweep} saccadePacerStyle={saccadePacerStyle} saccadeFocusTarget={saccadeFocusTarget} saccadeMergeShortFunctionWords={saccadeMergeShortFunctionWords} saccadeLength={saccadeLength} />;
  }
  if (displayMode === 'generation') {
    return (
      <SaccadeReader
        page={saccadePage ?? null}
        chunk={chunk}
        isPlaying={isPlaying}
        showPacer={showPacer}
        wpm={wpm}
        generationMode
        generationDifficulty={generationDifficulty}
        generationSweepReveal={generationSweepReveal}
        generationMaskSeed={generationMaskSeed}
        generationReveal={generationReveal}
        saccadeShowOVP={false}
        saccadePacerStyle="sweep"
        saccadeFocusTarget="fixation"
        saccadeMergeShortFunctionWords={false}
        saccadeLength={saccadeLength}
      />
    );
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

  // For multi-word chunks, place ORP on the first content word (skip function words).
  // Function words are predictable enough to process from a nearby fixation even
  // without the parafoveal preview that natural saccadic reading provides.
  // For single words or when all words are function words, fall back to chunk center.
  let orp = calculateORP(text);
  if (text.includes(' ')) {
    const words = text.split(' ');
    let offset = 0;
    for (const word of words) {
      if (!FUNCTION_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, ''))) {
        orp = offset + calculateORP(word);
        break;
      }
      offset += word.length + 1;
    }
  }

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
