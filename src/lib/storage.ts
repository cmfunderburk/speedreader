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
  GenerationDifficulty,
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
  ComprehensionItemMode,
  ComprehensionScheduleMetadata,
  ComprehensionKeyPoint,
  ComprehensionKeyPointResult,
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

const CURRENT_STORAGE_SCHEMA_VERSION = 3;

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
  generationDifficulty: GenerationDifficulty;
  generationSweepReveal: boolean;
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
  generationDifficulty: 'normal',
  generationSweepReveal: true,
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

function parseGenerationDifficulty(value: unknown): GenerationDifficulty {
  return value === 'hard' ? 'hard' : 'normal';
}

function parseGenerationSweepReveal(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.generationSweepReveal;
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

function migrateComprehensionAttemptsToV3(): void {
  const raw = localStorage.getItem(STORAGE_KEYS.comprehensionAttempts);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEYS.comprehensionAttempts);
      return;
    }
    const migrated = parsed
      .map(parseComprehensionAttempt)
      .filter((attempt): attempt is ComprehensionAttempt => attempt !== null)
      .slice(0, MAX_COMPREHENSION_ATTEMPTS);
    localStorage.setItem(STORAGE_KEYS.comprehensionAttempts, JSON.stringify(migrated));
  } catch {
    localStorage.removeItem(STORAGE_KEYS.comprehensionAttempts);
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

  if (currentVersion < 3) {
    migrateComprehensionAttemptsToV3();
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
    settings.generationDifficulty = parseGenerationDifficulty(settings.generationDifficulty);
    settings.generationSweepReveal = parseGenerationSweepReveal(settings.generationSweepReveal);
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
    generationDifficulty: parseGenerationDifficulty(settings.generationDifficulty),
    generationSweepReveal: parseGenerationSweepReveal(settings.generationSweepReveal),
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
const COMPREHENSION_ITEM_MODES: Set<ComprehensionItemMode> = new Set([
  'retrieval-check',
  'elaboration',
  'self-explanation',
  'argument-map',
  'synthesis',
  'spaced-recheck',
  'interleaved-drill',
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isComprehensionEntryPoint(value: unknown): value is ComprehensionAttempt['entryPoint'] {
  return value === 'post-reading' || value === 'launcher';
}

function warnComprehensionSanitization(context: string, field: string): void {
  if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return;
  console.warn(`[storage] sanitized comprehension ${context} field "${field}"`);
}

function parseComprehensionSourceRef(value: unknown, attemptId: string): ComprehensionSourceRef | null {
  if (typeof value !== 'object' || value === null) {
    warnComprehensionSanitization(`attempt ${attemptId}`, 'sourceArticles[]');
    return null;
  }
  const ref = value as Record<string, unknown>;
  if (typeof ref.articleId !== 'string' || ref.articleId.length === 0) {
    warnComprehensionSanitization(`attempt ${attemptId}`, 'sourceArticles[].articleId');
    return null;
  }
  if (typeof ref.title !== 'string' || ref.title.length === 0) {
    warnComprehensionSanitization(`attempt ${attemptId}`, 'sourceArticles[].title');
    return null;
  }

  const parsed: ComprehensionSourceRef = {
    articleId: ref.articleId,
    title: ref.title,
  };
  if (ref.group !== undefined) {
    if (typeof ref.group === 'string') {
      parsed.group = ref.group;
    } else {
      warnComprehensionSanitization(`attempt ${attemptId}`, 'sourceArticles[].group');
    }
  }
  return parsed;
}

function parseComprehensionKeyPoint(value: unknown, questionId: string): ComprehensionKeyPoint | null {
  if (typeof value !== 'object' || value === null) {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPoints[]');
    return null;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.text !== 'string' || obj.text.length === 0) {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPoints[].text');
    return null;
  }

  const parsed: ComprehensionKeyPoint = { text: obj.text };
  if (obj.id !== undefined) {
    if (typeof obj.id === 'string') {
      parsed.id = obj.id;
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'keyPoints[].id');
    }
  }
  if (obj.weight !== undefined) {
    if (isFiniteNumber(obj.weight) && obj.weight >= 0) {
      parsed.weight = obj.weight;
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'keyPoints[].weight');
    }
  }

  return parsed;
}

function parseComprehensionKeyPointResult(
  value: unknown,
  questionId: string
): ComprehensionKeyPointResult | null {
  if (typeof value !== 'object' || value === null) {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[]');
    return null;
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj.keyPoint !== 'string' || obj.keyPoint.trim().length === 0) {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[].keyPoint');
    return null;
  }
  if (typeof obj.hit !== 'boolean') {
    warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[].hit');
    return null;
  }

  const result: ComprehensionKeyPointResult = {
    keyPoint: obj.keyPoint.trim(),
    hit: obj.hit,
  };

  if (obj.evidence !== undefined) {
    if (typeof obj.evidence === 'string' && obj.evidence.trim().length > 0) {
      result.evidence = obj.evidence.trim();
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[].evidence');
    }
  }
  if (obj.weight !== undefined) {
    if (isFiniteNumber(obj.weight) && obj.weight >= 0) {
      result.weight = obj.weight;
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'keyPointResults[].weight');
    }
  }

  return result;
}

function parseComprehensionScheduleMetadata(
  value: unknown,
  questionId: string,
): ComprehensionScheduleMetadata | null {
  if (typeof value !== 'object' || value === null) {
    warnComprehensionSanitization(`question ${questionId}`, 'schedule');
    return null;
  }
  const obj = value as Record<string, unknown>;
  const parsed: ComprehensionScheduleMetadata = {};

  if (obj.nextDueAt !== undefined) {
    if (isFiniteNumber(obj.nextDueAt)) parsed.nextDueAt = obj.nextDueAt;
    else warnComprehensionSanitization(`question ${questionId}`, 'schedule.nextDueAt');
  }
  if (obj.lastSeenAt !== undefined) {
    if (isFiniteNumber(obj.lastSeenAt)) parsed.lastSeenAt = obj.lastSeenAt;
    else warnComprehensionSanitization(`question ${questionId}`, 'schedule.lastSeenAt');
  }
  if (obj.intervalDays !== undefined) {
    if (isFiniteNumber(obj.intervalDays) && obj.intervalDays >= 0) parsed.intervalDays = obj.intervalDays;
    else warnComprehensionSanitization(`question ${questionId}`, 'schedule.intervalDays');
  }
  if (obj.stability !== undefined) {
    if (isFiniteNumber(obj.stability) && obj.stability >= 0) parsed.stability = obj.stability;
    else warnComprehensionSanitization(`question ${questionId}`, 'schedule.stability');
  }
  if (obj.lapseCount !== undefined) {
    if (isFiniteNumber(obj.lapseCount) && Number.isInteger(obj.lapseCount) && obj.lapseCount >= 0) {
      parsed.lapseCount = obj.lapseCount;
    } else {
      warnComprehensionSanitization(`question ${questionId}`, 'schedule.lapseCount');
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

function parseComprehensionQuestionResult(value: unknown): ComprehensionQuestionResult | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (!(
    typeof obj.id === 'string' &&
    typeof obj.prompt === 'string' &&
    typeof obj.userAnswer === 'string' &&
    typeof obj.modelAnswer === 'string' &&
    typeof obj.feedback === 'string' &&
    typeof obj.dimension === 'string' &&
    COMPREHENSION_DIMENSIONS.has(obj.dimension) &&
    typeof obj.format === 'string' &&
    COMPREHENSION_FORMATS.has(obj.format) &&
    isFiniteNumber(obj.score) &&
    obj.score >= 0 &&
    obj.score <= 3
  )) {
    return null;
  }

  const question: ComprehensionQuestionResult = {
    id: obj.id,
    prompt: obj.prompt,
    userAnswer: obj.userAnswer,
    modelAnswer: obj.modelAnswer,
    feedback: obj.feedback,
    dimension: obj.dimension as ComprehensionQuestionResult['dimension'],
    format: obj.format as ComprehensionQuestionResult['format'],
    score: obj.score,
  };

  if (obj.section !== undefined) {
    if (
      typeof obj.section === 'string'
      && COMPREHENSION_SECTIONS.has(obj.section as ComprehensionExamSection)
    ) {
      question.section = obj.section as ComprehensionExamSection;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'section');
    }
  }
  if (obj.sourceArticleId !== undefined) {
    if (typeof obj.sourceArticleId === 'string') {
      question.sourceArticleId = obj.sourceArticleId;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'sourceArticleId');
    }
  }
  if (obj.correct !== undefined) {
    if (typeof obj.correct === 'boolean') {
      question.correct = obj.correct;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'correct');
    }
  }
  if (obj.mode !== undefined) {
    if (
      typeof obj.mode === 'string'
      && COMPREHENSION_ITEM_MODES.has(obj.mode as ComprehensionItemMode)
    ) {
      question.mode = obj.mode as ComprehensionItemMode;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'mode');
    }
  }
  if (obj.keyPoints !== undefined) {
    if (Array.isArray(obj.keyPoints)) {
      const keyPoints = obj.keyPoints
        .map((item) => parseComprehensionKeyPoint(item, question.id))
        .filter((item): item is ComprehensionKeyPoint => item !== null);
      if (keyPoints.length > 0 || obj.keyPoints.length === 0) {
        question.keyPoints = keyPoints;
      }
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'keyPoints');
    }
  }
  if (obj.targetLatencySec !== undefined) {
    if (isFiniteNumber(obj.targetLatencySec) && obj.targetLatencySec > 0) {
      question.targetLatencySec = obj.targetLatencySec;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'targetLatencySec');
    }
  }
  if (obj.confidence !== undefined) {
    if (
      isFiniteNumber(obj.confidence)
      && Number.isInteger(obj.confidence)
      && obj.confidence >= 1
      && obj.confidence <= 5
    ) {
      question.confidence = obj.confidence as ComprehensionQuestionResult['confidence'];
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'confidence');
    }
  }
  if (obj.withheld !== undefined) {
    if (typeof obj.withheld === 'boolean') {
      question.withheld = obj.withheld;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'withheld');
    }
  }
  if (obj.hintsUsed !== undefined) {
    if (Array.isArray(obj.hintsUsed)) {
      const hints = obj.hintsUsed
        .filter((hint): hint is string => typeof hint === 'string')
        .map((hint) => hint.trim())
        .filter((hint) => hint.length > 0);
      if (hints.length > 0 || obj.hintsUsed.length === 0) {
        question.hintsUsed = hints;
      } else {
        warnComprehensionSanitization(`question ${question.id}`, 'hintsUsed');
      }
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'hintsUsed');
    }
  }
  if (obj.timeToAnswerMs !== undefined) {
    if (isFiniteNumber(obj.timeToAnswerMs) && obj.timeToAnswerMs >= 0) {
      question.timeToAnswerMs = obj.timeToAnswerMs;
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'timeToAnswerMs');
    }
  }
  if (obj.schedule !== undefined) {
    const schedule = parseComprehensionScheduleMetadata(obj.schedule, question.id);
    if (schedule) question.schedule = schedule;
  }
  if (obj.keyPointResults !== undefined) {
    if (Array.isArray(obj.keyPointResults)) {
      const keyPointResults = obj.keyPointResults
        .map((item) => parseComprehensionKeyPointResult(item, question.id))
        .filter((item): item is ComprehensionKeyPointResult => item !== null);
      if (keyPointResults.length > 0 || obj.keyPointResults.length === 0) {
        question.keyPointResults = keyPointResults;
      }
    } else {
      warnComprehensionSanitization(`question ${question.id}`, 'keyPointResults');
    }
  }

  return question;
}

