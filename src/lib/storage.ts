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
  ComprehensionAttempt,
  ComprehensionQuestionResult,
  ComprehensionSourceRef,
  ComprehensionRunMode,
  ComprehensionExamPreset,
  ComprehensionExamSection,
  ComprehensionGeminiModel,
} from '../types';
import { COMPREHENSION_GEMINI_MODELS } from '../types';

const STORAGE_KEYS = {
  schemaVersion: 'speedread_schema_version',
  articles: 'speedread_articles',
  feeds: 'speedread_feeds',
  settings: 'speedread_settings',
  passages: 'speedread_passages',
  sessionSnapshot: 'speedread_session_snapshot',
  drillState: 'speedread_drill_state',
  trainingSentenceMode: 'speedread_training_sentence',
  trainingScoreDetails: 'speedread_training_score_details',
  trainingScaffold: 'speedread_training_scaffold',
  dailyDate: 'speedread_daily_date',
  dailyArticleId: 'speedread_daily_article_id',
  comprehensionAttempts: 'speedread_comprehension_attempts',
  comprehensionApiKey: 'speedread_comprehension_api_key',
} as const;

const CURRENT_STORAGE_SCHEMA_VERSION = 2;

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
  comprehensionGeminiModel: ComprehensionGeminiModel;
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
    'comprehension-check': 300,
  },
  defaultMode: 'word',
  customCharWidth: 8,
  rsvpFontSize: 2.5,
  saccadeFontSize: 1.0,
  predictionFontSize: 1.25,
  predictionLineWidth: 'medium',
  predictionPreviewMode: 'sentences',
  predictionPreviewSentenceCount: 2,
  comprehensionGeminiModel: 'gemini-3-flash-preview',
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

function parseComprehensionGeminiModel(value: unknown): ComprehensionGeminiModel {
  if (
    typeof value === 'string' &&
    COMPREHENSION_GEMINI_MODELS.includes(value as ComprehensionGeminiModel)
  ) {
    return value as ComprehensionGeminiModel;
  }
  return DEFAULT_SETTINGS.comprehensionGeminiModel;
}

function loadStorageSchemaVersion(): number {
  const raw = localStorage.getItem(STORAGE_KEYS.schemaVersion);
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function saveStorageSchemaVersion(version: number): void {
  localStorage.setItem(STORAGE_KEYS.schemaVersion, String(version));
}

function migrateSettingsToV1(): void {
  const raw = localStorage.getItem(STORAGE_KEYS.settings);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> & {
      defaultWpm?: unknown;
      wpmByActivity?: Partial<Record<Activity, unknown>>;
      lastSession?: { articleId?: string; activity?: string; displayMode?: DisplayMode };
    };

    const legacyDefaultWpm = clampWpm(parsed.defaultWpm, DEFAULT_SETTINGS.defaultWpm);
    const nextWpmByActivity = {
      'paced-reading': clampWpm(parsed.wpmByActivity?.['paced-reading'], legacyDefaultWpm),
      'active-recall': clampWpm(parsed.wpmByActivity?.['active-recall'], legacyDefaultWpm),
      training: clampWpm(parsed.wpmByActivity?.training, legacyDefaultWpm),
      'comprehension-check': clampWpm(parsed.wpmByActivity?.['comprehension-check'], legacyDefaultWpm),
    } satisfies Record<Activity, number>;

    const nextLastSession = parsed.lastSession?.activity
      ? {
          ...parsed.lastSession,
          activity:
            parsed.lastSession.activity === 'speed-reading'
              ? 'paced-reading'
              : parsed.lastSession.activity === 'comprehension'
                ? 'active-recall'
                : parsed.lastSession.activity,
        }
      : undefined;

    const migrated = {
      ...parsed,
      wpmByActivity: nextWpmByActivity,
      defaultWpm: nextWpmByActivity['paced-reading'],
      ...(nextLastSession ? { lastSession: nextLastSession } : {}),
    };

    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(migrated));
  } catch {
    // Keep existing data untouched when migration cannot parse settings.
  }
}

