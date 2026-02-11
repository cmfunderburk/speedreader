import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LibrarySettings } from './LibrarySettings';
import type { LibrarySource } from '../types/electron';

describe('LibrarySettings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    delete window.library;
  });

  it('exports a manifest and shows summary notice', async () => {
    const sources: LibrarySource[] = [{ name: 'Shared Books', path: '/tmp/shared-books' }];

    window.library = {
      getSources: vi.fn().mockResolvedValue(sources),
      listBooks: vi.fn(),
      openBook: vi.fn(),
      addSource: vi.fn(),
      removeSource: vi.fn(),
      selectDirectory: vi.fn(),
      exportManifest: vi.fn().mockResolvedValue({
        status: 'exported',
        path: '/tmp/reader-manifest.json',
        sourceCount: 1,
        entryCount: 3,
      }),
      importManifest: vi.fn(),
    };

    render(<LibrarySettings onClose={vi.fn()} />);

    const exportBtn = await screen.findByRole('button', { name: 'Export Manifest' });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText(/Manifest exported to \/tmp\/reader-manifest\.json/)).toBeTruthy();
    });
    expect(window.library.exportManifest).toHaveBeenCalledTimes(1);
  });

  it('imports manifest and refreshes configured sources', async () => {
    const initialSources: LibrarySource[] = [];
    const importedSources: LibrarySource[] = [{ name: 'Shared Books', path: '/mnt/share/books' }];

    window.library = {
      getSources: vi.fn()
        .mockResolvedValueOnce(initialSources)
        .mockResolvedValueOnce(importedSources),
      listBooks: vi.fn(),
      openBook: vi.fn(),
      addSource: vi.fn(),
      removeSource: vi.fn(),
      selectDirectory: vi.fn(),
      exportManifest: vi.fn(),
      importManifest: vi.fn().mockResolvedValue({
        status: 'imported',
        added: 1,
        existing: 0,
        missing: 0,
        results: [],
      }),
    };

    render(<LibrarySettings onClose={vi.fn()} />);

    const importBtn = await screen.findByRole('button', { name: 'Import Manifest' });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByText(/Import complete: 1 added, 0 already configured, 0 missing/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText('Shared Books')).toBeTruthy();
    });

    expect(window.library.importManifest).toHaveBeenCalledTimes(1);
    expect(window.library.getSources).toHaveBeenCalledTimes(2);
  });
});
