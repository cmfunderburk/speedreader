import type { Article, Feed, TokenMode, PredictionLineWidth, RampCurve } from '../types';

const STORAGE_KEYS = {
  articles: 'speedread_articles',
  feeds: 'speedread_feeds',
  settings: 'speedread_settings',
} as const;

export interface Settings {
  defaultWpm: number;
  defaultMode: TokenMode;
  customCharWidth: number;
  rsvpFontSize: number;
  saccadeFontSize: number;
  predictionFontSize: number;
  predictionLineWidth: PredictionLineWidth;
  rampEnabled: boolean;
  rampCurve: RampCurve;
  rampStartPercent: number;
  rampRate: number;
  rampInterval: number;
  rsvpAlternateColors: boolean;
  rsvpShowORP: boolean;
  saccadeShowOVP: boolean;
  saccadeShowSweep: boolean;
  saccadeLength: number;
}

const DEFAULT_SETTINGS: Settings = {
  defaultWpm: 300,
  defaultMode: 'word',
  customCharWidth: 8,
  rsvpFontSize: 2.5,
  saccadeFontSize: 1.0,
  predictionFontSize: 1.25,
  predictionLineWidth: 'medium',
  rampEnabled: false,
  rampCurve: 'linear',
  rampStartPercent: 50,
  rampRate: 25,
  rampInterval: 30,
  rsvpAlternateColors: false,
  rsvpShowORP: true,
  saccadeShowOVP: true,
  saccadeShowSweep: true,
  saccadeLength: 10,
};

/**
 * Load articles from localStorage.
 */
export function loadArticles(): Article[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.articles);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save articles to localStorage.
 */
export function saveArticles(articles: Article[]): void {
  localStorage.setItem(STORAGE_KEYS.articles, JSON.stringify(articles));
}

/**
 * Load feeds from localStorage.
 */
export function loadFeeds(): Feed[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.feeds);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save feeds to localStorage.
 */
export function saveFeeds(feeds: Feed[]): void {
  localStorage.setItem(STORAGE_KEYS.feeds, JSON.stringify(feeds));
}

/**
 * Load settings from localStorage.
 */
export function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.settings);
    const settings = data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    // Clamp values that may have been saved under old wider ranges
    settings.customCharWidth = Math.max(5, Math.min(20, settings.customCharWidth));
    settings.saccadeLength = Math.max(7, Math.min(15, settings.saccadeLength));
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to localStorage.
 */
export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

/**
 * Update reading position for an article.
 */
export function updateArticlePosition(articleId: string, position: number): void {
  const articles = loadArticles();
  const index = articles.findIndex(a => a.id === articleId);
  if (index !== -1) {
    articles[index].readPosition = position;
    saveArticles(articles);
  }
}

/**
 * Update prediction position for an article (separate from RSVP/saccade position).
 */
export function updateArticlePredictionPosition(articleId: string, position: number): void {
  const articles = loadArticles();
  const index = articles.findIndex(a => a.id === articleId);
  if (index !== -1) {
    articles[index].predictionPosition = position;
    saveArticles(articles);
  }
}

/**
 * Mark an article as read.
 */
export function markArticleAsRead(articleId: string): void {
  const articles = loadArticles();
  const index = articles.findIndex(a => a.id === articleId);
  if (index !== -1) {
    articles[index].isRead = true;
    saveArticles(articles);
  }
}

/**
 * Per-paragraph training history, keyed by article ID.
 * Each entry stores the most recent score for a paragraph index.
 */
export interface TrainingHistoryEntry {
  score: number;    // 0-1
  wpm: number;
  timestamp: number;
}

export type TrainingHistory = Record<number, TrainingHistoryEntry>;

function trainingKey(articleId: string): string {
  return `speedread_training_${articleId}`;
}

export function loadTrainingHistory(articleId: string): TrainingHistory {
  try {
    const data = localStorage.getItem(trainingKey(articleId));
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function saveTrainingHistory(articleId: string, history: TrainingHistory): void {
  localStorage.setItem(trainingKey(articleId), JSON.stringify(history));
}

/**
 * Generate a unique ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