function normalizeDrillState(parsed: Partial<DrillState>): DrillState {
  const wpm = clampWpm(parsed.wpm, DEFAULT_SETTINGS.defaultWpm);
  const minWpmRaw = parsed.minWpm ?? Math.max(MIN_WPM, wpm - 50);
  const maxWpmRaw = parsed.maxWpm ?? Math.min(MAX_WPM, wpm + 50);
  let minWpm = clampWpm(minWpmRaw, Math.max(MIN_WPM, wpm - 50));
  let maxWpm = clampWpm(maxWpmRaw, Math.min(MAX_WPM, wpm + 50));
  if (minWpm > maxWpm) [minWpm, maxWpm] = [maxWpm, minWpm];
  const rollingScores = Array.isArray(parsed.rollingScores)
    ? parsed.rollingScores.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];

  return {
    ...parsed,
    wpm,
    minWpm,
    maxWpm,
    rollingScores,
  };
}

function migrateDrillStateToV1(): void {
  const raw = localStorage.getItem(STORAGE_KEYS.drillState);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Partial<DrillState>;
    localStorage.setItem(STORAGE_KEYS.drillState, JSON.stringify(normalizeDrillState(parsed)));
  } catch {
    // Keep existing data untouched when migration cannot parse drill state.
  }
}

function runStorageMigrations(): void {
  const currentVersion = loadStorageSchemaVersion();
  if (currentVersion >= CURRENT_STORAGE_SCHEMA_VERSION) return;

  if (currentVersion < 1) {
    migrateSettingsToV1();
    migrateDrillStateToV1();
  }

  if (currentVersion < 2) {
    // No-op: comprehension_attempts key didn't exist before V2.
    // New installs and upgrades both start with empty attempts.
  }

  saveStorageSchemaVersion(CURRENT_STORAGE_SCHEMA_VERSION);
}

/**
 * Load articles from localStorage.
 */
export function loadArticles(): Article[] {
  runStorageMigrations();
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
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.articles, JSON.stringify(articles));
}

/**
 * Load feeds from localStorage.
 */
export function loadFeeds(): Feed[] {
  runStorageMigrations();
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
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.feeds, JSON.stringify(feeds));
}

/**
 * Load saved passages from localStorage.
 */
export function loadPassages(): Passage[] {
  runStorageMigrations();
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
  runStorageMigrations();
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
  runStorageMigrations();
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
      'comprehension-check': clampWpm(parsedWpmByActivity?.['comprehension-check'], legacyDefaultWpm),
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
    settings.comprehensionGeminiModel = parseComprehensionGeminiModel(settings.comprehensionGeminiModel);
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
  runStorageMigrations();
  const normalized: Settings = {
    ...settings,
    wpmByActivity: {
      'paced-reading': clampWpm(settings.wpmByActivity?.['paced-reading'], settings.defaultWpm),
      'active-recall': clampWpm(settings.wpmByActivity?.['active-recall'], settings.defaultWpm),
      training: clampWpm(settings.wpmByActivity?.training, settings.defaultWpm),
      'comprehension-check': clampWpm(settings.wpmByActivity?.['comprehension-check'], settings.defaultWpm),
    },
    defaultWpm: clampWpm(
      settings.wpmByActivity?.['paced-reading'],
      clampWpm(settings.defaultWpm, DEFAULT_SETTINGS.defaultWpm)
    ),
    comprehensionGeminiModel: parseComprehensionGeminiModel(settings.comprehensionGeminiModel),
  };
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(normalized));
}

/**
 * Load session continuity snapshot.
 */
export function loadSessionSnapshot(): SessionSnapshot | null {
  runStorageMigrations();
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
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.sessionSnapshot, JSON.stringify(snapshot));
}

/**
 * Clear saved session continuity snapshot.
 */
export function clearSessionSnapshot(): void {
  runStorageMigrations();
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
  runStorageMigrations();
  try {
    const data = localStorage.getItem(trainingKey(articleId));
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function saveTrainingHistory(articleId: string, history: TrainingHistory): void {
  runStorageMigrations();
  localStorage.setItem(trainingKey(articleId), JSON.stringify(history));
}

function loadStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function saveStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures (private mode, quota).
  }
}

export function loadTrainingSentenceMode(): boolean {
  return loadStoredBoolean(STORAGE_KEYS.trainingSentenceMode, false);
}

export function saveTrainingSentenceMode(enabled: boolean): void {
  saveStoredBoolean(STORAGE_KEYS.trainingSentenceMode, enabled);
}

export function loadTrainingScoreDetails(): boolean {
  return loadStoredBoolean(STORAGE_KEYS.trainingScoreDetails, false);
}

export function saveTrainingScoreDetails(enabled: boolean): void {
  saveStoredBoolean(STORAGE_KEYS.trainingScoreDetails, enabled);
}

