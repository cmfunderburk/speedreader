import type { TokenMode, DisplayMode, SaccadePacerStyle, SaccadeFocusTarget, GenerationDifficulty } from '../types';

interface ReaderControlsProps {
  isPlaying: boolean;
  wpm: number;
  mode: TokenMode;
  displayMode: DisplayMode;
  allowedDisplayModes?: DisplayMode[];
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
  saccadePacerStyle: SaccadePacerStyle;
  onSaccadePacerStyleChange: (style: SaccadePacerStyle) => void;
  saccadeFocusTarget: SaccadeFocusTarget;
  onSaccadeFocusTargetChange: (target: SaccadeFocusTarget) => void;
  saccadeMergeShortFunctionWords: boolean;
  onSaccadeMergeShortFunctionWordsChange: (enabled: boolean) => void;
  saccadeLength: number;
  onSaccadeLengthChange: (length: number) => void;
  generationDifficulty: GenerationDifficulty;
  onGenerationDifficultyChange: (difficulty: GenerationDifficulty) => void;
  generationSweepReveal: boolean;
  onGenerationSweepRevealChange: (enabled: boolean) => void;
}

export function ReaderControls({
  isPlaying,
  wpm,
  mode,
  displayMode,
  allowedDisplayModes,
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
  saccadePacerStyle,
  onSaccadePacerStyleChange,
  saccadeFocusTarget,
  onSaccadeFocusTargetChange,
  saccadeMergeShortFunctionWords,
  onSaccadeMergeShortFunctionWordsChange,
  saccadeLength,
  onSaccadeLengthChange,
  generationDifficulty,
  onGenerationDifficultyChange,
  generationSweepReveal,
  onGenerationSweepRevealChange,
}: ReaderControlsProps) {
  const isSelfPaced = displayMode === 'prediction' || displayMode === 'recall' || displayMode === 'training';
  const showChunks = !isSelfPaced && displayMode !== 'saccade' && displayMode !== 'generation';
  const showSaccadePageTransport = !isSelfPaced && (displayMode === 'saccade' || displayMode === 'generation');
  const hasSaccadePages = totalPages > 0;
  const safePageNumber = hasSaccadePages ? currentPageIndex + 1 : 0;

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
          {showSaccadePageTransport && (
            <>
              <button
                onClick={onPrevPage}
                disabled={!hasSaccadePages || currentPageIndex <= 0}
                className="control-btn control-btn-page"
                title="Previous page"
              >
                ◀ Pg
              </button>
              <span className="page-indicator page-indicator-inline">
                Page {safePageNumber} / {totalPages}
              </span>
            </>
          )}
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
          {showSaccadePageTransport && (
            <button
              onClick={onNextPage}
              disabled={!hasSaccadePages || currentPageIndex >= totalPages - 1}
              className="control-btn control-btn-page"
              title="Next page"
            >
              Pg ▶
            </button>
          )}
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

        {(() => {
          const ALL_MODES: { value: DisplayMode; label: string }[] = [
            { value: 'rsvp', label: 'RSVP' },
            { value: 'saccade', label: 'Saccade' },
            { value: 'generation', label: 'Generation' },
            { value: 'prediction', label: 'Prediction' },
            { value: 'recall', label: 'Recall' },
            { value: 'training', label: 'Training' },
          ];
          const modes = allowedDisplayModes
            ? ALL_MODES.filter(m => allowedDisplayModes.includes(m.value))
            : ALL_MODES;
          return modes.length > 1 ? (
            <label className="control-group">
              <span className="control-label">Display:</span>
              <select
                value={displayMode}
                onChange={e => onDisplayModeChange(e.target.value as DisplayMode)}
                className="control-select"
              >
                {modes.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
          ) : null;
        })()}

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
            {showPacer && (
              <label className="control-group">
                <span className="control-label">Pacer style:</span>
                <select
                  value={saccadePacerStyle}
                  onChange={e => onSaccadePacerStyleChange(e.target.value as SaccadePacerStyle)}
                  className="control-select"
                >
                  <option value="sweep">Sweep</option>
                  <option value="focus">Focus</option>
                </select>
              </label>
            )}
            {showPacer && saccadePacerStyle === 'focus' && (
              <label className="control-group">
                <span className="control-label">Focus by:</span>
                <select
                  value={saccadeFocusTarget}
                  onChange={e => onSaccadeFocusTargetChange(e.target.value as SaccadeFocusTarget)}
                  className="control-select"
                >
                  <option value="fixation">Fixation</option>
                  <option value="word">Word</option>
                </select>
              </label>
            )}
            {showPacer && saccadePacerStyle === 'focus' && saccadeFocusTarget === 'word' && (
              <label className="control-group control-checkbox">
                <input
                  type="checkbox"
                  checked={saccadeMergeShortFunctionWords}
                  onChange={e => onSaccadeMergeShortFunctionWordsChange(e.target.checked)}
                />
                <span className="control-label">Merge short words</span>
              </label>
            )}
            {(showPacer && saccadePacerStyle === 'focus' && saccadeFocusTarget === 'fixation')
              || (saccadeShowOVP && !(showPacer && saccadePacerStyle === 'focus' && saccadeFocusTarget === 'word')) ? (
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
            ) : null}
          </>
        )}

        {displayMode === 'generation' && (
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
                checked={generationSweepReveal}
                onChange={e => onGenerationSweepRevealChange(e.target.checked)}
              />
              <span className="control-label">Sweep reveal</span>
            </label>
            <label className="control-group">
              <span className="control-label">Difficulty:</span>
              <select
                value={generationDifficulty}
                onChange={e => onGenerationDifficultyChange(e.target.value as GenerationDifficulty)}
                className="control-select"
              >
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <span className="control-label">Hold R to reveal</span>
          </>
        )}

        {(displayMode === 'saccade' || displayMode === 'generation' || displayMode === 'recall') && (
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
    </div>
  );
}
