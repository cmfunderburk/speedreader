import { useState, useEffect, useCallback } from 'react';
import type { LibrarySource, LibraryImportResult } from '../types/electron';

interface LibrarySettingsProps {
  onClose: () => void;
}

export function LibrarySettings({ onClose }: LibrarySettingsProps) {
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSharingAction, setIsSharingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshSources = useCallback(async () => {
    if (!window.library) return;
    const next = await window.library.getSources();
    setSources(next);
  }, []);

  // Load sources on mount
  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  const handleAddSource = useCallback(async () => {
    if (!window.library) return;

    setError(null);
    setNotice(null);

    try {
      const dirPath = await window.library.selectDirectory();
      if (!dirPath) return;

      // Check if already added
      if (sources.some((s) => s.path === dirPath)) {
        setError('This directory is already in your library.');
        return;
      }

      setIsAdding(true);

      // Use the folder name as default, or custom name if provided
      const name = newName.trim() || dirPath.split(/[\\/]/).pop() || 'Library';

      const source: LibrarySource = { name, path: dirPath };
      await window.library.addSource(source);

      setSources((prev) => [...prev, source]);
      setNewName('');
    } catch (err) {
      setError(`Failed to add directory: ${(err as Error).message}`);
    } finally {
      setIsAdding(false);
    }
  }, [sources, newName]);

  const handleRemoveSource = useCallback(
    async (sourcePath: string) => {
      if (!window.library) return;

      try {
        await window.library.removeSource(sourcePath);
        setSources((prev) => prev.filter((s) => s.path !== sourcePath));
      } catch (err) {
        setError(`Failed to remove: ${(err as Error).message}`);
      }
    },
    []
  );

  const handleExportManifest = useCallback(async () => {
    if (!window.library) return;

    setError(null);
    setNotice(null);
    setIsSharingAction(true);

    try {
      const result = await window.library.exportManifest();
      if (result.status === 'cancelled') return;

      setNotice(
        `Manifest exported to ${result.path} (${result.sourceCount} sources, ${result.entryCount} entries).`
      );
    } catch (err) {
      setError(`Failed to export manifest: ${(err as Error).message}`);
    } finally {
      setIsSharingAction(false);
    }
  }, []);

  const summarizeImportResult = (result: LibraryImportResult): string => {
    if (result.status !== 'imported') {
      return 'Import cancelled.';
    }

    const added = result.added ?? 0;
    const existing = result.existing ?? 0;
    const missing = result.missing ?? 0;
    return `Import complete: ${added} added, ${existing} already configured, ${missing} missing.`;
  };

  const handleImportManifest = useCallback(async () => {
    if (!window.library) return;

    setError(null);
    setNotice(null);
    setIsSharingAction(true);

    try {
      const result = await window.library.importManifest();
      if (result.status === 'cancelled') return;

      await refreshSources();
      setNotice(summarizeImportResult(result));
    } catch (err) {
      setError(`Failed to import manifest: ${(err as Error).message}`);
    } finally {
      setIsSharingAction(false);
    }
  }, [refreshSources]);

  if (!window.library) {
    return null;
  }

  return (
    <div className="library-settings">
      <div className="library-settings-header">
        <h2>Library Settings</h2>
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="library-settings-content">
        <p className="library-settings-description">
          Add directories containing PDF, EPUB, and TXT files to your library.
          TXT files are treated as normalized text snapshots when available.
        </p>

        {error && <div className="library-settings-error">{error}</div>}
        {notice && <div className="library-settings-notice">{notice}</div>}

        <div className="library-settings-share-actions">
          <button onClick={handleExportManifest} disabled={isSharingAction || isAdding || sources.length === 0}>
            {isSharingAction ? 'Working...' : 'Export Manifest'}
          </button>
          <button onClick={handleImportManifest} disabled={isSharingAction || isAdding}>
            {isSharingAction ? 'Working...' : 'Import Manifest'}
          </button>
        </div>

        <div className="library-settings-add">
          <input
            type="text"
            placeholder="Custom name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={isAdding}
          />
          <button onClick={handleAddSource} disabled={isAdding}>
            {isAdding ? 'Adding...' : 'Add Directory'}
          </button>
        </div>

        <div className="library-settings-list">
          <h3>Current Sources</h3>
          {sources.length === 0 ? (
            <p className="library-settings-empty">No sources configured.</p>
          ) : (
            <ul>
              {sources.map((source) => (
                <li key={source.path} className="library-settings-item">
                  <div className="library-settings-item-info">
                    <span className="library-settings-item-name">{source.name}</span>
                    <span className="library-settings-item-path">{source.path}</span>
                  </div>
                  <button
                    className="library-settings-item-remove"
                    onClick={() => handleRemoveSource(source.path)}
                    title="Remove from library"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