function parseComprehensionAttempt(value: unknown): ComprehensionAttempt | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (
    !(
      typeof obj.id === 'string' &&
      typeof obj.articleId === 'string' &&
      typeof obj.articleTitle === 'string' &&
      isComprehensionEntryPoint(obj.entryPoint) &&
      Array.isArray(obj.questions) &&
      isFiniteNumber(obj.overallScore) &&
      obj.overallScore >= 0 &&
      obj.overallScore <= 100 &&
      isFiniteNumber(obj.createdAt) &&
      isFiniteNumber(obj.durationMs) &&
      obj.durationMs >= 0
    )
  ) {
    return null;
  }

  const questions = obj.questions
    .map(parseComprehensionQuestionResult)
    .filter((question): question is ComprehensionQuestionResult => question !== null);
  if (questions.length !== obj.questions.length) {
    return null;
  }

  const attempt: ComprehensionAttempt = {
    id: obj.id,
    articleId: obj.articleId,
    articleTitle: obj.articleTitle,
    entryPoint: obj.entryPoint,
    questions,
    overallScore: obj.overallScore,
    createdAt: obj.createdAt,
    durationMs: obj.durationMs,
  };

  if (obj.runMode !== undefined) {
    if (typeof obj.runMode === 'string' && COMPREHENSION_RUN_MODES.has(obj.runMode as ComprehensionRunMode)) {
      attempt.runMode = obj.runMode as ComprehensionRunMode;
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'runMode');
    }
  }
  if (obj.examPreset !== undefined) {
    if (
      typeof obj.examPreset === 'string'
      && COMPREHENSION_EXAM_PRESETS.has(obj.examPreset as ComprehensionExamPreset)
    ) {
      attempt.examPreset = obj.examPreset as ComprehensionExamPreset;
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'examPreset');
    }
  }
  if (obj.sourceArticles !== undefined) {
    if (Array.isArray(obj.sourceArticles)) {
      const sourceArticles = obj.sourceArticles
        .map((source) => parseComprehensionSourceRef(source, attempt.id))
        .filter((source): source is ComprehensionSourceRef => source !== null);
      if (sourceArticles.length > 0 || obj.sourceArticles.length === 0) {
        attempt.sourceArticles = sourceArticles;
      }
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'sourceArticles');
    }
  }
  if (obj.difficultyTarget !== undefined) {
    if (obj.difficultyTarget === 'standard' || obj.difficultyTarget === 'challenging') {
      attempt.difficultyTarget = obj.difficultyTarget;
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'difficultyTarget');
    }
  }
  if (obj.openBookSynthesis !== undefined) {
    if (typeof obj.openBookSynthesis === 'boolean') {
      attempt.openBookSynthesis = obj.openBookSynthesis;
    } else {
      warnComprehensionSanitization(`attempt ${attempt.id}`, 'openBookSynthesis');
    }
  }

  return attempt;
}

export function loadComprehensionAttempts(): ComprehensionAttempt[] {
  runStorageMigrations();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.comprehensionAttempts);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseComprehensionAttempt)
      .filter((attempt): attempt is ComprehensionAttempt => attempt !== null)
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