export function loadTrainingScaffold(): boolean {
  return loadStoredBoolean(STORAGE_KEYS.trainingScaffold, true);
}

export function saveTrainingScaffold(enabled: boolean): void {
  saveStoredBoolean(STORAGE_KEYS.trainingScaffold, enabled);
}

// --- Random drill persistence ---

export interface DrillState {
  wpm: number;
  rollingScores: number[];
  corpusFamily?: 'wiki' | 'prose';
  tier?: 'easy' | 'medium' | 'hard';
  minWpm?: number;
  maxWpm?: number;
  autoAdjustDifficulty?: boolean;
  // Legacy field kept for backward compatibility with old saved state.
  charLimit?: number;
}

export function loadDrillState(): DrillState | null {
  runStorageMigrations();
  try {
    const data = localStorage.getItem(STORAGE_KEYS.drillState);
    if (!data) return null;
    const parsed = JSON.parse(data) as Partial<DrillState>;
    return normalizeDrillState(parsed);
  } catch {
    return null;
  }
}

export function saveDrillState(state: DrillState): void {
  runStorageMigrations();
  localStorage.setItem(STORAGE_KEYS.drillState, JSON.stringify(state));
}

// --- Daily article persistence ---

export function loadDailyInfo(): { date: string; articleId: string } | null {
  runStorageMigrations();
  try {
    const date = localStorage.getItem(STORAGE_KEYS.dailyDate);
    const articleId = localStorage.getItem(STORAGE_KEYS.dailyArticleId);
    return date && articleId ? { date, articleId } : null;
  } catch {
    return null;
  }
}

export function saveDailyInfo(date: string, articleId: string): void {
  runStorageMigrations();
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

// --- Comprehension attempt persistence ---

const MAX_COMPREHENSION_ATTEMPTS = 200;

const COMPREHENSION_DIMENSIONS = new Set(['factual', 'inference', 'structural', 'evaluative']);
const COMPREHENSION_FORMATS = new Set(['multiple-choice', 'true-false', 'short-answer', 'essay']);
const COMPREHENSION_SECTIONS = new Set(['recall', 'interpretation', 'synthesis']);
const COMPREHENSION_EXAM_PRESETS: Set<ComprehensionExamPreset> = new Set(['quiz', 'midterm', 'final']);
const COMPREHENSION_RUN_MODES: Set<ComprehensionRunMode> = new Set(['quick-check', 'exam']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidComprehensionQuestionResult(value: unknown): value is ComprehensionQuestionResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!(
    typeof obj.id === 'string' &&
    typeof obj.prompt === 'string' &&
    typeof obj.userAnswer === 'string' &&
    typeof obj.modelAnswer === 'string' &&
    typeof obj.feedback === 'string' &&
    (
      obj.section === undefined
      || (
        typeof obj.section === 'string'
        && COMPREHENSION_SECTIONS.has(obj.section as ComprehensionExamSection)
      )
    ) &&
    (obj.sourceArticleId === undefined || typeof obj.sourceArticleId === 'string') &&
    typeof obj.dimension === 'string' &&
    COMPREHENSION_DIMENSIONS.has(obj.dimension) &&
    typeof obj.format === 'string' &&
    COMPREHENSION_FORMATS.has(obj.format) &&
    isFiniteNumber(obj.score) &&
    obj.score >= 0 &&
    obj.score <= 3
  )) {
    return false;
  }
  if (obj.correct !== undefined && typeof obj.correct !== 'boolean') {
    return false;
  }
  return true;
}

