import type { TokenMode, DisplayMode } from '../types';
import { MODE_CHAR_WIDTHS } from '../types';

interface ReaderControlsProps {
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  displayMode: DisplayMode;
  customCharWidth: number;
  showPacer: boolean;
  currentPageIndex: number;
  totalPages: number;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
  onSkipToEnd: () => void;
  onWpmChange: (wpm: number) => void;
  onModeChange: (mode: TokenMode) => void;
  onDisplayModeChange: (displayMode: DisplayMode) => void;
  onCustomCharWidthChange: (width: number) => void;
  onShowPacerChange: (show: boolean) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function ReaderControls({
  isPlaying,
  wpm,
  mode,
  displayMode,
  customCharWidth,
  showPacer,
  currentPageIndex,
  totalPages,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onReset,
  onSkipToEnd,
  onWpmChange,
  onModeChange,
  onDisplayModeChange,
  onCustomCharWidthChange,
  onShowPacerChange,
  onNextPage,
  onPrevPage,
}: ReaderControlsProps) {
  const isPrediction = displayMode === 'prediction';

  return (
    <div className="reader-controls">
      {/* Hide transport controls in prediction mode (user controls pace via typing) */}
      {!isPrediction && (
        <div className="controls-transport">
          <button onClick={onReset} title="Skip to start" className="control-btn">
            ⏮
          </button>
          <button onClick={onPrev} title="Previous chunk (←)" className="control-btn">
            ⏪
          </button>
          <button
            onClick={isPlaying ? onPause : onPlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="control-btn control-btn-primary"
          >
            {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
          </button>
          <button onClick={onNext} title="Next chunk (→)" className="control-btn">
            ⏩
          </button>
          <button onClick={onSkipToEnd} title="Skip to end" className="control-btn">
            ⏭
          </button>
        </div>
      )}

      <div className="controls-settings">
        {/* Hide WPM in prediction mode (user controls pace via typing) */}
        {!isPrediction && (
          <label className="control-group">
            <span className="control-label">Speed:</span>
            <input
              type="range"
              min="100"
              max="800"
              step="10"
              value={wpm}
              onChange={e => onWpmChange(Number(e.target.value))}
              className="control-slider wpm-slider"
            />
            <span className="control-value">{wpm} WPM</span>
          </label>
        )}

        <label className="control-group">
          <span className="control-label">Display:</span>
          <select
            value={displayMode}
            onChange={e => onDisplayModeChange(e.target.value as DisplayMode)}
            className="control-select"
          >
            <option value="rsvp">RSVP</option>
            <option value="saccade">Saccade</option>
            <option value="prediction">Prediction</option>
          </select>
        </label>

        {/* Hide chunk mode in prediction mode (forced to word) and saccade mode (line sweep) */}
        {!isPrediction && displayMode !== 'saccade' && (
          <label className="control-group">
            <span className="control-label">Chunks:</span>
            <select
              value={mode}
              onChange={e => onModeChange(e.target.value as TokenMode)}
              className="control-select"
            >
              <option value="word">Word</option>
              <option value="phrase">Phrase (~{MODE_CHAR_WIDTHS.phrase}ch)</option>
              <option value="clause">Clause (~{MODE_CHAR_WIDTHS.clause}ch)</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        )}

        {mode === 'custom' && !isPrediction && displayMode !== 'saccade' && (
          <label className="control-group">
            <span className="control-label">Width:</span>
            <input
              type="range"
              min="10"
              max="60"
              value={customCharWidth}
              onChange={e => onCustomCharWidthChange(Number(e.target.value))}
              className="control-slider"
            />
            <span className="control-value">{customCharWidth}ch</span>
          </label>
        )}

        {displayMode === 'saccade' && (
          <label className="control-group control-checkbox">
            <input
              type="checkbox"
              checked={showPacer}
              onChange={e => onShowPacerChange(e.target.checked)}
            />
            <span className="control-label">Pacer</span>
          </label>
        )}
      </div>

      {displayMode === 'saccade' && !showPacer && (
        <div className="controls-page-nav">
          <button
            onClick={onPrevPage}
            disabled={currentPageIndex <= 0}
            className="control-btn"
            title="Previous page"
          >
            ◀ Prev
          </button>
          <span className="page-indicator">
            Page {currentPageIndex + 1} / {totalPages}
          </span>
          <button
            onClick={onNextPage}
            disabled={currentPageIndex >= totalPages - 1}
            className="control-btn"
            title="Next page"
          >
            Next ▶
          </button>
        </div>
      )}
    </div>
  );
}
