import type {
  Article,
  Feed,
  TokenMode,
  PredictionLineWidth,
  PredictionPreviewMode,
  ThemePreference,
  RampCurve,
  Activity,
  DisplayMode,
  SaccadePacerStyle,
  SaccadeFocusTarget,
  Passage,
  PassageReviewMode,
  PassageReviewState,
  SessionSnapshot,
} from '../types';

const STORAGE_KEYS = {
  articles: 'speedread_articles',
  feeds: 'speedread_feeds',
  settings: 'speedread_settings',
  passages: 'speedread_passages',
  sessionSnapshot: 'speedread_session_snapshot',
  dailyDate: 'speedread_daily_date',
  dailyArticleId: 'speedread_daily_article_id',
} as const;

export interface Settings {
  defaultWpm: number;
  wpmByActivity: Record<Activity, number>;
  defaultMode: TokenMode;
  customCharWidth: number;
  rsvpFontSize: number;
  saccadeFontSize: number;
  predictionFontSize: number;
  predictionLineWidth: PredictionLineWidth;
  predictionPreviewMode: PredictionPreviewMode;
  predictionPreviewSentenceCount: number;
  themePreference: ThemePreference;
  rampEnabled: boolean;
  rampCurve: RampCurve;
  rampStartPercent: number;
  rampRate: number;
  rampInterval: number;
  rsvpAlternateColors: boolean;
  rsvpShowORP: boolean;
  saccadeShowOVP: boolean;
  saccadeShowSweep: boolean;
  saccadePacerStyle: SaccadePacerStyle;
  saccadeFocusTarget: SaccadeFocusTarget;
  saccadeMergeShortFunctionWords: boolean;
  saccadeLength: number;
  lastSession?: { articleId: string; activity: Activity; displayMode: DisplayMode };
}

const DEFAULT_SETTINGS: Settings = {
  defaultWpm: 300,
  wpmByActivity: {
    'paced-reading': 300,
    'active-recall': 300,
    training: 300,
  },
  defaultMode: 'word',
  customCharWidth: 8,
  rsvpFontSize: 2.5,
  saccadeFontSize: 1.0,
  predictionFontSize: 1.25,
  predictionLineWidth: 'medium',
  predictionPreviewMode: 'sentences',
  predictionPreviewSentenceCount: 2,
  themePreference: 'dark',
  rampEnabled: false,
  rampCurve: 'linear',
  rampStartPercent: 50,
  rampRate: 25,
  rampInterval: 30,
  rsvpAlternateColors: false,
  rsvpShowORP: true,
  saccadeShowOVP: true,
  saccadeShowSweep: true,
  saccadePacerStyle: 'sweep',
  saccadeFocusTarget: 'fixation',
  saccadeMergeShortFunctionWords: false,
  saccadeLength: 10,
};

const MIN_WPM = 100;
const MAX_WPM = 800;

function clampWpm(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(n)));
}

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
 * Load saved passages from localStorage.
 */
