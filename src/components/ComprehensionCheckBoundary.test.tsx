import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ComprehensionCheckBoundary } from './ComprehensionCheckBoundary';

describe('ComprehensionCheckBoundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders fallback and allows dismissal/retry', () => {
    const onClose = vi.fn();
    let boundary: ComprehensionCheckBoundary | null = null;

    render(
      <ComprehensionCheckBoundary
        onClose={onClose}
        ref={(instance) => {
          boundary = instance;
        }}
      >
        <p>Healthy child</p>
      </ComprehensionCheckBoundary>
    );

    expect(screen.getByText('Healthy child')).toBeTruthy();

    act(() => {
      boundary?.setState({ hasError: true });
    });

    expect(screen.getByText(/Something went wrong while rendering this check/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Healthy child')).toBeTruthy();
  });
});
