import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRSVP } from './useRSVP';
import {
  createTestArticle,
  seedArticles,
  getStoredPosition,
  getStoredPredictionPosition,
  clearStorage,
  resetIdCounter,
} from '../test/storage-helpers';
import type { Article } from '../types';

const TEST_CONTENT = 'one two three four five six seven eight nine ten';

function makeArticle(overrides: Partial<Article> = {}): Article {
  const article = createTestArticle({ content: TEST_CONTENT, ...overrides });
  seedArticles([article]);
  return article;
}

beforeEach(() => {
  vi.useFakeTimers();
  clearStorage();
  resetIdCounter();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRSVP — load and reset', () => {
  it('loads article and produces chunks', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    expect(result.current.chunks.length).toBe(10);
    expect(result.current.currentChunkIndex).toBe(0);
    expect(result.current.article).toBeTruthy();
  });

  it('resumes from saved readPosition', () => {
    const article = makeArticle({ readPosition: 5 });

    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    expect(result.current.currentChunkIndex).toBe(5);
  });

  it('clamps saved readPosition to last chunk', () => {
    const article = makeArticle({ readPosition: 999 });

    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    expect(result.current.currentChunkIndex).toBe(9); // 10 chunks, max index 9
  });

  it('reset sets index back to 0', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(5));
    expect(result.current.currentChunkIndex).toBe(5);

    act(() => result.current.reset());
    expect(result.current.currentChunkIndex).toBe(0);
  });
});

describe('useRSVP — play and pause', () => {
  it('play starts playback', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 600 })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.play());

    expect(result.current.isPlaying).toBe(true);
  });

  it('pause stops playback and persists position', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 600 })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(3));
    act(() => result.current.play());
    act(() => result.current.pause());

    expect(result.current.isPlaying).toBe(false);
    expect(getStoredPosition(article.id)).toBe(3);
  });

  it('auto-advance moves through chunks over time', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp', initialWpm: 600 })
    );

    act(() => result.current.loadArticle(article));
    expect(result.current.currentChunkIndex).toBe(0);

    act(() => result.current.play());

    // At 600 WPM, each word takes ~100ms. Advance enough for a few ticks.
    act(() => vi.advanceTimersByTime(100));
    const indexAfterOneTick = result.current.currentChunkIndex;
    expect(indexAfterOneTick).toBeGreaterThanOrEqual(1);
  });

  it('toggle switches between play and pause', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    act(() => result.current.toggle());
    expect(result.current.isPlaying).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.isPlaying).toBe(false);
  });
});

describe('useRSVP — goToIndex', () => {
  it('sets exact index within bounds', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(7));

    expect(result.current.currentChunkIndex).toBe(7);
  });

  it('clamps negative index to 0', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(-5));

    expect(result.current.currentChunkIndex).toBe(0);
  });

  it('clamps index above chunks.length - 1', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(100));

    expect(result.current.currentChunkIndex).toBe(9); // 10 chunks
  });

  it('next/prev step by one within bounds', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));

    act(() => result.current.next());
    expect(result.current.currentChunkIndex).toBe(1);

    act(() => result.current.next());
    expect(result.current.currentChunkIndex).toBe(2);

    act(() => result.current.prev());
    expect(result.current.currentChunkIndex).toBe(1);
  });

  it('prev does not go below 0', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.prev());

    expect(result.current.currentChunkIndex).toBe(0);
  });

  it('next does not go above chunks.length - 1', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(9));
    act(() => result.current.next());

    expect(result.current.currentChunkIndex).toBe(9);
  });
});

describe('useRSVP — advanceSelfPaced', () => {
  it('advances index by 1', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.advanceSelfPaced());

    expect(result.current.currentChunkIndex).toBe(1);
  });

  it('allows index to reach chunks.length (completion)', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article));

    // Advance all the way through
    const total = result.current.chunks.length;
    for (let i = 0; i < total; i++) {
      act(() => result.current.advanceSelfPaced());
    }

    expect(result.current.currentChunkIndex).toBe(total); // one past end
  });

  it('does not go beyond chunks.length', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article));

    const total = result.current.chunks.length;
    // Advance well past the end
    for (let i = 0; i < total + 5; i++) {
      act(() => result.current.advanceSelfPaced());
    }

    expect(result.current.currentChunkIndex).toBe(total); // capped at length
  });
});

describe('useRSVP — mode switch retokenization', () => {
  it('switching token mode retokenizes and preserves approximate position', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    const wordChunkCount = result.current.chunks.length;
    expect(wordChunkCount).toBe(10);

    // Move to middle
    act(() => result.current.goToIndex(5));

    // Switch to phrase mode — fewer chunks, position should map proportionally
    act(() => result.current.setMode('phrase'));

    const phraseChunkCount = result.current.chunks.length;
    expect(phraseChunkCount).toBeLessThan(wordChunkCount);
    expect(result.current.currentChunkIndex).toBeGreaterThanOrEqual(0);
    expect(result.current.currentChunkIndex).toBeLessThan(phraseChunkCount);
  });

  it('switching display mode to prediction uses word tokenization', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'phrase', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.setDisplayMode('prediction'));

    // Prediction forces word tokenization regardless of token mode setting
    expect(result.current.chunks.length).toBe(10);
    expect(result.current.displayMode).toBe('prediction');
  });

  it('entering prediction restores saved prediction position', () => {
    const article = makeArticle({ predictionPosition: 4 });
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.setDisplayMode('prediction'));

    expect(result.current.currentChunkIndex).toBe(4);
  });

  it('leaving prediction saves position, re-entering restores it', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'prediction' })
    );

    act(() => result.current.loadArticle(article));

    // Advance in prediction mode
    act(() => result.current.advanceSelfPaced());
    act(() => result.current.advanceSelfPaced());
    act(() => result.current.advanceSelfPaced());
    expect(result.current.currentChunkIndex).toBe(3);

    // Switch to RSVP
    act(() => result.current.setDisplayMode('rsvp'));

    // Prediction position should have been saved to storage
    expect(getStoredPredictionPosition(article.id)).toBe(3);

    // Switch back to prediction — should restore position
    act(() => result.current.setDisplayMode('prediction'));
    expect(result.current.currentChunkIndex).toBe(3);
  });

  it('entering recall mode resets to beginning', () => {
    const article = makeArticle();
    const { result } = renderHook(() =>
      useRSVP({ initialMode: 'word', initialDisplayMode: 'rsvp' })
    );

    act(() => result.current.loadArticle(article));
    act(() => result.current.goToIndex(5));
    act(() => result.current.setDisplayMode('recall'));

    expect(result.current.currentChunkIndex).toBe(0);
  });
});
