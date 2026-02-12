import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Article } from '../types';
import { TrainingReader } from './TrainingReader';

vi.mock('../lib/trainingReading', async () => {
  const actual = await vi.importActual<typeof import('../lib/trainingReading')>('../lib/trainingReading');
  return {
    ...actual,
    planTrainingReadingStart: () => ({ type: 'to-recall' as const }),
    planTrainingReadingStep: () => ({ type: 'to-recall' as const }),
  };
});

describe('TrainingReader integration smoke', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('speedread_training_scaffold', 'true');

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('runs recall miss -> continue -> feedback -> complete flow', async () => {
    const article: Article = {
      id: 'a1',
      title: 'Article 1',
      content: 'Alpha',
      source: 'Test',
      addedAt: 1,
      readPosition: 0,
      isRead: false,
    };

    render(
      <TrainingReader
        article={article}
        initialWpm={300}
        onClose={vi.fn()}
        onWpmChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Start from 1/i }));

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.queryByText('Press Space to continue')).not.toBeNull();
    });

    fireEvent.keyDown(window, { key: ' ' });

    await waitFor(() => {
      expect(screen.queryByText('Feedback')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    const retryInput = await screen.findByRole('textbox');
    fireEvent.change(retryInput, { target: { value: 'Alpha' } });
    fireEvent.keyDown(retryInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.queryByText('Feedback')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => {
      expect(screen.queryByText('Training Complete')).not.toBeNull();
    });
  });

  it('supports no-scaffold tokenized recall submission flow', async () => {
    localStorage.setItem('speedread_training_scaffold', 'false');

    const article: Article = {
      id: 'a2',
      title: 'Article 2',
      content: 'Alpha beta',
      source: 'Test',
      addedAt: 1,
      readPosition: 0,
      isRead: false,
    };

    render(
      <TrainingReader
        article={article}
        initialWpm={300}
        onClose={vi.fn()}
        onWpmChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Start from 1/i }));

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Alpha beta ' } });

    await waitFor(() => {
      expect(screen.queryByText('Feedback')).not.toBeNull();
    });
  });
});
