import type { Chunk, SaccadePage, SaccadeLine } from '../types';
import { calculateDisplayTime } from '../lib/rsvp';

interface SaccadeReaderProps {
  page: SaccadePage | null;
  chunk: Chunk | null;
  showPacer: boolean;
  wpm: number;
}

export function SaccadeReader({ page, chunk, showPacer, wpm }: SaccadeReaderProps) {
  if (!page) {
    return (
      <div className="reader saccade-reader">
        <div className="reader-display">
          <span className="reader-placeholder">No article loaded</span>
        </div>
      </div>
    );
  }

  // Determine current chunk position for pacer highlighting
  const currentLineIndex = chunk?.saccade?.lineIndex ?? -1;

  return (
    <div className="reader saccade-reader">
      <div className="saccade-page">
        {page.lines.map((line, lineIndex) => (
          <SaccadeLineComponent
            key={lineIndex}
            line={line}
            lineIndex={lineIndex}
            lineChunks={page.lineChunks[lineIndex] || []}
            isCurrentLine={showPacer && lineIndex === currentLineIndex}
            wpm={wpm}
          />
        ))}
      </div>
    </div>
  );
}

interface SaccadeLineProps {
  line: SaccadeLine;
  lineIndex: number;
  lineChunks: Chunk[];
  isCurrentLine: boolean;
  wpm: number;
}

function SaccadeLineComponent({ line, lineIndex, lineChunks, isCurrentLine, wpm }: SaccadeLineProps) {
  // Blank line - render non-breaking space to maintain height
  if (line.type === 'blank') {
    return (
      <div className="saccade-line">
        <span>{'\u00A0'}</span>
      </div>
    );
  }

  const isHeading = line.type === 'heading';

  // Sweep duration = exact sum of chunk display times for this line,
  // matching the actual timer that drives line advancement
  const sweepDuration = lineChunks.reduce(
    (sum, c) => sum + calculateDisplayTime(c, wpm), 0
  );

  const lineClasses = [
    'saccade-line',
    isHeading && 'saccade-line-heading',
    isCurrentLine && 'saccade-line-sweep',
  ].filter(Boolean).join(' ');

  const sweepStyle = isCurrentLine
    ? { '--sweep-duration': `${sweepDuration}ms` } as React.CSSProperties
    : undefined;

  return (
    <div className={lineClasses} style={sweepStyle} key={isCurrentLine ? lineIndex : undefined}>
      {renderLineText(line.text, isHeading)}
    </div>
  );
}

function renderLineText(text: string, isHeading: boolean): JSX.Element {
  const className = isHeading ? 'saccade-heading' : 'saccade-body';
  return <span className={className}>{text || '\u00A0'}</span>;
}
