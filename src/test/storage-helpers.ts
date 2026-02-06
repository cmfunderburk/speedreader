import type { Article } from '../types';

const STORAGE_KEY = 'speedread_articles';

let idCounter = 0;

/**
 * Create a test article with sensible defaults. Override any field.
 */
export function createTestArticle(overrides: Partial<Article> = {}): Article {
  idCounter++;
  return {
    id: `test-${idCounter}`,
    title: `Test Article ${idCounter}`,
    content: 'The quick brown fox jumps over the lazy dog',
    source: 'test',
    addedAt: Date.now(),
    readPosition: 0,
    isRead: false,
    ...overrides,
  };
}

/**
 * Seed articles into localStorage (replaces any existing).
 */
export function seedArticles(articles: Article[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
}

/**
 * Read articles currently in localStorage.
 */
export function getStoredArticles(): Article[] {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Read a single article's readPosition from localStorage.
 * Returns undefined if article not found.
 */
export function getStoredPosition(articleId: string): number | undefined {
  return getStoredArticles().find(a => a.id === articleId)?.readPosition;
}

/**
 * Read a single article's predictionPosition from localStorage.
 * Returns undefined if article not found or field not set.
 */
export function getStoredPredictionPosition(articleId: string): number | undefined {
  return getStoredArticles().find(a => a.id === articleId)?.predictionPosition;
}

/**
 * Clear all app storage keys. Call in beforeEach for isolation.
 */
export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('speedread_feeds');
  localStorage.removeItem('speedread_settings');
}

/**
 * Reset the ID counter. Call in beforeEach for deterministic IDs.
 */
export function resetIdCounter(): void {
  idCounter = 0;
}
