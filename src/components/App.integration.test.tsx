import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Activity, Article, TokenMode } from '../types';
import { App } from './App';

const mockUseRSVP = vi.fn();
const mockUseKeyboard = vi.fn();

vi.mock('../hooks/useRSVP', () => ({
  useRSVP: (...args: unknown[]) => mockUseRSVP(...args),
}));

vi.mock('../hooks/useKeyboard', () => ({
  useKeyboard: (...args: unknown[]) => mockUseKeyboard(...args),
}));

vi.mock('./HomeScreen', () => ({
  HomeScreen: (props: { onSelectActivity: (activity: Activity) => void }) => (
    <div data-testid="home-screen">
      <button onClick={() => props.onSelectActivity('paced-reading')}>open-paced</button>
    </div>
  ),
}));

vi.mock('./ContentBrowser', () => ({
  ContentBrowser: (props: { onSelectArticle: (article: Article) => void; articles: Article[] }) => (
    <div data-testid="content-browser">
      <button onClick={() => props.onSelectArticle(props.articles[0])}>select-first</button>
    </div>
  ),
}));

vi.mock('./ArticlePreview', () => ({
  ArticlePreview: (props: { article: Article; onStart: (article: Article, wpm: number, mode: TokenMode) => void }) => (
    <div data-testid="preview-screen">
      <button onClick={() => props.onStart(props.article, 300, 'word')}>start-reading</button>
    </div>
  ),
}));

vi.mock('./Reader', () => ({
  Reader: () => <div data-testid="active-reader">reader</div>,
}));

vi.mock('./ReaderControls', () => ({
  ReaderControls: () => <div data-testid="reader-controls">controls</div>,
}));

vi.mock('./ProgressBar', () => ({
  ProgressBar: () => <div data-testid="progress-bar">progress</div>,
}));

describe('App integration smoke', () => {
  beforeEach(() => {
    localStorage.clear();

    const article: Article = {
      id: 'a1',
      title: 'Article 1',
      content: 'Alpha beta gamma.',
      source: 'Test',
      addedAt: 1,
      readPosition: 0,
      isRead: false,
    };
    localStorage.setItem('speedread_articles', JSON.stringify([article]));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });

    const mockRsvp = {
      article: null,
      chunks: [],
      currentChunk: null,
      currentChunkIndex: 0,
      currentSaccadePage: null,
      currentSaccadePageIndex: 0,
      displayMode: 'rsvp' as const,
      effectiveWpm: 300,
      goToIndex: vi.fn(),
      handlePredictionResult: vi.fn(),
      isPlaying: false,
      linesPerPage: 12,
      loadArticle: vi.fn(),
      mode: 'word' as const,
      next: vi.fn(),
      nextPage: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      predictionStats: { totalWords: 0, exactMatches: 0, knownWords: 0 },
      prev: vi.fn(),
      prevPage: vi.fn(),
      rampEnabled: false,
      reset: vi.fn(),
      resetPredictionStats: vi.fn(),
      saccadePages: [],
      setDisplayMode: vi.fn(),
      setLinesPerPage: vi.fn(),
      setMode: vi.fn(),
      setRampEnabled: vi.fn(),
      setShowPacer: vi.fn(),
      setWpm: vi.fn(),
      showPacer: true,
      toggle: vi.fn(),
      wpm: 300,
      advanceSelfPaced: vi.fn(),
    };

    mockUseRSVP.mockReturnValue(mockRsvp);
    mockUseKeyboard.mockImplementation(() => {});
  });

  it('navigates home -> content-browser -> preview -> active-reader -> home', async () => {
    render(<App />);

    expect(screen.queryByTestId('home-screen')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'open-paced' }));
    await waitFor(() => {
      expect(screen.queryByTestId('content-browser')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-reading' }));
    await waitFor(() => {
      expect(screen.queryByTestId('active-reader')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });
  });
});
