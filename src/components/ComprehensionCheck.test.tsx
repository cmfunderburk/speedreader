import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ComprehensionCheck } from './ComprehensionCheck';
import type { ComprehensionAdapter } from '../lib/comprehensionAdapter';
import type { Article, GeneratedComprehensionCheck } from '../types';

function makeArticle(): Article {
  return {
    id: 'a1',
    title: 'Test Article',
    content: 'This is a sample passage used for comprehension testing.',
    source: 'test',
    addedAt: 1,
    readPosition: 0,
    isRead: false,
  };
}

describe('ComprehensionCheck', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('runs generation -> answer -> scoring flow and persists attempt', async () => {
    const generated: GeneratedComprehensionCheck = {
      questions: [
        {
          id: 'q1',
          dimension: 'factual',
          format: 'multiple-choice',
          prompt: 'What is this passage used for?',
          options: ['Decoration', 'Comprehension testing', 'Poetry', 'Advertising'],
          correctOptionIndex: 1,
          modelAnswer: 'It is used for comprehension testing.',
        },
        {
          id: 'q2',
          dimension: 'inference',
          format: 'short-answer',
          prompt: 'What does this imply about the check?',
          modelAnswer: 'It implies the check is passage-grounded.',
        },
        {
          id: 'q3',
          dimension: 'evaluative',
          format: 'essay',
          prompt: 'Is this a useful test passage and why?',
          modelAnswer: 'It is useful because it is concise and explicit.',
        },
      ],
    };

    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => generated),
      scoreAnswer: vi.fn(async () => ({
        score: 2,
        feedback: 'Reasonable answer with one omission.',
      })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Question 1 of 3/i)).toBeTruthy();
    });
    expect(screen.getByText(/Closed-book phase/i)).toBeTruthy();
    expect(screen.queryByText('Show passage')).toBeNull();

    fireEvent.click(screen.getByLabelText('Comprehension testing'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText(/Question 2 of 3/i)).toBeTruthy();
    });
    expect(screen.getByText(/Open-book phase/i)).toBeTruthy();
    expect(screen.getByText('Show passage')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Write a short answer'), {
      target: { value: 'It is grounded in a specific passage.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByPlaceholderText('Write your response'), {
      target: { value: 'Yes, because it is clear and focused.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText(/Comprehension Check Results/i)).toBeTruthy();
    });

    const stored = JSON.parse(localStorage.getItem('speedread_comprehension_attempts') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      articleId: 'a1',
      articleTitle: 'Test Article',
      entryPoint: 'launcher',
    });
    expect(stored[0].questions).toHaveLength(3);
    expect(adapter.scoreAnswer).toHaveBeenCalledTimes(2);
  });

  it('shows missing-key prompt with open-settings action', async () => {
    const onOpenSettings = vi.fn();
    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => {
        throw new Error('Comprehension check requires an API key');
      }),
      scoreAnswer: vi.fn(async () => ({ score: 0, feedback: '' })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        onOpenSettings={onOpenSettings}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/requires an API key/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('shows raw API-key errors and does not treat them as missing-key', async () => {
    const onOpenSettings = vi.fn();
    const adapter: ComprehensionAdapter = {
      generateCheck: vi.fn(async () => {
        throw new Error('Gemini request failed (400): API key not valid. Please pass a valid API key.');
      }),
      scoreAnswer: vi.fn(async () => ({ score: 0, feedback: '' })),
    };

    render(
      <ComprehensionCheck
        article={makeArticle()}
        entryPoint="launcher"
        adapter={adapter}
        onClose={() => {}}
        onOpenSettings={onOpenSettings}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/API key not valid/i)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
    expect(onOpenSettings).toHaveBeenCalledTimes(0);
  });
});
