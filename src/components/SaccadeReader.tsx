import type { Chunk, SaccadePage, SaccadeLine } from '../types';
import { computeLineFixations, calculateSaccadeLineDuration } from '../lib/saccade';

interface SaccadeReaderProps {
  page: SaccadePage | null;
  chunk: Chunk | null;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadeLength?: number;
}

export function SaccadeReader({ page, chunk, showPacer, wpm, saccadeShowOVP, saccadeShowSweep, saccadeLength }: SaccadeReaderProps) {
  if (!page) {
    return (
      <div className="reader saccade-reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  const currentLineIndex = chunk?.saccade?.lineIndex ?? -1;

  return (
    <div className="reader saccade-reader">
      <div className="saccade-page">
        {page.lines.map((line, lineIndex) => (
          <SaccadeLineComponent
            key={lineIndex}
            line={line}
            lineIndex={lineIndex}
            isActiveLine={lineIndex === currentLineIndex}
            isFutureLine={showPacer && lineIndex > currentLineIndex}
            showPacer={showPacer}
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

export interface SaccadeLineProps {
  line: SaccadeLine;
  lineIndex: number;
  isActiveLine: boolean;
  isFutureLine: boolean;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadeLength?: number;
}

export function SaccadeLineComponent({ line, lineIndex, isActiveLine, isFutureLine, showPacer, wpm, saccadeShowOVP, saccadeShowSweep, saccadeLength }: SaccadeLineProps) {
  if (line.type === 'blank') {
    return (
      <div className="saccade-line">
        <span>{'\u00A0'}</span>
      </div>
    );
  }

  const isHeading = line.type === 'heading';
  const textLength = line.text.length;

  // Compute fixations for ORP positioning
  const fixations = (saccadeLength && line.text)
    ? computeLineFixations(line.text, saccadeLength)
    : [];

  // Character-based line duration: 5 chars = 1 word at configured WPM
  const lineDuration = calculateSaccadeLineDuration(textLength, wpm);

  const useSweepBar = showPacer && saccadeShowSweep !== false && isActiveLine && lineDuration > 0;

  // Sweep-synced ORP decoloring: ORPs start amber, turn plain as sweep passes
  const sweepDecolors = useSweepBar && saccadeShowOVP && fixations.length > 0;

  // Static amber ORPs: all lines when pacer off, or current + future lines when pacer on
  const showStaticOVP = saccadeShowOVP && !sweepDecolors && (
    !showPacer || isActiveLine || isFutureLine
  );

  // Generate keyframes
  const keyframeBlocks: string[] = [];

  if (useSweepBar) {
    keyframeBlocks.push(
      `@keyframes sweep-${lineIndex} { from { width: 0ch; } to { width: ${textLength}ch; } }`
    );
  }

  if (sweepDecolors) {
    keyframeBlocks.push(generateDecolorKeyframes(lineIndex, fixations, textLength));
  }

  const decolorConfig = sweepDecolors ? { lineIndex, lineDuration } : undefined;

  const lineClasses = [
    'saccade-line',
    isHeading && 'saccade-line-heading',
    useSweepBar && 'saccade-line-sweep',
  ].filter(Boolean).join(' ');

  return (
    <div className={lineClasses} key={isActiveLine ? lineIndex : undefined}>
      {keyframeBlocks.length > 0 && <style>{keyframeBlocks.join(' ')}</style>}
      {useSweepBar && (
        <span
          className="saccade-sweep"
          style={{ animation: `sweep-${lineIndex} ${lineDuration}ms linear both` }}
        />
      )}
      {renderLineText(line.text, isHeading, showStaticOVP || sweepDecolors, fixations, decolorConfig)}
    </div>
  );
}

/**
 * Generate per-ORP @keyframes that transition from amber to plain text
 * when the continuous sweep bar reaches each ORP's character position.
 * Uses paired keyframes with a 0.01% gap for sharp transitions.
 */
function generateDecolorKeyframes(lineIndex: number, fixations: number[], textLength: number): string {
  const amber = 'color: rgba(224, 176, 56, 0.85); font-weight: 600';
  const plain = 'color: var(--text-primary); font-weight: normal';
  const eps = 0.01;
  const fmt = (v: number) => v.toFixed(2);

  return fixations.map((charIdx, i) => {
    const pct = (charIdx / textLength) * 100;
    const kf = `0%, ${fmt(pct)}% { ${amber} } ${fmt(pct + eps)}%, 100% { ${plain} }`;
    return `@keyframes orp-${lineIndex}-${i} { ${kf} }`;
  }).join(' ');
}

function renderLineText(
  text: string,
  isHeading: boolean,
  showOVP?: boolean,
  fixations?: number[],
  decolorConfig?: { lineIndex: number; lineDuration: number },
): JSX.Element {
  const className = isHeading ? 'saccade-heading' : 'saccade-body';

  if (!showOVP || !fixations || fixations.length === 0 || !text) {
    return <span className={className}>{text || '\u00A0'}</span>;
  }

  const segments: JSX.Element[] = [];
  let cursor = 0;

  for (let i = 0; i < fixations.length; i++) {
    const idx = fixations[i];
    if (idx > cursor) {
      segments.push(<span key={`t${i}`}>{text.slice(cursor, idx)}</span>);
    }
    if (decolorConfig) {
      const style = {
        animation: `orp-${decolorConfig.lineIndex}-${i} ${decolorConfig.lineDuration}ms linear both`,
      };
      segments.push(
        <span key={`f${i}`} className="saccade-fixation" style={style}>
          {text[idx]}
        </span>
      );
    } else {
      segments.push(<span key={`f${i}`} className="saccade-fixation">{text[idx]}</span>);
    }
    cursor = idx + 1;
  }

  if (cursor < text.length) {
    segments.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  return <span className={className}>{segments}</span>;
}
