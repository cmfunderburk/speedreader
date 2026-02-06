import type { Chunk, SaccadePage, SaccadeLine } from '../types';
import { computeLineFixations } from '../lib/saccade';

interface SaccadeReaderProps {
  page: SaccadePage | null;
  chunk: Chunk | null;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeLength?: number;
}

export function SaccadeReader({ page, chunk, showPacer, wpm, saccadeShowOVP, saccadeLength }: SaccadeReaderProps) {
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
            showPacer={showPacer}
            wpm={wpm}
            saccadeShowOVP={saccadeShowOVP}
            saccadeLength={saccadeLength}
          />
        ))}
      </div>
    </div>
  );
}

interface SaccadeLineProps {
  line: SaccadeLine;
  lineIndex: number;
  isActiveLine: boolean;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeLength?: number;
}

function SaccadeLineComponent({ line, lineIndex, isActiveLine, showPacer, wpm, saccadeShowOVP, saccadeLength }: SaccadeLineProps) {
  if (line.type === 'blank') {
    return (
      <div className="saccade-line">
        <span>{'\u00A0'}</span>
      </div>
    );
  }

  const isHeading = line.type === 'heading';

  // Compute fixations and timing
  const fixations = (saccadeLength && line.text)
    ? computeLineFixations(line.text, saccadeLength)
    : [];
  const timePerSaccade = (wpm && saccadeLength)
    ? (saccadeLength / 5) * (60000 / wpm)
    : 0;
  const lineDuration = fixations.length * timePerSaccade;

  const useSweepBar = showPacer && isActiveLine && lineDuration > 0 && fixations.length > 0;
  const animateFlow = showPacer && isActiveLine && saccadeShowOVP && timePerSaccade > 0;

  // Generate stepped keyframes so sweep bar arrives at each fixation position
  // exactly when the ORP turns red
  let sweepAnimName: string | undefined;
  let sweepKeyframeCSS: string | undefined;

  if (useSweepBar) {
    sweepAnimName = `sweep-${lineIndex}`;
    const steps = fixations.map((charIdx, i) => {
      const timePct = ((i / fixations.length) * 100).toFixed(2);
      return `${timePct}% { width: ${(charIdx + 0.5).toFixed(1)}ch; }`;
    });
    steps.push(`100% { width: ${(fixations[fixations.length - 1] + 0.5).toFixed(1)}ch; }`);
    sweepKeyframeCSS = `@keyframes ${sweepAnimName} { ${steps.join(' ')} }`;
  }

  const lineClasses = [
    'saccade-line',
    isHeading && 'saccade-line-heading',
    useSweepBar && 'saccade-line-sweep',
  ].filter(Boolean).join(' ');

  return (
    <div className={lineClasses} key={isActiveLine ? lineIndex : undefined}>
      {useSweepBar && sweepAnimName && sweepKeyframeCSS && (
        <>
          <style>{sweepKeyframeCSS}</style>
          <span
            className="saccade-sweep"
            style={{ animation: `${sweepAnimName} ${lineDuration}ms step-end both` }}
          />
        </>
      )}
      {renderLineText(line.text, isHeading, saccadeShowOVP, fixations, animateFlow, timePerSaccade)}
    </div>
  );
}

function renderLineText(
  text: string,
  isHeading: boolean,
  showOVP?: boolean,
  fixations?: number[],
  animateFlow?: boolean,
  timePerSaccade?: number,
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
    if (animateFlow && timePerSaccade) {
      const style = {
        animationDuration: `${timePerSaccade}ms`,
        animationDelay: `${i * timePerSaccade}ms`,
      };
      segments.push(
        <span key={`f${i}`} className="saccade-fixation saccade-fixation-active" style={style}>
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