function isValidComprehensionAttempt(value: unknown): value is ComprehensionAttempt {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.articleId === 'string' &&
    typeof obj.articleTitle === 'string' &&
    (
      obj.runMode === undefined
      || (
        typeof obj.runMode === 'string'
        && COMPREHENSION_RUN_MODES.has(obj.runMode as ComprehensionRunMode)
      )
    ) &&
    (
      obj.examPreset === undefined
      || (
        typeof obj.examPreset === 'string'
        && COMPREHENSION_EXAM_PRESETS.has(obj.examPreset as ComprehensionExamPreset)
      )
    ) &&
    (obj.entryPoint === 'post-reading' || obj.entryPoint === 'launcher') &&
    (!Array.isArray(obj.sourceArticles) || obj.sourceArticles.every((source: unknown): source is ComprehensionSourceRef => {
      if (typeof source !== 'object' || source === null) return false;
      const ref = source as Record<string, unknown>;
      if (typeof ref.articleId !== 'string' || ref.articleId.length === 0) return false;
      if (typeof ref.title !== 'string' || ref.title.length === 0) return false;
      return ref.group === undefined || typeof ref.group === 'string';
    })) &&
    (obj.difficultyTarget === undefined || obj.difficultyTarget === 'standard' || obj.difficultyTarget === 'challenging') &&
    (obj.openBookSynthesis === undefined || typeof obj.openBookSynthesis === 'boolean') &&
    Array.isArray(obj.questions) &&
    obj.questions.every(isValidComprehensionQuestionResult) &&
    isFiniteNumber(obj.overallScore) &&
    obj.overallScore >= 0 &&
    obj.overallScore <= 100 &&
    isFiniteNumber(obj.createdAt) &&
    isFiniteNumber(obj.durationMs) &&
    obj.durationMs >= 0
  );
}

export function loadComprehensionAttempts(): ComprehensionAttempt[] {
  runStorageMigrations();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.comprehensionAttempts);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidComprehensionAttempt)
      .slice(0, MAX_COMPREHENSION_ATTEMPTS);
  } catch {
    return [];
  }
}

export function saveComprehensionAttempts(attempts: ComprehensionAttempt[]): void {
  runStorageMigrations();
  localStorage.setItem(
    STORAGE_KEYS.comprehensionAttempts,
    JSON.stringify(attempts.slice(0, MAX_COMPREHENSION_ATTEMPTS))
  );
}

export function appendComprehensionAttempt(attempt: ComprehensionAttempt): void {
  const existing = loadComprehensionAttempts();
  saveComprehensionAttempts([attempt, ...existing]);
}

export function loadComprehensionApiKey(): string | null {
  runStorageMigrations();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.comprehensionApiKey);
    if (!raw) return null;
    const normalized = raw.trim();
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

export function saveComprehensionApiKey(apiKey: string | null): void {
  runStorageMigrations();
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (normalized.length === 0) {
    localStorage.removeItem(STORAGE_KEYS.comprehensionApiKey);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.comprehensionApiKey, normalized);
}

const COMPREHENSION_API_KEY_ID = 'comprehension-gemini' as const;

export type ComprehensionApiKeyStorageMode = 'secure' | 'local' | 'unavailable';

function getSecureKeyBridge() {
  if (typeof window === 'undefined') return null;
  return window.secureKeys ?? null;
}

export async function getComprehensionApiKeyStorageMode(): Promise<ComprehensionApiKeyStorageMode> {
  const bridge = getSecureKeyBridge();
  if (!bridge) return 'local';

  try {
    return (await bridge.isAvailable()) ? 'secure' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function loadPreferredComprehensionApiKey(): Promise<string | null> {
  const bridge = getSecureKeyBridge();
  if (!bridge) {
    return loadComprehensionApiKey();
  }

  let available = false;
  try {
    available = await bridge.isAvailable();
  } catch {
    return loadComprehensionApiKey();
  }
  if (!available) {
    return loadComprehensionApiKey();
  }

  const secureValue = await bridge.get(COMPREHENSION_API_KEY_ID);
  if (secureValue && secureValue.trim().length > 0) {
    // Clear legacy local key when secure key is present.
    saveComprehensionApiKey(null);
    return secureValue.trim();
  }

  // One-time migration from legacy localStorage key to secure storage.
  const legacyValue = loadComprehensionApiKey();
  if (legacyValue) {
    await bridge.set(COMPREHENSION_API_KEY_ID, legacyValue);
    saveComprehensionApiKey(null);
    return legacyValue;
  }

  return null;
}

export async function savePreferredComprehensionApiKey(apiKey: string | null): Promise<void> {
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  const bridge = getSecureKeyBridge();
  if (!bridge) {
    saveComprehensionApiKey(normalized || null);
    return;
  }

  let available = false;
  try {
    available = await bridge.isAvailable();
  } catch {
    saveComprehensionApiKey(normalized || null);
    return;
  }
  if (!available) {
    // Fallback for Linux sessions where safeStorage/keyring is unavailable.
    saveComprehensionApiKey(normalized || null);
    return;
  }

  await bridge.set(COMPREHENSION_API_KEY_ID, normalized || null);
  // Ensure no stale insecure value remains.
  saveComprehensionApiKey(null);
}
