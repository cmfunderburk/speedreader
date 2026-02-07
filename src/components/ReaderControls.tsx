import type { TokenMode, DisplayMode } from '../types';

interface ReaderControlsProps {
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  displayMode: DisplayMode;
  showPacer: boolean;
  linesPerPage: number;
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
  onShowPacerChange: (show: boolean) => void;
  onLinesPerPageChange: (lines: number) => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  rampEnabled: boolean;
  effectiveWpm: number;
  onRampEnabledChange: (enabled: boolean) => void;
  alternateColors: boolean;
  onAlternateColorsChange: (enabled: boolean) => void;
  showORP: boolean;
  onShowORPChange: (enabled: boolean) => void;
  saccadeShowOVP: boolean;
  onSaccadeShowOVPChange: (enabled: boolean) => void;
  saccadeShowSweep: boolean;
  onSaccadeShowSweepChange: (enabled: boolean) => void;
  saccadeLength: number;
  onSaccadeLengthChange: (length: number) => void;
}

export function ReaderControls({
  isPlaying,
  wpm,
  mode,
  displayMode,
  showPacer,
  linesPerPage,
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
  onShowPacerChange,
  onLinesPerPageChange,
  onNextPage,
  onPrevPage,
  rampEnabled,
  effectiveWpm,
  onRampEnabledChange,
  alternateColors,
  onAlternateColorsChange,
  showORP,
  onShowORPChange,
  saccadeShowOVP,
  onSaccadeShowOVPChange,
  saccadeShowSweep,
  onSaccadeShowSweepChange,
  saccadeLength,
  onSaccadeLengthChange,
}: ReaderControlsProps) {
  const isSelfPaced = displayMode === 'prediction' || displayMode === 'recall' || displayMode === 'training';
  const showChunks = !isSelfPaced && displayMode !== 'saccade';

  return (
    <div className="reader-controls">
      {/* Hide transport controls in self-paced modes */}
      {!isSelfPaced && (
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
        {/* Hide WPM in self-paced modes */}
        {!isSelfPaced && (
          <>
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
              <span className="control-value">
                {rampEnabled ? `${effectiveWpm} → ${wpm} WPM` : `${wpm} WPM`}
              </span>
            </label>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={rampEnabled}
                onChange={e => onRampEnabledChange(e.target.checked)}
              />
              <span className="control-label">Ramp</span>
            </label>
          </>
        )}

        {displayMode === 'rsvp' && (
          <>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={alternateColors}
                onChange={e => onAlternateColorsChange(e.target.checked)}
              />
              <span className="control-label">Alt colors</span>
            </label>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={showORP}
                onChange={e => onShowORPChange(e.target.checked)}
              />
              <span className="control-label">ORP</span>
            </label>
          </>
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
            <option value="recall">Recall</option>
            <option value="training">Training</option>
          </select>
        </label>

        {/* Hide chunk mode in self-paced and saccade modes */}
        {showChunks && (
          <>
            <label className="control-group">
              <span className="control-label">Chunking:</span>
              <select
                value={mode}
                onChange={e => onModeChange(e.target.value as TokenMode)}
                className="control-select"
              >
                <option value="word">Word</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {mode === 'custom' && (
              <label className="control-group">
                <span className="control-label">Saccade:</span>
                <input
                  type="range"
                  min="7"
                  max="15"
                  step="1"
                  value={saccadeLength}
                  onChange={e => onSaccadeLengthChange(Number(e.target.value))}
                  className="control-slider"
                />
                <span className="control-value">{saccadeLength}ch</span>
              </label>
            )}
          </>
        )}

        {displayMode === 'saccade' && (
          <>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={showPacer}
                onChange={e => onShowPacerChange(e.target.checked)}
              />
              <span className="control-label">Pacer</span>
            </label>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={saccadeShowOVP}
                onChange={e => onSaccadeShowOVPChange(e.target.checked)}
              />
              <span className="control-label">OVP</span>
            </label>
            <label className="control-group control-checkbox">
              <input
                type="checkbox"
                checked={saccadeShowSweep}
                onChange={e => onSaccadeShowSweepChange(e.target.checked)}
              />
              <span className="control-label">Sweep</span>
            </label>
            {saccadeShowOVP && (
              <label className="control-group">
                <span className="control-label">Saccade:</span>
                <input
                  type="range"
                  min="7"
                  max="15"
                  step="1"
                  value={saccadeLength}
                  onChange={e => onSaccadeLengthChange(Number(e.target.value))}
                  className="control-slider"
                />
                <span className="control-value">{saccadeLength}ch</span>
              </label>
            )}
          </>
        )}

        {(displayMode === 'saccade' || displayMode === 'recall') && (
          <label className="control-group">
            <span className="control-label">Lines:</span>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={linesPerPage}
              onChange={e => onLinesPerPageChange(Number(e.target.value))}
              className="control-slider"
            />
            <span className="control-value">{linesPerPage}</span>
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
