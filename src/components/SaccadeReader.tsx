import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  Chunk,
  GenerationDifficulty,
  SaccadePage,
  SaccadeLine,
  SaccadePacerStyle,
  SaccadeFocusTarget,
} from '../types';
import { computeLineFixations, calculateSaccadeLineDuration, computeFocusTargets, computeFocusTargetTimings, computeWordFocusTargetsAndFixations } from '../lib/saccade';
import { maskGenerationLine } from '../lib/generationMask';

interface SaccadeReaderProps {
  page: SaccadePage | null;
  chunk: Chunk | null;
  isPlaying: boolean;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadePacerStyle?: SaccadePacerStyle;
  saccadeFocusTarget?: SaccadeFocusTarget;
  saccadeMergeShortFunctionWords?: boolean;
  saccadeLength?: number;
  generationMode?: boolean;
  generationDifficulty?: GenerationDifficulty;
  generationSweepReveal?: boolean;
  generationMaskSeed?: number;
  generationReveal?: boolean;
}

const EMPTY_WORD_FOCUS_DATA = {
  targets: [] as Array<{ startChar: number; endChar: number }>,
  fixations: [] as number[],
};

export function SaccadeReader({
  page,
  chunk,
  isPlaying,
  showPacer,
  wpm,
  saccadeShowOVP,
  saccadeShowSweep,
  saccadePacerStyle,
  saccadeFocusTarget,
  saccadeMergeShortFunctionWords,
  saccadeLength,
  generationMode = false,
  generationDifficulty = 'normal',
  generationSweepReveal = true,
  generationMaskSeed = 0,
  generationReveal = false,
}: SaccadeReaderProps) {
  const readerRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [figureMaxHeightPx, setFigureMaxHeightPx] = useState<number | null>(null);
  const [magnifiedFigure, setMagnifiedFigure] = useState<{
    src: string;
    alt: string;
    caption?: string;
  } | null>(null);

  const recalculateFigureHeight = useCallback(() => {
    const readerEl = readerRef.current;
    const pageEl = pageRef.current;
    if (!readerEl || !pageEl) return;

    const lineElements = Array.from(pageEl.querySelectorAll<HTMLElement>(':scope > .saccade-line'));
    const figureElements = lineElements.filter((lineEl) =>
      lineEl.classList.contains('saccade-line-figure') && !lineEl.classList.contains('saccade-line-equation')
    );

    if (figureElements.length === 0) {
      setFigureMaxHeightPx((prev) => (prev === null ? prev : null));
      return;
    }

    const availableHeight = readerEl.clientHeight;
    if (availableHeight <= 0) return;

    const getOuterHeight = (el: HTMLElement | null): number => {
      if (!el) return 0;
      const rectHeight = el.getBoundingClientRect().height;
      const styles = window.getComputedStyle(el);
      const marginTop = Number.parseFloat(styles.marginTop || '0') || 0;
      const marginBottom = Number.parseFloat(styles.marginBottom || '0') || 0;
      return rectHeight + marginTop + marginBottom;
    };

    let nonFigureHeight = 0;
    let figureChromeHeight = 0;

    for (const lineEl of lineElements) {
      const lineHeight = getOuterHeight(lineEl);
      if (!lineEl.classList.contains('saccade-line-figure') || lineEl.classList.contains('saccade-line-equation')) {
        nonFigureHeight += lineHeight;
        continue;
      }

      const imageEl = lineEl.querySelector<HTMLElement>('.saccade-figure-image');
      const imageHeight = imageEl ? getOuterHeight(imageEl) : 0;
      figureChromeHeight += Math.max(0, lineHeight - imageHeight);
    }

    const remainingHeight = availableHeight - nonFigureHeight - figureChromeHeight - 12;
    const currentOverflow = Math.max(0, pageEl.scrollHeight - availableHeight);
    const perFigureBudget = Math.floor(remainingHeight / figureElements.length) - Math.ceil(currentOverflow / figureElements.length);
    const nextMaxHeight = Math.max(72, Math.min(520, perFigureBudget));

    setFigureMaxHeightPx((prev) => (prev === nextMaxHeight ? prev : nextMaxHeight));
  }, []);

  useEffect(() => {
    recalculateFigureHeight();

    const readerEl = readerRef.current;
    if (!readerEl) return;

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        recalculateFigureHeight();
      })
      : null;
    resizeObserver?.observe(readerEl);

    const imageElements = Array.from(readerEl.querySelectorAll<HTMLImageElement>('.saccade-figure-image'));
    imageElements.forEach((img) => img.addEventListener('load', recalculateFigureHeight));

    const rafId = requestAnimationFrame(() => {
      recalculateFigureHeight();
    });

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      imageElements.forEach((img) => img.removeEventListener('load', recalculateFigureHeight));
    };
  }, [page, recalculateFigureHeight]);

  useEffect(() => {
    if (isPlaying && magnifiedFigure) {
      setMagnifiedFigure(null);
    }
  }, [isPlaying, magnifiedFigure]);

  useEffect(() => {
    if (!magnifiedFigure) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMagnifiedFigure(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [magnifiedFigure]);

  const handleOpenFigure = useCallback((figure: { src: string; alt: string; caption?: string }) => {
    setMagnifiedFigure(figure);
  }, []);

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
  const pageStyle = figureMaxHeightPx !== null
    ? ({ '--saccade-figure-max-height': `${figureMaxHeightPx}px` } as CSSProperties)
    : undefined;

  return (
    <div className="reader saccade-reader" ref={readerRef}>
      <div className="saccade-page" ref={pageRef} style={pageStyle}>
        {page.lines.map((line, lineIndex) => {
          const isMaskableLine = line.type !== 'figure' && line.type !== 'blank';
          // In generation sweep-reveal mode, previously swept lines stay revealed.
          // Only the active line gets progressive unmasking.
          const keepLineRevealed = generationMode
            && generationSweepReveal
            && showPacer
            && !generationReveal
            && isMaskableLine
            && lineIndex < currentLineIndex;
          const shouldMaskLine = generationMode && !generationReveal && isMaskableLine && !keepLineRevealed;

          return (
          <SaccadeLineComponent
            key={lineIndex}
            line={line}
            lineIndex={lineIndex}
            displayText={
              shouldMaskLine
                ? maskGenerationLine(line.text, generationDifficulty, generationMaskSeed, lineIndex)
                : line.text
            }
            renderGenerationMaskSlots={shouldMaskLine}
            generationSweepReveal={generationMode && generationSweepReveal}
            isActiveLine={lineIndex === currentLineIndex}
            isPlaying={isPlaying}
            isFutureLine={showPacer && lineIndex > currentLineIndex}
            showPacer={showPacer}
            wpm={wpm}
            saccadeShowOVP={saccadeShowOVP}
            saccadeShowSweep={saccadeShowSweep}
            saccadePacerStyle={saccadePacerStyle}
            saccadeFocusTarget={saccadeFocusTarget}
            saccadeMergeShortFunctionWords={saccadeMergeShortFunctionWords}
            saccadeLength={saccadeLength}
            onOpenFigure={handleOpenFigure}
          />
          );
        })}
      </div>
      {magnifiedFigure && (
        <div className="saccade-figure-lightbox" onClick={() => setMagnifiedFigure(null)}>
          <div className="saccade-figure-lightbox-dialog" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="saccade-figure-lightbox-close"
              onClick={() => setMagnifiedFigure(null)}
              aria-label="Close figure"
            >
              ×
            </button>
            <img
              src={magnifiedFigure.src}
              alt={magnifiedFigure.alt}
              className="saccade-figure-lightbox-image"
            />
            {magnifiedFigure.caption && (
              <div className="saccade-figure-lightbox-caption">{magnifiedFigure.caption}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface SaccadeLineProps {
  line: SaccadeLine;
  lineIndex: number;
  displayText?: string;
  renderGenerationMaskSlots?: boolean;
  generationSweepReveal?: boolean;
  isActiveLine: boolean;
  isPlaying: boolean;
  isFutureLine: boolean;
  showPacer: boolean;
  wpm: number;
  saccadeShowOVP?: boolean;
  saccadeShowSweep?: boolean;
  saccadePacerStyle?: SaccadePacerStyle;
  saccadeFocusTarget?: SaccadeFocusTarget;
  saccadeMergeShortFunctionWords?: boolean;
  saccadeLength?: number;
  onOpenFigure?: (figure: { src: string; alt: string; caption?: string }) => void;
}

export const SaccadeLineComponent = memo(function SaccadeLineComponent({
  line,
  lineIndex,
  displayText,
  renderGenerationMaskSlots = false,
  generationSweepReveal = false,
  isActiveLine,
  isPlaying,
  isFutureLine,
  showPacer,
  wpm,
  saccadeShowOVP,
  saccadeShowSweep,
  saccadePacerStyle,
  saccadeFocusTarget,
  saccadeMergeShortFunctionWords,
  saccadeLength,
  onOpenFigure,
}: SaccadeLineProps) {
  const isBlank = line.type === 'blank';
  const isFigure = line.type === 'figure';
  const isHeading = line.type === 'heading';
  const lineText = displayText ?? line.text;
  const textLength = lineText.length;

  // Character-based line duration: 5 chars = 1 word at configured WPM
  const lineDuration = useMemo(
    () => calculateSaccadeLineDuration(textLength, wpm),
    [textLength, wpm]
  );
  const pacerStyle = saccadePacerStyle ?? (saccadeShowSweep === false ? 'focus' : 'sweep');
  const focusTarget = saccadeFocusTarget ?? 'fixation';
  const useWordFocus = pacerStyle === 'focus' && focusTarget === 'word';

  const fixationBasedFixations = useMemo(
    () => (((!isBlank && !isFigure) && saccadeLength && lineText)
      ? computeLineFixations(lineText, saccadeLength)
      : []),
    [isBlank, isFigure, lineText, saccadeLength]
  );
  const wordFocusData = useMemo(
    () => (useWordFocus && !isBlank && !isFigure
      ? computeWordFocusTargetsAndFixations(lineText, saccadeMergeShortFunctionWords ?? false)
      : EMPTY_WORD_FOCUS_DATA),
    [isBlank, isFigure, lineText, saccadeMergeShortFunctionWords, useWordFocus]
  );
  const fixations = useWordFocus
    ? wordFocusData.fixations
    : fixationBasedFixations;

  const focusTargets = useMemo(() => {
    if (isBlank || isFigure) return [];
    if (pacerStyle !== 'focus') return [];
    if (useWordFocus) return wordFocusData.targets;
    return computeFocusTargets(lineText, fixations);
  }, [fixations, isBlank, isFigure, lineText, pacerStyle, useWordFocus, wordFocusData.targets]);
  const useSweepBar = !isBlank && !isFigure && showPacer && pacerStyle === 'sweep' && isActiveLine && lineDuration > 0;
  const useFocusTargets = !isBlank && !isFigure && showPacer && pacerStyle === 'focus' && isActiveLine && lineDuration > 0 && focusTargets.length > 0;
  const useGenerationSweepReveal = generationSweepReveal && renderGenerationMaskSlots && useSweepBar && lineText !== line.text;
  const revealFrameRef = useRef<number | null>(null);
  const revealStartTimeRef = useRef<number | null>(null);
  const revealAccumulatedRef = useRef(0);
  const [generationRevealElapsedMs, setGenerationRevealElapsedMs] = useState(0);
  const focusTimingTargets = useMemo(() => (
    useFocusTargets && focusTarget !== 'word'
      ? computeFixationTimingTargets(lineText, focusTargets)
      : focusTargets
  ), [focusTarget, focusTargets, lineText, useFocusTargets]);
  const focusTimings = useMemo(() => (
    useFocusTargets
      ? computeFocusTargetTimings(lineText, focusTimingTargets, focusTarget === 'word' ? 'word' : 'char')
      : []
  ), [focusTarget, focusTimingTargets, lineText, useFocusTargets]);
  const focusSegments = useMemo(() => (
    useFocusTargets
      ? computeFocusRenderSegments(lineText, focusTargets, focusTimings)
      : []
  ), [focusTargets, focusTimings, lineText, useFocusTargets]);

  // Sweep-synced ORP decoloring: ORPs start amber, turn plain as sweep passes
  const sweepDecolors = useSweepBar && saccadeShowOVP && fixations.length > 0;
  const focusDecolors = useFocusTargets && saccadeShowOVP && fixations.length > 0;

  // Static amber ORPs: all lines when pacer off, or current + future lines when pacer on
  const showStaticOVP = saccadeShowOVP && !sweepDecolors && !focusDecolors && (
    !showPacer || isActiveLine || isFutureLine
  );

  const keyframeBlocks = useMemo(() => {
    const blocks: string[] = [];

    if (useSweepBar) {
      blocks.push(
        `@keyframes sweep-${lineIndex} { from { width: 0ch; } to { width: ${textLength}ch; } }`
      );
    }
    if (sweepDecolors) {
      blocks.push(generateDecolorKeyframes(lineIndex, fixations, textLength));
    }
    if (focusDecolors) {
      blocks.push(generateFocusDecolorKeyframes(lineIndex, fixations, focusTargets, focusTimings));
    }
    if (useFocusTargets && focusSegments.length > 0) {
      blocks.push(generateFocusKeyframes(lineIndex, focusSegments.map(({ startPct, endPct }) => ({ startPct, endPct }))));
    }

    return blocks;
  }, [
    useSweepBar,
    lineIndex,
    textLength,
    sweepDecolors,
    focusDecolors,
    fixations,
    focusTargets,
    focusTimings,
    useFocusTargets,
    focusSegments,
  ]);

  const decolorConfig = useMemo(() => (
    (sweepDecolors || focusDecolors) ? { lineIndex, lineDuration, isPlaying } : undefined
  ), [focusDecolors, isPlaying, lineDuration, lineIndex, sweepDecolors]);
  const focusConfig = useMemo(() => (
    useFocusTargets && focusSegments.length > 0
      ? { lineIndex, lineDuration, isPlaying, focusSegments }
      : undefined
  ), [focusSegments, isPlaying, lineDuration, lineIndex, useFocusTargets]);

  const lineClasses = [
    'saccade-line',
    isHeading && 'saccade-line-heading',
    useSweepBar && 'saccade-line-sweep',
    useFocusTargets && 'saccade-line-focus',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (!useGenerationSweepReveal) {
      if (revealFrameRef.current !== null) {
        cancelAnimationFrame(revealFrameRef.current);
        revealFrameRef.current = null;
      }
      revealStartTimeRef.current = null;
      revealAccumulatedRef.current = 0;
      setGenerationRevealElapsedMs(0);
      return;
    }

    const maxDuration = Math.max(0, lineDuration);
    const tick = (now: number) => {
      if (!useGenerationSweepReveal || !isPlaying) return;
      if (revealStartTimeRef.current === null) {
        revealStartTimeRef.current = now;
      }
      const elapsed = revealAccumulatedRef.current + (now - revealStartTimeRef.current);
      const clamped = Math.min(maxDuration, elapsed);
      setGenerationRevealElapsedMs(clamped);
      if (clamped >= maxDuration) {
        revealFrameRef.current = null;
        return;
      }
      revealFrameRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      if (revealFrameRef.current !== null) {
        cancelAnimationFrame(revealFrameRef.current);
      }
      revealFrameRef.current = requestAnimationFrame(tick);
    } else {
      if (revealFrameRef.current !== null) {
        cancelAnimationFrame(revealFrameRef.current);
        revealFrameRef.current = null;
      }
      if (revealStartTimeRef.current !== null) {
        const now = performance.now();
        revealAccumulatedRef.current = Math.min(
          maxDuration,
          revealAccumulatedRef.current + (now - revealStartTimeRef.current)
        );
        revealStartTimeRef.current = null;
      }
      setGenerationRevealElapsedMs(revealAccumulatedRef.current);
    }

    return () => {
      if (revealFrameRef.current !== null) {
        cancelAnimationFrame(revealFrameRef.current);
        revealFrameRef.current = null;
      }
    };
  }, [isPlaying, lineDuration, useGenerationSweepReveal]);

  const generationRevealCharCount = useMemo(() => {
    if (!useGenerationSweepReveal || textLength <= 0 || lineDuration <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, generationRevealElapsedMs / lineDuration));
    return Math.max(0, Math.min(textLength, Math.floor(ratio * textLength)));
  }, [generationRevealElapsedMs, lineDuration, textLength, useGenerationSweepReveal]);

  if (isBlank) {
    return (
      <div className="saccade-line">
        <span>{'\u00A0'}</span>
      </div>
    );
  }

  if (isFigure) {
    const figureClassName = [
      'saccade-line',
      'saccade-line-figure',
      line.isEquation && 'saccade-line-equation',
      isActiveLine && 'saccade-line-figure-active',
    ].filter(Boolean).join(' ');

    return (
      <div className={figureClassName}>
        {line.figureSrc ? (
          <button
            type="button"
            className="saccade-figure-button"
            onClick={() => {
              if (isPlaying) return;
              if (!line.figureSrc) return;
              onOpenFigure?.({
                src: line.figureSrc,
                alt: line.figureCaption || line.text || `Figure ${line.figureId || ''}`,
                caption: line.figureCaption,
              });
            }}
            disabled={isPlaying}
            title={isPlaying ? undefined : 'Click to enlarge'}
          >
            <img
              src={line.figureSrc}
              alt={line.figureCaption || line.text || `Figure ${line.figureId || ''}`}
              className="saccade-figure-image"
              loading="lazy"
            />
          </button>
        ) : (
          <div className="saccade-figure-missing">
            [{line.isEquation ? 'Missing equation image' : `Missing figure${line.figureId ? `: ${line.figureId}` : ''}`}]
          </div>
        )}
        {line.figureCaption && (
          <div className="saccade-figure-caption">{line.figureCaption}</div>
        )}
      </div>
    );
  }

  return (
    <div className={lineClasses} key={isActiveLine ? lineIndex : undefined}>
      {keyframeBlocks.length > 0 && <style>{keyframeBlocks.join(' ')}</style>}
      {useSweepBar && (
        <span
          className="saccade-sweep"
          style={{
            animation: `sweep-${lineIndex} ${lineDuration}ms linear both`,
            animationPlayState: isPlaying ? 'running' : 'paused',
          }}
        />
      )}
      {useGenerationSweepReveal ? (
        renderGenerationSweepRevealLine({
          isHeading,
          maskedText: lineText,
          originalText: line.text,
          revealCharCount: generationRevealCharCount,
        })
      ) : (
        focusConfig
          ? renderLineTextWithFocus(lineText, isHeading, showStaticOVP || focusDecolors, fixations, focusConfig, decolorConfig, renderGenerationMaskSlots)
          : renderLineText(lineText, isHeading, showStaticOVP || sweepDecolors, fixations, decolorConfig, renderGenerationMaskSlots)
      )}
    </div>
  );
});

SaccadeLineComponent.displayName = 'SaccadeLineComponent';

function renderGenerationSweepRevealLine(config: {
  isHeading: boolean;
  maskedText: string;
  originalText: string;
  revealCharCount: number;
}): JSX.Element {
  const className = config.isHeading ? 'saccade-heading' : 'saccade-body';
  const chars: JSX.Element[] = [];
  const revealLimit = Math.max(0, Math.min(config.maskedText.length, config.revealCharCount));

  for (let i = 0; i < config.maskedText.length; i++) {
    const char = i < revealLimit ? config.originalText[i] : config.maskedText[i];
    if (char === '_') {
      chars.push(<span key={`mask-${i}`} className="generation-grid-cell generation-mask-slot" aria-hidden="true" />);
      continue;
    }
    chars.push(
      <span key={`char-${i}`} className="generation-grid-cell">
        {char === ' ' ? '\u00A0' : char}
      </span>
    );
  }

  return <span className={`${className} generation-grid-text`}>{chars}</span>;
}

/**
 * Generate per-ORP @keyframes that transition from amber to plain text
 * when the continuous sweep bar reaches each ORP's character position.
 * Uses paired keyframes with a 0.01% gap for sharp transitions.
 */
function generateDecolorKeyframes(lineIndex: number, fixations: number[], textLength: number): string {
  const amber = 'color: var(--saccade-ovp-color); font-weight: 600';
  const plain = 'color: var(--text-primary); font-weight: normal';
  const eps = 0.01;
  const fmt = (v: number) => v.toFixed(2);

  return fixations.map((charIdx, i) => {
    const pct = (charIdx / textLength) * 100;
    const kf = `0%, ${fmt(pct)}% { ${amber} } ${fmt(pct + eps)}%, 100% { ${plain} }`;
    return `@keyframes orp-${lineIndex}-${i} { ${kf} }`;
  }).join(' ');
}

function generateFocusDecolorKeyframes(
  lineIndex: number,
  fixations: number[],
  focusTargets: Array<{ startChar: number; endChar: number }>,
  focusTimings: Array<{ startPct: number; endPct: number }>,
): string {
  const amber = 'color: var(--saccade-ovp-color); font-weight: 600';
  const plain = 'color: var(--text-primary); font-weight: normal';
  const eps = 0.01;
  const fmt = (v: number) => v.toFixed(2);

  return fixations.map((charIdx, i) => {
    let targetIndex = -1;
    for (let j = focusTargets.length - 1; j >= 0; j--) {
      const target = focusTargets[j];
      if (charIdx >= target.startChar && charIdx < target.endChar) {
        targetIndex = j;
        break;
      }
    }
    if (targetIndex === -1 && focusTargets.length > 0) {
      targetIndex = focusTargets.findIndex(t => charIdx < t.endChar);
      if (targetIndex === -1) targetIndex = focusTargets.length - 1;
    }
    const pct = targetIndex >= 0
      ? focusTimings[Math.min(targetIndex, focusTimings.length - 1)].endPct
      : 100;
    const kf = `0%, ${fmt(pct)}% { ${amber} } ${fmt(pct + eps)}%, 100% { ${plain} }`;
    return `@keyframes orp-${lineIndex}-${i} { ${kf} }`;
  }).join(' ');
}

function generateFocusKeyframes(
  lineIndex: number,
  focusTimings: Array<{ startPct: number; endPct: number }>
): string {
  const active = 'background: var(--saccade-focus-highlight)';
  const inactive = 'background: transparent';
  const eps = 0.01;
  const fmt = (v: number) => v.toFixed(2);

  return focusTimings.map((timing, i) => {
    const startPct = timing.startPct;
    const endPct = timing.endPct;
    const startOn = Math.min(100, startPct + eps);
    const endOff = Math.min(100, endPct + eps);
    const kf = [
      `0%, ${fmt(startPct)}% { ${inactive} }`,
      `${fmt(startOn)}%, ${fmt(endPct)}% { ${active} }`,
      `${fmt(endOff)}%, 100% { ${inactive} }`,
    ].join(' ');
    return `@keyframes focus-${lineIndex}-${i} { ${kf} }`;
  }).join(' ');
}

interface FocusRenderSegment {
  startChar: number;
  endChar: number;
  startPct: number;
  endPct: number;
}

function computeFixationTimingTargets(
  text: string,
  overlapTargets: Array<{ startChar: number; endChar: number }>
): Array<{ startChar: number; endChar: number }> {
  if (!text || overlapTargets.length === 0) return [];

  return overlapTargets.map((target, i) => ({
    startChar: target.startChar,
    endChar: i < overlapTargets.length - 1 ? overlapTargets[i + 1].startChar : text.length,
  }));
}

function computeFocusRenderSegments(
  text: string,
  focusTargets: Array<{ startChar: number; endChar: number }>,
  focusTimings: Array<{ startPct: number; endPct: number }>
): FocusRenderSegment[] {
  if (!text || focusTargets.length === 0 || focusTimings.length === 0) return [];

  const targetCount = Math.min(focusTargets.length, focusTimings.length);
  const normalizedTargets = focusTargets
    .slice(0, targetCount)
    .map((target, i) => ({
      startChar: Math.max(0, Math.min(text.length, target.startChar)),
      endChar: Math.max(0, Math.min(text.length, target.endChar)),
      timing: focusTimings[i],
    }))
    .filter(target => target.endChar > target.startChar);
  if (normalizedTargets.length === 0) return [];

  const boundaries = Array.from(
    new Set(normalizedTargets.flatMap(target => [target.startChar, target.endChar]))
  ).sort((a, b) => a - b);
  if (boundaries.length < 2) return [];

  const segments: FocusRenderSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startChar = boundaries[i];
    const endChar = boundaries[i + 1];
    if (endChar <= startChar) continue;

    const coveredTargets: Array<{ timing: { startPct: number; endPct: number } }> = [];
    for (let targetIndex = 0; targetIndex < normalizedTargets.length; targetIndex++) {
      const target = normalizedTargets[targetIndex];
      if (startChar < target.endChar && endChar > target.startChar) {
        coveredTargets.push({ timing: target.timing });
      }
    }
    if (coveredTargets.length === 0) continue;

    const startPct = coveredTargets[0].timing.startPct;
    const endPct = coveredTargets[coveredTargets.length - 1].timing.endPct;
    if (endPct <= startPct) continue;

    segments.push({ startChar, endChar, startPct, endPct });
  }

  return segments;
}

function renderLineTextWithFocus(
  text: string,
  isHeading: boolean,
  showOVP: boolean | undefined,
  fixations: number[] | undefined,
  focusConfig: {
    lineIndex: number;
    lineDuration: number;
    isPlaying: boolean;
    focusSegments: FocusRenderSegment[];
  },
  decolorConfig?: { lineIndex: number; lineDuration: number; isPlaying: boolean },
  renderGenerationMaskSlots = false,
): JSX.Element {
  const className = isHeading ? 'saccade-heading' : 'saccade-body';

  if (!text || focusConfig.focusSegments.length === 0) {
    return renderLineText(text, isHeading, showOVP, fixations, decolorConfig, renderGenerationMaskSlots);
  }

  const segments: JSX.Element[] = [];
  let cursor = 0;

  for (let i = 0; i < focusConfig.focusSegments.length; i++) {
    const target = focusConfig.focusSegments[i];
    const start = Math.max(cursor, Math.min(text.length, target.startChar));
    const end = Math.max(start, Math.min(text.length, target.endChar));

    if (start > cursor) {
      segments.push(
        ...renderTextSliceWithFixations(
          text.slice(cursor, start),
          cursor,
          showOVP,
          fixations,
          `pre-${i}`,
          decolorConfig,
          renderGenerationMaskSlots
        )
      );
    }

    if (end > start) {
      const targetNodes = renderTextSliceWithFixations(
        text.slice(start, end),
        start,
        showOVP,
        fixations,
        `focus-${i}`,
        decolorConfig,
        renderGenerationMaskSlots
      );
      segments.push(
        <span
          key={`focus-wrap-${i}`}
          className="saccade-focus-target"
          style={{
            animation: `focus-${focusConfig.lineIndex}-${i} ${focusConfig.lineDuration}ms linear both`,
            animationPlayState: focusConfig.isPlaying ? 'running' : 'paused',
          }}
        >
          {targetNodes.length > 0 ? targetNodes : text.slice(start, end)}
        </span>
      );
    }

    cursor = end;
  }

  if (cursor < text.length) {
    segments.push(
      ...renderTextSliceWithFixations(
        text.slice(cursor),
        cursor,
        showOVP,
        fixations,
        'tail',
        decolorConfig,
        renderGenerationMaskSlots
      )
    );
  }

  return <span className={className}>{segments}</span>;
}

function renderLineText(
  text: string,
  isHeading: boolean,
  showOVP?: boolean,
  fixations?: number[],
  decolorConfig?: { lineIndex: number; lineDuration: number; isPlaying: boolean },
  renderGenerationMaskSlots = false,
): JSX.Element {
  const className = isHeading ? 'saccade-heading' : 'saccade-body';

  if (!showOVP || !fixations || fixations.length === 0 || !text) {
    return <span className={className}>{renderMaskedSlotsText(text || '\u00A0', renderGenerationMaskSlots)}</span>;
  }

  return (
    <span className={className}>
      {renderTextSliceWithFixations(text, 0, showOVP, fixations, 'line', decolorConfig, renderGenerationMaskSlots)}
    </span>
  );
}

function renderTextSliceWithFixations(
  textSlice: string,
  offset: number,
  showOVP: boolean | undefined,
  fixations: number[] | undefined,
  keyPrefix: string,
  decolorConfig?: { lineIndex: number; lineDuration: number; isPlaying: boolean },
  renderGenerationMaskSlots = false,
): JSX.Element[] {
  if (!textSlice) return [];
  if (!showOVP || !fixations || fixations.length === 0) {
    return [<span key={`${keyPrefix}-text`}>{renderMaskedSlotsText(textSlice, renderGenerationMaskSlots)}</span>];
  }

  const segments: JSX.Element[] = [];
  let cursor = 0;
  const sliceEnd = offset + textSlice.length;

  for (let i = 0; i < fixations.length; i++) {
    const globalIdx = fixations[i];
    if (globalIdx < offset || globalIdx >= sliceEnd) continue;

    const localIdx = globalIdx - offset;
    if (localIdx > cursor) {
      segments.push(
        <span key={`${keyPrefix}-t-${i}`}>
          {renderMaskedSlotsText(textSlice.slice(cursor, localIdx), renderGenerationMaskSlots)}
        </span>
      );
    }

    if (decolorConfig) {
      const style = {
        animation: `orp-${decolorConfig.lineIndex}-${i} ${decolorConfig.lineDuration}ms linear both`,
        animationPlayState: decolorConfig.isPlaying ? 'running' as const : 'paused' as const,
      };
      segments.push(
        <span key={`${keyPrefix}-f-${i}`} className="saccade-fixation" style={style}>
          {textSlice[localIdx]}
        </span>
      );
    } else {
      segments.push(
        <span key={`${keyPrefix}-f-${i}`} className="saccade-fixation">{textSlice[localIdx]}</span>
      );
    }
    cursor = localIdx + 1;
  }

  if (cursor < textSlice.length) {
    segments.push(
      <span key={`${keyPrefix}-tail`}>
        {renderMaskedSlotsText(textSlice.slice(cursor), renderGenerationMaskSlots)}
      </span>
    );
  }

  return segments;
}

function renderMaskedSlotsText(text: string, enabled: boolean): JSX.Element[] | string {
  if (!enabled || !text.includes('_')) return text;

  const nodes: JSX.Element[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '_') {
      nodes.push(<span key={`mask-${i}`} className="generation-mask-slot" aria-hidden="true" />);
      continue;
    }
    nodes.push(<span key={`char-${i}`}>{char}</span>);
  }
  return nodes;
}
