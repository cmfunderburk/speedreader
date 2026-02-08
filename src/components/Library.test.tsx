import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Library } from './Library';
import type { LibraryItem, LibrarySource } from '../types/electron';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('Library', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete window.library;
  });

  it('ignores stale listBooks responses when switching sources quickly', async () => {
    const sources: LibrarySource[] = [
      { name: 'Source A', path: '/tmp/source-a' },
      { name: 'Source B', path: '/tmp/source-b' },
    ];

    const aResponse = deferred<LibraryItem[]>();
    const bResponse = deferred<LibraryItem[]>();

    window.library = {
      getSources: vi.fn().mockResolvedValue(sources),
      listBooks: vi.fn((dirPath: string) => {
        if (dirPath === '/tmp/source-a') return aResponse.promise;
        if (dirPath === '/tmp/source-b') return bResponse.promise;
        return Promise.resolve([]);
      }),
      openBook: vi.fn(),
      addSource: vi.fn(),
      removeSource: vi.fn(),
      selectDirectory: vi.fn(),
    };

    render(<Library onAdd={vi.fn()} onOpenSettings={vi.fn()} />);

    await waitFor(() => {
      expect(window.library?.listBooks).toHaveBeenCalledWith('/tmp/source-a');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Source B' }));

    await waitFor(() => {
      expect(window.library?.listBooks).toHaveBeenCalledWith('/tmp/source-b');
    });

    bResponse.resolve([
      {
        name: 'book-b.txt',
        path: '/tmp/source-b/book-b.txt',
        type: 'txt',
        size: 42,
        modifiedAt: Date.now(),
      },
    ]);

    await waitFor(() => {
      expect(screen.queryByText('book-b.txt')).not.toBeNull();
    });

    aResponse.resolve([
      {
        name: 'book-a.txt',
        path: '/tmp/source-a/book-a.txt',
        type: 'txt',
        size: 42,
        modifiedAt: Date.now(),
      },
    ]);

    await waitFor(() => {
      expect(screen.queryByText('book-a.txt')).toBeNull();
    });
  });
});
