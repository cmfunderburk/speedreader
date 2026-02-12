import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Activity, Article, TokenMode } from '../types';
import { App } from './App';
import { getTodayUTC } from '../lib/wikipedia';

const mockUseRSVP = vi.fn();
const mockUseKeyboard = vi.fn();
const { mockFetchDailyArticle } = vi.hoisted(() => ({
  mockFetchDailyArticle: vi.fn(),
}));

vi.mock('../hooks/useRSVP', () => ({
  useRSVP: (...args: unknown[]) => mockUseRSVP(...args),
}));

vi.mock('../hooks/useKeyboard', () => ({
  useKeyboard: (...args: unknown[]) => mockUseKeyboard(...args),
}));

vi.mock('../lib/wikipedia', async () => {
  const actual = await vi.importActual<typeof import('../lib/wikipedia')>('../lib/wikipedia');
  return {
    ...actual,
    fetchDailyArticle: (...args: unknown[]) => mockFetchDailyArticle(...args),
  };
});

vi.mock('./HomeScreen', () => ({
  HomeScreen: (props: {
    onSelectActivity: (activity: Activity) => void;
    onStartDaily: () => void;
    onContinue?: (info: { article: Article; activity: Activity; displayMode: string }) => void;
    continueInfo?: { article: Article; activity: Activity; displayMode: string } | null;
  }) => (
    <div data-testid="home-screen">
      <button onClick={() => props.onSelectActivity('paced-reading')}>open-paced</button>
      <button onClick={() => props.onSelectActivity('active-recall')}>open-recall</button>
      <button onClick={props.onStartDaily}>start-daily</button>
      {props.continueInfo && props.onContinue && (
        <button onClick={() => props.onContinue!(props.continueInfo!)}>continue-session</button>
      )}
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

vi.mock('./PredictionReader', () => ({
  PredictionReader: () => <div data-testid="prediction-reader">prediction</div>,
}));

vi.mock('./RecallReader', () => ({
  RecallReader: () => <div data-testid="recall-reader">recall</div>,
}));

vi.mock('./ProgressBar', () => ({
  ProgressBar: () => <div data-testid="progress-bar">progress</div>,
}));

vi.mock('./TrainingReader', () => ({
  TrainingReader: () => <div data-testid="training-reader">training</div>,
}));

describe('App integration smoke', () => {
  let mockRsvp: Record<string, unknown>;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    localStorage.clear();
    mockFetchDailyArticle.mockReset();

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

    mockRsvp = {
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

  it('uses cached daily featured article without refetching', async () => {
    localStorage.setItem('speedread_daily_date', getTodayUTC());
    localStorage.setItem('speedread_daily_article_id', 'a1');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'start-daily' }));
    await waitFor(() => {
      expect(screen.queryByTestId('active-reader')).not.toBeNull();
    });

    expect(mockFetchDailyArticle).not.toHaveBeenCalled();
    expect(mockRsvp.loadArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { displayMode: 'saccade' }
    );
  });

  it('navigates into active recall exercise and returns home via header action', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'open-recall' }));
    await waitFor(() => {
      expect(screen.queryByTestId('content-browser')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-reading' }));
    await waitFor(() => {
      expect(screen.queryByTestId('prediction-reader')).not.toBeNull();
    });

    expect(mockRsvp.loadArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { displayMode: 'prediction' }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => {
      expect(screen.queryByTestId('home-screen')).not.toBeNull();
    });
  });

  it('resumes reading from snapshot when closing active exercise', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'open-recall' }));
    await waitFor(() => {
      expect(screen.queryByTestId('content-browser')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    await waitFor(() => {
      expect(screen.queryByTestId('preview-screen')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'start-reading' }));
    await waitFor(() => {
      expect(screen.queryByTestId('prediction-reader')).not.toBeNull();
    });

    localStorage.setItem('speedread_session_snapshot', JSON.stringify({
      reading: {
        articleId: 'a1',
        chunkIndex: 5,
        displayMode: 'rsvp',
      },
      training: {
        passageId: 'p1',
        mode: 'recall',
        startedAt: 1,
      },
      lastTransition: 'read-to-recall',
      updatedAt: 1,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => {
      expect(screen.queryByTestId('active-reader')).not.toBeNull();
    });

    expect(mockRsvp.loadArticle).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { displayMode: 'rsvp' }
    );
    await waitFor(() => {
      expect(mockRsvp.goToIndex).toHaveBeenCalledWith(5);
    });

    const snapshot = JSON.parse(localStorage.getItem('speedread_session_snapshot') || '{}');
    expect(snapshot.reading).toEqual({
      articleId: 'a1',
      chunkIndex: 5,
      displayMode: 'rsvp',
    });
    expect(snapshot.training).toBeUndefined();
    expect(snapshot.lastTransition).toBe('return-to-reading');
    expect(typeof snapshot.updatedAt).toBe('number');
  });

  it('continues last training session from home', async () => {
    localStorage.setItem('speedread_settings', JSON.stringify({
      lastSession: {
        articleId: 'a1',
        activity: 'training',
        displayMode: 'training',
      },
    }));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'continue-session' }));
    await waitFor(() => {
      expect(screen.queryByTestId('training-reader')).not.toBeNull();
    });

    expect(mockRsvp.loadArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      { displayMode: 'training' }
    );
  });

  it('captures a sentence passage from active reader workspace', async () => {
    const rsvp = mockRsvp as {
      article: Article | null;
      displayMode: string;
      chunks: Array<{
        text: string;
        wordCount: number;
        orpIndex: number;
        saccade?: { pageIndex: number; lineIndex: number; startChar: number; endChar: number };
      }>;
      currentChunk: {
        text: string;
        wordCount: number;
        orpIndex: number;
        saccade?: { pageIndex: number; lineIndex: number; startChar: number; endChar: number };
      } | null;
      currentChunkIndex: number;
      saccadePages: Array<{ lines: Array<{ type: string; text: string }> }>;
    };
    const article: Article = {
      id: 'a1',
      title: 'Article 1',
      content: 'Alpha beta gamma.',
      source: 'Test',
      addedAt: 1,
      readPosition: 0,
      isRead: false,
    };
    rsvp.article = article;
    rsvp.displayMode = 'saccade';
    rsvp.chunks = [
      {
        text: 'Alpha',
        wordCount: 1,
        orpIndex: 0,
        saccade: { pageIndex: 0, lineIndex: 0, startChar: 0, endChar: 5 },
      },
    ];
    rsvp.currentChunk = rsvp.chunks[0];
    rsvp.currentChunkIndex = 0;
    rsvp.saccadePages = [
      {
        lines: [{ type: 'body', text: 'Alpha beta gamma.' }],
      },
    ];

    render(<App />);

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

    const captureBtn = screen.getByRole('button', { name: 'Save Sentence' });
    expect((captureBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(captureBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Saved sentence to passage queue/i)).not.toBeNull();
    });

    const savedPassages = JSON.parse(localStorage.getItem('speedread_passages') || '[]') as Array<{
      articleId: string;
      captureKind: string;
      text: string;
      sourceMode: string;
    }>;
    expect(savedPassages).toHaveLength(1);
    expect(savedPassages[0]).toMatchObject({
      articleId: 'a1',
      captureKind: 'sentence',
      sourceMode: 'saccade',
      text: 'Alpha beta gamma.',
    });
  });
});
