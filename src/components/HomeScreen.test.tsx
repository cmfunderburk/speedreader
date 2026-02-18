import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';
import type { ComprehensionAttempt } from '../types';

const baseProps = {
  onSelectActivity: vi.fn(),
  onContinue: vi.fn(),
  onStartDrill: vi.fn(),
  onStartDaily: vi.fn(),
  onStartComprehensionBuilder: vi.fn(),
  dailyStatus: 'idle' as const,
  dailyError: null,
  onStartRandom: vi.fn(),
  randomStatus: 'idle' as const,
  randomError: null,
  continueInfo: null,
  comprehensionSummary: { attemptCount: 0, lastScore: null as number | null },
  comprehensionAttempts: [] as ComprehensionAttempt[],
};

function makeAttempt(overrides: Partial<ComprehensionAttempt> = {}): ComprehensionAttempt {
  return {
    id: 'attempt-1',
    articleId: 'article-1',
    articleTitle: 'Mill on Reading',
    entryPoint: 'launcher',
    questions: [
      {
        id: 'q1',
        dimension: 'factual',
        format: 'short-answer',
        prompt: 'What is the main question?',
        userAnswer: 'What is the book about?',
        modelAnswer: 'What is the book about?',
        score: 3,
        feedback: 'Correct and concise.',
      },
    ],
    overallScore: 96,
    createdAt: 1_738_000_000_000,
    durationMs: 125000,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('HomeScreen', () => {
  it('shows generation mode on the paced reading card', () => {
    render(<HomeScreen {...baseProps} />);

    const pacedReadingHeading = screen.getByRole('heading', { name: 'Paced Reading' });
    const pacedReadingCard = pacedReadingHeading.closest('button');
    expect(pacedReadingCard).toBeTruthy();

    const pacedReading = within(pacedReadingCard as HTMLButtonElement);
    expect(pacedReading.getByText('RSVP')).toBeTruthy();
    expect(pacedReading.getByText('Saccade')).toBeTruthy();
    expect(pacedReading.getByText('Generation')).toBeTruthy();
  });

  it('toggles and renders comprehension history attempts', () => {
    render(
      <HomeScreen
        {...baseProps}
        comprehensionSummary={{ attemptCount: 1, lastScore: 96 }}
        comprehensionAttempts={[makeAttempt()]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review History' }));
    expect(screen.getByRole('heading', { name: 'Comprehension History' })).toBeTruthy();
    expect(screen.getByText('Mill on Reading')).toBeTruthy();
    expect(screen.getByText(/Score 96%/i)).toBeTruthy();
  });

  it('shows an empty state when no history exists', () => {
    render(<HomeScreen {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Review History' }));
    expect(screen.getByText('No comprehension attempts yet.')).toBeTruthy();
  });
});
