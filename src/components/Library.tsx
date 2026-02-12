import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { LibrarySource, LibraryItem } from '../types/electron';
import type { Article } from '../types';
import { formatBookName } from '../lib/libraryFormatting';

interface LibraryProps {
  onAdd: (article: Omit<Article, 'id' | 'addedAt' | 'readPosition' | 'isRead'>) => void;
  onOpenSettings: () => void;
}

interface BookGroup {
  name: string;
  items: LibraryItem[];
  totalSize: number;
  frontmatterCount: number;
}

export function Library({ onAdd, onOpenSettings }: LibraryProps) {
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [selectedSource, setSelectedSource] = useState<LibrarySource | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [hideFrontmatter, setHideFrontmatter] = useState(true);
  const loadRequestRef = useRef(0);

  // Load sources on mount
  useEffect(() => {
    if (!window.library) return;

    window.library.getSources().then((sources) => {
      setSources(sources);
      setSelectedSource((prev) => prev ?? (sources[0] ?? null));
    });
  }, []);

  // Load items when source changes
  useEffect(() => {
    if (!window.library || !selectedSource) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    const requestId = ++loadRequestRef.current;

    window.library
      .listBooks(selectedSource.path)
      .then((items) => {
        if (requestId !== loadRequestRef.current) return;
        setItems(items);
      })
      .catch((err) => {
        if (requestId !== loadRequestRef.current) return;
        setError(`Failed to load: ${err.message}`);
        setItems([]);
      })
      .finally(() => {
        if (requestId !== loadRequestRef.current) return;
        setIsLoading(false);
      });
  }, [selectedSource]);

  const handleOpenBook = useCallback(
    async (item: LibraryItem) => {
      if (!window.library) return;

      setLoadingItem(item.path);
      setError(null);

      try {
        const content = await window.library.openBook(item.path);
        onAdd({
          title: content.title,
          content: content.content,
          source: 'Library',
          sourcePath: content.sourcePath,
          assetBaseUrl: content.assetBaseUrl,
          group: item.parentDir ? formatBookName(item.parentDir) : undefined,
        });
      } catch (err) {
        setError(`Failed to open: ${(err as Error).message}`);
      } finally {
        setLoadingItem(null);
      }
    },
    [onAdd]
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Group items by parent directory
  const { groupedItems, rootItems } = useMemo(() => {
    const groups = new Map<string, BookGroup>();
    const root: LibraryItem[] = [];

    for (const item of items) {
      if (item.parentDir) {
        if (!groups.has(item.parentDir)) {
          groups.set(item.parentDir, {
            name: item.parentDir,
            items: [],
            totalSize: 0,
            frontmatterCount: 0,
          });
        }
        const group = groups.get(item.parentDir)!;
        group.items.push(item);
        group.totalSize += item.size;
        if (item.isFrontmatter) {
          group.frontmatterCount++;
        }
      } else {
        root.push(item);
      }
    }

    // Sort groups by name
    const sortedGroups = Array.from(groups.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      groupedItems: sortedGroups,
      rootItems: root,
    };
  }, [items]);

  // Filter items based on frontmatter toggle
  const filterItems = useCallback(
    (itemList: LibraryItem[]): LibraryItem[] => {
      if (!hideFrontmatter) return itemList;
      return itemList.filter((item) => !item.isFrontmatter);
    },
    [hideFrontmatter]
  );

  // Toggle book expansion
  const toggleBook = useCallback((bookName: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookName)) {
        next.delete(bookName);
      } else {
        next.add(bookName);
      }
      return next;
    });
  }, []);

  if (!window.library) {
    return null;
  }

  return (
    <div className="library">
      <div className="library-header">
        <h3>Library</h3>
        <button
          className="library-settings-btn"
          onClick={onOpenSettings}
          title="Library Settings"
        >
          ⚙
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="library-empty">
          <p>No library sources configured.</p>
          <button onClick={onOpenSettings}>Add Directory</button>
        </div>
      ) : (
        <>
          <div className="library-sources">
            {sources.map((source) => (
              <button
                key={source.path}
                className={`library-source ${selectedSource?.path === source.path ? 'active' : ''}`}
                onClick={() => setSelectedSource(source)}
              >
                {source.name}
              </button>
            ))}
          </div>

          <div className="library-items">
            {isLoading && <div className="library-loading">Loading...</div>}

            {error && <div className="library-error">{error}</div>}

            {!isLoading && items.length === 0 && (
              <div className="library-empty">No PDF or EPUB files found.</div>
            )}

            {/* Frontmatter toggle - only show if there are any frontmatter files */}
            {!isLoading && items.some((item) => item.isFrontmatter) && (
              <label className="library-filter">
                <input
                  type="checkbox"
                  checked={hideFrontmatter}
                  onChange={(e) => setHideFrontmatter(e.target.checked)}
                />
                <span>Hide frontmatter</span>
              </label>
            )}

            {/* Root items (files not in subdirectories) */}
            {filterItems(rootItems).map((item) => (
              <button
                key={item.path}
                className={`library-item ${item.isFrontmatter ? 'frontmatter' : ''}`}
                onClick={() => handleOpenBook(item)}
                disabled={loadingItem === item.path}
              >
                <span className="library-item-icon">
                  {item.type === 'pdf' ? '📄' : '📚'}
                </span>
                <span className="library-item-name">{item.name}</span>
                <span className="library-item-size">{formatSize(item.size)}</span>
                {loadingItem === item.path && (
                  <span className="library-item-loading">...</span>
                )}
              </button>
            ))}

            {/* Book groups (subdirectories) */}
            {groupedItems.map((group) => {
              const filteredItems = filterItems(group.items);
              const isExpanded = expandedBooks.has(group.name);
              const visibleCount = filteredItems.length;

              // Skip groups with no visible items
              if (visibleCount === 0) return null;

              return (
                <div key={group.name} className="library-book-group">
                  <button
                    className="library-book-header"
                    onClick={() => toggleBook(group.name)}
                  >
                    <span className="library-book-expand">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <span className="library-book-name">
                      {formatBookName(group.name)}
                    </span>
                    <span className="library-book-count">
                      {visibleCount} {visibleCount === 1 ? 'file' : 'files'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="library-book-items">
                      {filteredItems.map((item) => (
                        <button
                          key={item.path}
                          className={`library-item ${item.isFrontmatter ? 'frontmatter' : ''}`}
                          onClick={() => handleOpenBook(item)}
                          disabled={loadingItem === item.path}
                        >
                          <span className="library-item-icon">
                            {item.type === 'pdf' ? '📄' : '📚'}
                          </span>
                          <span className="library-item-name">{item.name}</span>
                          <span className="library-item-size">
                            {formatSize(item.size)}
                          </span>
                          {loadingItem === item.path && (
                            <span className="library-item-loading">...</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