export function loadPassages(): Passage[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.passages);
    const parsed = data ? JSON.parse(data) as Passage[] : [];
    return parsed
      .map((passage) => ({
        ...passage,
        reviewState: normalizePassageReviewState(passage.reviewState),
        reviewCount: Math.max(0, passage.reviewCount ?? 0),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Save passages to localStorage.
 */
export function savePassages(passages: Passage[]): void {
  localStorage.setItem(STORAGE_KEYS.passages, JSON.stringify(passages));
}

/**
 * Insert or update a single passage.
 */
export function upsertPassage(passage: Passage): void {
  const existing = loadPassages();
  const idx = existing.findIndex((p) => p.id === passage.id);
  if (idx === -1) {
    existing.unshift(passage);
  } else {
    existing[idx] = passage;
  }
  savePassages(existing);
}

/**
 * Update a passage review state.
 */
export function updatePassageReviewState(passageId: string, reviewState: PassageReviewState): void {
  const passages = loadPassages();
  const idx = passages.findIndex((p) => p.id === passageId);
  if (idx === -1) return;
  passages[idx] = {
    ...passages[idx],
    reviewState: normalizePassageReviewState(reviewState),
    updatedAt: Date.now(),
  };
  savePassages(passages);
}

/**
 * Mark a passage review attempt for queue prioritization/analytics.
 */
export function touchPassageReview(passageId: string, mode: PassageReviewMode): void {
  const passages = loadPassages();
  const idx = passages.findIndex((p) => p.id === passageId);
  if (idx === -1) return;
  passages[idx] = {
    ...passages[idx],
    reviewCount: passages[idx].reviewCount + 1,
    lastReviewedAt: Date.now(),
    lastReviewMode: mode,
    updatedAt: Date.now(),
  };
  savePassages(passages);
}

/**
 * Load settings from localStorage.
 */
export function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.settings);
    const parsed = data ? JSON.parse(data) : null;
    const settings = parsed ? { ...DEFAULT_SETTINGS, ...parsed } : { ...DEFAULT_SETTINGS };
    const legacyDefaultWpm = clampWpm(settings.defaultWpm, DEFAULT_SETTINGS.defaultWpm);
    const parsedWpmByActivity = parsed?.wpmByActivity as Partial<Record<Activity, number>> | undefined;
    settings.wpmByActivity = {
      'paced-reading': clampWpm(parsedWpmByActivity?.['paced-reading'], legacyDefaultWpm),
      'active-recall': clampWpm(parsedWpmByActivity?.['active-recall'], legacyDefaultWpm),
      training: clampWpm(parsedWpmByActivity?.training, legacyDefaultWpm),
    };
    // Keep legacy field aligned with paced reading for older code paths/migrations.
    settings.defaultWpm = settings.wpmByActivity['paced-reading'];
    // Backfill pacer style from legacy sweep toggle.
    if (!parsed || !('saccadePacerStyle' in parsed)) {
      settings.saccadePacerStyle = settings.saccadeShowSweep === false ? 'focus' : 'sweep';
    }
    // Clamp values that may have been saved under old wider ranges
    settings.customCharWidth = Math.max(5, Math.min(20, settings.customCharWidth));
    settings.saccadeLength = Math.max(7, Math.min(15, settings.saccadeLength));
    settings.predictionPreviewMode = settings.predictionPreviewMode === 'unlimited' ? 'unlimited' : 'sentences';
    settings.predictionPreviewSentenceCount = Math.max(
      1,
      Math.min(10, Math.round(settings.predictionPreviewSentenceCount || 2))
    );
    settings.themePreference = settings.themePreference === 'light' || settings.themePreference === 'system'
      ? settings.themePreference
      : 'dark';
    // Migrate renamed activity types
    if (settings.lastSession) {
      const act = settings.lastSession.activity as string;
      if (act === 'speed-reading') settings.lastSession.activity = 'paced-reading';
      if (act === 'comprehension') settings.lastSession.activity = 'active-recall';
    }
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to localStorage.
 */
export function saveSettings(settings: Settings): void {
  const normalized: Settings = {
    ...settings,
    wpmByActivity: {
      'paced-reading': clampWpm(settings.wpmByActivity?.['paced-reading'], settings.defaultWpm),
      'active-recall': clampWpm(settings.wpmByActivity?.['active-recall'], settings.defaultWpm),
      training: clampWpm(settings.wpmByActivity?.training, settings.defaultWpm),
    },
    defaultWpm: clampWpm(
      settings.wpmByActivity?.['paced-reading'],
      clampWpm(settings.defaultWpm, DEFAULT_SETTINGS.defaultWpm)
    ),
  };
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalized));
}

/**
 * Load session continuity snapshot.
 */
export function loadSessionSnapshot(): SessionSnapshot | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.sessionSnapshot);
    return data ? JSON.parse(data) as SessionSnapshot : null;
  } catch {
    return null;
  }
}

/**
 * Save session continuity snapshot.
 */
export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  localStorage.setItem(STORAGE_KEYS.sessionSnapshot, JSON.stringify(snapshot));
}

/**
 * Clear saved session continuity snapshot.
 */
export function clearSessionSnapshot(): void {
  localStorage.removeItem(STORAGE_KEYS.sessionSnapshot);
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

// --- Random drill persistence ---

export interface DrillState {
  wpm: number;
  charLimit: number;
  rollingScores: number[];
  corpusFamily?: 'wiki' | 'prose';
  tier?: 'easy' | 'medium' | 'hard';
  autoAdjustDifficulty?: boolean;
}

const DRILL_STATE_KEY = 'speedread_drill_state';

export function loadDrillState(): DrillState | null {
  try {
    const data = localStorage.getItem(DRILL_STATE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveDrillState(state: DrillState): void {
  localStorage.setItem(DRILL_STATE_KEY, JSON.stringify(state));
}

// --- Daily article persistence ---

export function loadDailyInfo(): { date: string; articleId: string } | null {
  try {
    const date = localStorage.getItem(STORAGE_KEYS.dailyDate);
    const articleId = localStorage.getItem(STORAGE_KEYS.dailyArticleId);
    return date && articleId ? { date, articleId } : null;
  } catch {
    return null;
  }
}

export function saveDailyInfo(date: string, articleId: string): void {
  localStorage.setItem(STORAGE_KEYS.dailyDate, date);
  localStorage.setItem(STORAGE_KEYS.dailyArticleId, articleId);
}

/**
 * Generate a unique ID.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function normalizePassageReviewState(state: PassageReviewState | string | undefined): PassageReviewState {
  switch (state) {
    case 'hard':
    case 'easy':
    case 'done':
      return state;
    default:
      return 'new';
  }
}
