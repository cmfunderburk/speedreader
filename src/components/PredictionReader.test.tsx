import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { PredictionReader } from './PredictionReader';
import type { Chunk } from '../types';

const CHUNKS: Chunk[] = [
  { text: 'alpha', wordCount: 1, orpIndex: 0 },
  { text: 'beta.', wordCount: 1, orpIndex: 0 },
  { text: 'gamma', wordCount: 1, orpIndex: 0 },
  { text: 'delta.', wordCount: 1, orpIndex: 0 },
];

function renderPredictionReader(overrides: Partial<ComponentProps<typeof PredictionReader>> = {}) {
  const props: ComponentProps<typeof PredictionReader> = {
    chunks: CHUNKS,
    currentChunkIndex: 1,
    onAdvance: vi.fn(),
    onPredictionResult: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
    stats: {
      totalWords: 0,
      exactMatches: 0,
      knownWords: 0,
    },
    wpm: 300,
    goToIndex: vi.fn(),
    onWpmChange: vi.fn(),
    previewMode: 'unlimited',
    previewSentenceCount: 2,
    ...overrides,
  };

  return {
    ...render(<PredictionReader {...props} />),
    props,
  };
}

describe('PredictionReader preview lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates one interval per preview start and stops cleanly', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { props } = renderPredictionReader();

    const input = screen.getByRole('textbox');
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(props.goToIndex).toHaveBeenLastCalledWith(1);
  });

  it('restarts preview with a new interval after stop', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    renderPredictionReader();

    const input = screen.getByRole('textbox');
    input.focus();

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
  });

  it('cleans preview interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderPredictionReader();

    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.keyDown(window, { key: 'Tab' });

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('advances preview at configured speed while active', () => {
    renderPredictionReader();

    const input = screen.getByRole('textbox');
    input.focus();
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(
      screen.queryByText((_, element) => element?.textContent === 'beta.')
    ).not.toBeNull();
    expect(screen.queryByText(/Previewing continuously/)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(
      screen.queryByText((_, element) => element?.textContent === 'gamma')
    ).not.toBeNull();
  });
});
