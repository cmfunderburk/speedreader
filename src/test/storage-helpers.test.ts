import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateArticlePosition,
  updateArticlePredictionPosition,
  loadPassages,
  upsertPassage,
  updatePassageReviewState,
  touchPassageReview,
  loadSessionSnapshot,
  saveSessionSnapshot,
  clearSessionSnapshot,
  loadSettings,
  saveSettings,
  loadDrillState,
  saveDrillState,
  loadTrainingSentenceMode,
  saveTrainingSentenceMode,
  loadTrainingScoreDetails,
  saveTrainingScoreDetails,
  loadTrainingScaffold,
  saveTrainingScaffold,
  loadComprehensionAttempts,
  appendComprehensionAttempt,
  saveComprehensionAttempts,
  loadComprehensionApiKey,
  saveComprehensionApiKey,
  getComprehensionApiKeyStorageMode,
  loadPreferredComprehensionApiKey,
  savePreferredComprehensionApiKey,
} from '../lib/storage';
import type { Passage, ComprehensionAttempt } from '../types';
import {
  createTestArticle,
  seedArticles,
  getStoredArticles,
  getStoredPosition,
  getStoredPredictionPosition,
  clearStorage,
  resetIdCounter,
} from './storage-helpers';

beforeEach(() => {
  clearStorage();
  resetIdCounter();
});

describe('storage-helpers', () => {
  it('createTestArticle produces unique IDs', () => {
    const a = createTestArticle();
    const b = createTestArticle();
    expect(a.id).not.toBe(b.id);
  });

  it('createTestArticle applies overrides', () => {
    const a = createTestArticle({ title: 'Custom', readPosition: 42 });
    expect(a.title).toBe('Custom');
    expect(a.readPosition).toBe(42);
  });

  it('seedArticles + getStoredArticles round-trips', () => {
    const articles = [createTestArticle(), createTestArticle()];
    seedArticles(articles);
    expect(getStoredArticles()).toEqual(articles);
  });

  it('clearStorage removes all app keys', () => {
    seedArticles([createTestArticle()]);
    clearStorage();
    expect(getStoredArticles()).toEqual([]);
  });
});

describe('storage-helpers with real storage functions', () => {
  it('updateArticlePosition is readable via getStoredPosition', () => {
    const article = createTestArticle();
    seedArticles([article]);

    updateArticlePosition(article.id, 25);

    expect(getStoredPosition(article.id)).toBe(25);
  });

  it('updateArticlePredictionPosition is readable via getStoredPredictionPosition', () => {
    const article = createTestArticle();
    seedArticles([article]);

    updateArticlePredictionPosition(article.id, 100);

    expect(getStoredPredictionPosition(article.id)).toBe(100);
  });

  it('position updates do not corrupt other articles', () => {
    const a = createTestArticle();
    const b = createTestArticle();
    seedArticles([a, b]);

    updateArticlePosition(a.id, 10);

    expect(getStoredPosition(a.id)).toBe(10);
    expect(getStoredPosition(b.id)).toBe(0); // unchanged
  });

  it('updating nonexistent article is a no-op', () => {
    const article = createTestArticle();
    seedArticles([article]);

    updateArticlePosition('nonexistent', 99);

    expect(getStoredPosition(article.id)).toBe(0); // unchanged
    expect(getStoredArticles()).toHaveLength(1);
  });

  it('upsertPassage + loadPassages round-trips with review updates', () => {
    const now = Date.now();
    const passage: Passage = {
      id: 'p1',
      articleId: 'a1',
      articleTitle: 'Article 1',
      sourceMode: 'saccade',
      captureKind: 'paragraph',
      text: 'Captured passage',
      createdAt: now,
      updatedAt: now,
      sourceChunkIndex: 12,
      sourcePageIndex: 2,
      sourceLineIndex: 4,
      reviewState: 'new',
      reviewCount: 0,
    };

    upsertPassage(passage);
    updatePassageReviewState('p1', 'hard');
    touchPassageReview('p1', 'recall');

    const loaded = loadPassages();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].reviewState).toBe('hard');
    expect(loaded[0].reviewCount).toBe(1);
    expect(loaded[0].lastReviewMode).toBe('recall');
  });

  it('session snapshot persists and clears', () => {
    saveSessionSnapshot({
      reading: { articleId: 'a1', chunkIndex: 20, displayMode: 'saccade' },
      training: { passageId: 'p1', mode: 'prediction', startedAt: Date.now() },
      lastTransition: 'read-to-prediction',
      updatedAt: Date.now(),
    });

    expect(loadSessionSnapshot()?.reading?.articleId).toBe('a1');
    clearSessionSnapshot();
    expect(loadSessionSnapshot()).toBeNull();
  });

  it('settings default and persist prediction preview/model configuration', () => {
    const defaults = loadSettings();
    expect(defaults.predictionPreviewMode).toBe('sentences');
    expect(defaults.predictionPreviewSentenceCount).toBe(2);
    expect(defaults.comprehensionGeminiModel).toBe('gemini-3-flash-preview');
    expect(defaults.themePreference).toBe('dark');
    expect(defaults.wpmByActivity['paced-reading']).toBe(defaults.defaultWpm);
    expect(defaults.wpmByActivity['active-recall']).toBe(defaults.defaultWpm);
    expect(defaults.wpmByActivity.training).toBe(defaults.defaultWpm);
    expect(defaults.wpmByActivity['comprehension-check']).toBe(defaults.defaultWpm);

    saveSettings({
      ...defaults,
      predictionPreviewMode: 'unlimited',
      predictionPreviewSentenceCount: 5,
      comprehensionGeminiModel: 'gemini-3-pro-preview',
      themePreference: 'system',
      wpmByActivity: {
        ...defaults.wpmByActivity,
        training: 460,
      },
    });

    const loaded = loadSettings();
    expect(loaded.predictionPreviewMode).toBe('unlimited');
    expect(loaded.predictionPreviewSentenceCount).toBe(5);
    expect(loaded.comprehensionGeminiModel).toBe('gemini-3-pro-preview');
    expect(loaded.themePreference).toBe('system');
    expect(loaded.wpmByActivity.training).toBe(460);
  });

  it('migrates legacy settings without per-activity WPM', () => {
    localStorage.setItem('speedread_settings', JSON.stringify({
      defaultWpm: 360,
      predictionPreviewMode: 'sentences',
    }));

    const loaded = loadSettings();
    expect(loaded.defaultWpm).toBe(360);
    expect(loaded.wpmByActivity['paced-reading']).toBe(360);
    expect(loaded.wpmByActivity['active-recall']).toBe(360);
    expect(loaded.wpmByActivity.training).toBe(360);
    expect(loaded.wpmByActivity['comprehension-check']).toBe(360);
    expect(loaded.comprehensionGeminiModel).toBe('gemini-3-flash-preview');
  });

  it('normalizes unknown comprehension model to default', () => {
    localStorage.setItem('speedread_settings', JSON.stringify({
      comprehensionGeminiModel: 'gemini-2.0-flash',
    }));

    const loaded = loadSettings();
    expect(loaded.comprehensionGeminiModel).toBe('gemini-3-flash-preview');

    saveSettings(loaded);
    const persisted = JSON.parse(localStorage.getItem('speedread_settings') || '{}');
    expect(persisted.comprehensionGeminiModel).toBe('gemini-3-flash-preview');
  });

  it('runs schema migration and persists normalized legacy settings/drill state', () => {
    localStorage.setItem('speedread_settings', JSON.stringify({
      defaultWpm: 350,
      lastSession: {
        articleId: 'a1',
        activity: 'speed-reading',
        displayMode: 'saccade',
      },
    }));
    localStorage.setItem('speedread_drill_state', JSON.stringify({
      wpm: 290,
      rollingScores: [0.7, 'bad', 0.8],
      minWpm: 420,
      maxWpm: 230,
    }));

    const settings = loadSettings();
    const drill = loadDrillState();

    expect(localStorage.getItem('speedread_schema_version')).toBe('3');
    expect(settings.wpmByActivity['paced-reading']).toBe(350);
    expect(settings.lastSession?.activity).toBe('paced-reading');
    expect(drill).toEqual({
      wpm: 290,
      rollingScores: [0.7, 0.8],
      minWpm: 230,
      maxWpm: 420,
    });

    const persistedSettings = JSON.parse(localStorage.getItem('speedread_settings') || '{}');
    expect(persistedSettings.wpmByActivity).toEqual({
      'paced-reading': 350,
      'active-recall': 350,
      training: 350,
      'comprehension-check': 350,
    });
    expect(persistedSettings.lastSession.activity).toBe('paced-reading');

    const persistedDrill = JSON.parse(localStorage.getItem('speedread_drill_state') || '{}');
    expect(persistedDrill).toEqual({
      wpm: 290,
      rollingScores: [0.7, 0.8],
      minWpm: 230,
      maxWpm: 420,
    });
  });

  it('drill state persists auto-adjust toggle', () => {
    saveDrillState({
      wpm: 300,
      rollingScores: [0.9, 0.95],
      corpusFamily: 'prose',
      tier: 'medium',
      minWpm: 240,
      maxWpm: 420,
      autoAdjustDifficulty: true,
    });

    const loaded = loadDrillState();
    expect(loaded).toEqual({
      wpm: 300,
      rollingScores: [0.9, 0.95],
      corpusFamily: 'prose',
      tier: 'medium',
      minWpm: 240,
      maxWpm: 420,
      autoAdjustDifficulty: true,
    });
  });

  it('legacy drill state without range settings backfills min/max WPM', () => {
    localStorage.setItem('speedread_drill_state', JSON.stringify({
      wpm: 280,
      charLimit: 80,
      rollingScores: [0.8],
      tier: 'hard',
    }));

    const loaded = loadDrillState();
    expect(loaded).toEqual({
      wpm: 280,
      charLimit: 80,
      rollingScores: [0.8],
      tier: 'hard',
      minWpm: 230,
      maxWpm: 330,
    });
  });

  it('normalizes drill state with reversed min/max range', () => {
    localStorage.setItem('speedread_drill_state', JSON.stringify({
      wpm: 300,
      rollingScores: [0.9],
      minWpm: 500,
      maxWpm: 250,
    }));

    const loaded = loadDrillState();
    expect(loaded).toEqual({
      wpm: 300,
      rollingScores: [0.9],
      minWpm: 250,
      maxWpm: 500,
    });
  });

  it('training preference helpers persist and load values', () => {
    expect(loadTrainingSentenceMode()).toBe(false);
    expect(loadTrainingScoreDetails()).toBe(false);
    expect(loadTrainingScaffold()).toBe(true);

    saveTrainingSentenceMode(true);
    saveTrainingScoreDetails(true);
    saveTrainingScaffold(false);

    expect(loadTrainingSentenceMode()).toBe(true);
    expect(loadTrainingScoreDetails()).toBe(true);
    expect(loadTrainingScaffold()).toBe(false);
  });

  it('comprehension api key helpers persist, trim, and clear values', () => {
    expect(loadComprehensionApiKey()).toBeNull();

    saveComprehensionApiKey('  my-key  ');
    expect(loadComprehensionApiKey()).toBe('my-key');

    saveComprehensionApiKey('');
    expect(loadComprehensionApiKey()).toBeNull();
  });

  it('preferred api key helpers use local storage when secure bridge is absent', async () => {
    expect(await getComprehensionApiKeyStorageMode()).toBe('local');

    await savePreferredComprehensionApiKey('  local-key  ');
    expect(await loadPreferredComprehensionApiKey()).toBe('local-key');

    await savePreferredComprehensionApiKey('');
    expect(await loadPreferredComprehensionApiKey()).toBeNull();
  });

  it('preferred api key helpers use secure bridge when available', async () => {
    const secureMap = new Map<string, string>();
    window.secureKeys = {
      isAvailable: async () => true,
      get: async (keyId) => secureMap.get(keyId) ?? null,
      set: async (keyId, value) => {
        if (value) secureMap.set(keyId, value);
        else secureMap.delete(keyId);
      },
    };

    localStorage.setItem('speedread_comprehension_api_key', 'legacy');

    expect(await getComprehensionApiKeyStorageMode()).toBe('secure');
    // Legacy local key should migrate into secure store on first preferred load.
    expect(await loadPreferredComprehensionApiKey()).toBe('legacy');
    expect(secureMap.get('comprehension-gemini')).toBe('legacy');
    expect(localStorage.getItem('speedread_comprehension_api_key')).toBeNull();

    await savePreferredComprehensionApiKey('secure-key');
    expect(secureMap.get('comprehension-gemini')).toBe('secure-key');
    expect(await loadPreferredComprehensionApiKey()).toBe('secure-key');

    await savePreferredComprehensionApiKey(null);
    expect(await loadPreferredComprehensionApiKey()).toBeNull();
  });

  it('preferred helpers fall back to local storage when secure bridge exists but is unavailable', async () => {
    window.secureKeys = {
      isAvailable: async () => false,
      get: async () => null,
      set: async () => {},
    };

    expect(await getComprehensionApiKeyStorageMode()).toBe('unavailable');
    await savePreferredComprehensionApiKey('abc');
    expect(await loadPreferredComprehensionApiKey()).toBe('abc');
    expect(localStorage.getItem('speedread_comprehension_api_key')).toBe('abc');
  });
});

function makeAttempt(overrides: Partial<ComprehensionAttempt> = {}): ComprehensionAttempt {
  return {
    id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    articleId: 'a1',
    articleTitle: 'Test Article',
    entryPoint: 'post-reading',
    questions: [],
    overallScore: 75,
    createdAt: Date.now(),
    durationMs: 60000,
    ...overrides,
  };
}

function makeQuestionResult() {
  return {
    id: 'q1',
    dimension: 'factual' as const,
    format: 'short-answer' as const,
    prompt: 'What is the central claim?',
    userAnswer: 'The central claim is liberty with limits.',
    modelAnswer: 'The passage argues liberty with social limits.',
    score: 2,
    feedback: 'Mostly right with minor omissions.',
  };
}

describe('comprehension attempt storage', () => {
  it('returns empty array when no key exists', () => {
    expect(loadComprehensionAttempts()).toEqual([]);
  });

  it('round-trips an attempt via append + load', () => {
    const attempt = makeAttempt({ id: 'rt-1', overallScore: 80 });
    appendComprehensionAttempt(attempt);

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('rt-1');
    expect(loaded[0].overallScore).toBe(80);
  });

  it('filters out malformed entries on load', () => {
    localStorage.setItem(
      'speedread_comprehension_attempts',
      JSON.stringify([
        makeAttempt({ id: 'good-1' }),
        { bad: 'entry' },
        null,
        42,
        makeAttempt({ id: 'good-2' }),
      ])
    );

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('good-1');
    expect(loaded[1].id).toBe('good-2');
  });

  it('filters attempts with invalid required fields', () => {
    localStorage.setItem(
      'speedread_comprehension_attempts',
      JSON.stringify([
        makeAttempt({ id: 'valid', questions: [makeQuestionResult()] }),
        { ...makeAttempt({ id: 'bad-entry-point' }), entryPoint: 'sidebar' },
        { ...makeAttempt({ id: 'bad-duration' }), durationMs: -1 },
        { ...makeAttempt({ id: 'bad-score' }), overallScore: 101 },
        { ...makeAttempt({ id: 'bad-question' }), questions: [{ ...makeQuestionResult(), score: 99 }] },
      ])
    );

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('valid');
  });

  it('accepts v3 optional question metadata fields when valid', () => {
    const attempt = makeAttempt({
      id: 'v3-valid',
      questions: [
        {
          ...makeQuestionResult(),
          mode: 'spaced-recheck',
          keyPoints: [
            { id: 'kp-1', text: 'Mentions the central claim.', weight: 0.7 },
            { text: 'Notes the tradeoff.' },
          ],
          targetLatencySec: 45,
          confidence: 4,
          withheld: false,
          hintsUsed: ['keyword-cue', 'custom-hint-v2'],
          timeToAnswerMs: 32000,
          schedule: {
            nextDueAt: 1735000000000,
            lastSeenAt: 1734913600000,
            intervalDays: 4,
            stability: 2.25,
            lapseCount: 1,
          },
        },
      ],
    });

    saveComprehensionAttempts([attempt]);

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('v3-valid');
    expect(loaded[0].questions[0].mode).toBe('spaced-recheck');
    expect(loaded[0].questions[0].confidence).toBe(4);
    expect(loaded[0].questions[0].schedule?.intervalDays).toBe(4);
  });

  it('sanitizes invalid v3 optional question metadata fields', () => {
    const badMode = {
      ...makeAttempt({ id: 'bad-mode' }),
      questions: [{ ...makeQuestionResult(), mode: 'free-form' }],
    };
    const badConfidence = {
      ...makeAttempt({ id: 'bad-confidence' }),
      questions: [{ ...makeQuestionResult(), confidence: 7 }],
    };
    const badHint = {
      ...makeAttempt({ id: 'bad-hint' }),
      questions: [{ ...makeQuestionResult(), hintsUsed: [42] }],
    };
    const badTime = {
      ...makeAttempt({ id: 'bad-time' }),
      questions: [{ ...makeQuestionResult(), timeToAnswerMs: -10 }],
    };
    const badSection = {
      ...makeAttempt({ id: 'bad-section' }),
      questions: [{ ...makeQuestionResult(), section: 'analysis' }],
    };
    const badSourceArticleId = {
      ...makeAttempt({ id: 'bad-source-article-id' }),
      questions: [{ ...makeQuestionResult(), sourceArticleId: 100 }],
    };
    const badSchedule = {
      ...makeAttempt({ id: 'bad-schedule' }),
      questions: [{ ...makeQuestionResult(), schedule: { lapseCount: -1 } }],
    };
    const goodV3 = makeAttempt({
      id: 'good-v3',
      questions: [{ ...makeQuestionResult(), confidence: 5, hintsUsed: ['keyword-cue'] }],
    });

    localStorage.setItem(
      'speedread_comprehension_attempts',
      JSON.stringify([
        badMode,
        badConfidence,
        badHint,
        badTime,
        badSection,
        badSourceArticleId,
        badSchedule,
        goodV3,
      ])
    );

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(8);
    expect(loaded.find((attempt) => attempt.id === 'bad-mode')?.questions[0].mode).toBeUndefined();
    expect(loaded.find((attempt) => attempt.id === 'bad-confidence')?.questions[0].confidence).toBeUndefined();
    expect(loaded.find((attempt) => attempt.id === 'bad-hint')?.questions[0].hintsUsed).toBeUndefined();
    expect(loaded.find((attempt) => attempt.id === 'bad-time')?.questions[0].timeToAnswerMs).toBeUndefined();
    expect(loaded.find((attempt) => attempt.id === 'bad-section')?.questions[0].section).toBeUndefined();
    expect(loaded.find((attempt) => attempt.id === 'bad-source-article-id')?.questions[0].sourceArticleId).toBeUndefined();
    expect(loaded.find((attempt) => attempt.id === 'bad-schedule')?.questions[0].schedule).toBeUndefined();
    expect(loaded.find((attempt) => attempt.id === 'good-v3')?.questions[0].confidence).toBe(5);
  });

  it('sanitizes invalid attempt-level optional metadata fields', () => {
    const mixedOptionalAttempt = {
      ...makeAttempt({
        id: 'mixed-optional',
      }),
      runMode: 'drill',
      examPreset: 'quizzz',
      difficultyTarget: 'extreme',
      openBookSynthesis: 'yes',
      sourceArticles: [
        { articleId: 'a1', title: 'Source A', group: 99 },
        { articleId: '', title: 'Broken Source' },
      ],
    };

    localStorage.setItem(
      'speedread_comprehension_attempts',
      JSON.stringify([mixedOptionalAttempt])
    );

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('mixed-optional');
    expect(loaded[0].runMode).toBeUndefined();
    expect(loaded[0].examPreset).toBeUndefined();
    expect(loaded[0].difficultyTarget).toBeUndefined();
    expect(loaded[0].openBookSynthesis).toBeUndefined();
    expect(loaded[0].sourceArticles).toEqual([{ articleId: 'a1', title: 'Source A' }]);
  });

  it('caps saved attempts at 200, preserving input order', () => {
    const attempts: ComprehensionAttempt[] = [];
    for (let i = 0; i < 210; i++) {
      attempts.push(makeAttempt({ id: `cap-${i}`, createdAt: 1000 + i }));
    }
    saveComprehensionAttempts(attempts);

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(200);
    expect(loaded[0].id).toBe('cap-0');
    expect(loaded[199].id).toBe('cap-199');
  });

  it('caps loaded attempts at 200 even when storage was oversized externally', () => {
    const attempts: ComprehensionAttempt[] = [];
    for (let i = 0; i < 210; i++) {
      attempts.push(makeAttempt({ id: `raw-${i}`, createdAt: 1000 + i }));
    }
    localStorage.setItem('speedread_comprehension_attempts', JSON.stringify(attempts));

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(200);
    expect(loaded[0].id).toBe('raw-0');
    expect(loaded[199].id).toBe('raw-199');
  });

  it('prepends new attempts (most recent first)', () => {
    appendComprehensionAttempt(makeAttempt({ id: 'first' }));
    appendComprehensionAttempt(makeAttempt({ id: 'second' }));

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('second');
    expect(loaded[1].id).toBe('first');
  });

  it('schema migration from V1 leaves comprehension attempts empty and bumps version to 3', () => {
    // Seed V1 state: schema version 1, no comprehension key
    localStorage.setItem('speedread_schema_version', '1');
    localStorage.setItem('speedread_settings', JSON.stringify({ defaultWpm: 300 }));

    const loaded = loadComprehensionAttempts();
    expect(loaded).toEqual([]);
    expect(localStorage.getItem('speedread_schema_version')).toBe('3');
  });

  it('existing V1 migrations still work after V3 bump', () => {
    // Seed pre-V1 state (no schema version)
    localStorage.setItem('speedread_settings', JSON.stringify({
      defaultWpm: 350,
      lastSession: {
        articleId: 'a1',
        activity: 'speed-reading',
        displayMode: 'saccade',
      },
    }));
    localStorage.setItem('speedread_drill_state', JSON.stringify({
      wpm: 290,
      rollingScores: [0.7, 'bad', 0.8],
      minWpm: 420,
      maxWpm: 230,
    }));

    const settings = loadSettings();
    const drill = loadDrillState();

    expect(localStorage.getItem('speedread_schema_version')).toBe('3');
    expect(settings.wpmByActivity['paced-reading']).toBe(350);
    expect(settings.lastSession?.activity).toBe('paced-reading');
    expect(drill).toEqual({
      wpm: 290,
      rollingScores: [0.7, 0.8],
      minWpm: 230,
      maxWpm: 420,
    });
  });

  it('schema migration to V3 drops malformed stored comprehension attempts', () => {
    localStorage.setItem('speedread_schema_version', '2');
    localStorage.setItem('speedread_comprehension_attempts', '{broken');

    expect(loadComprehensionAttempts()).toEqual([]);
    expect(localStorage.getItem('speedread_schema_version')).toBe('3');
    expect(localStorage.getItem('speedread_comprehension_attempts')).toBeNull();
  });

  it('schema migration to V3 sanitizes optional fields while preserving valid attempts', () => {
    const legacyAttempt = {
      ...makeAttempt({ id: 'legacy-v2' }),
      runMode: 'drill',
      questions: [
        {
          ...makeQuestionResult(),
          confidence: 10,
          hintsUsed: [123, 'ok-hint'],
        },
      ],
    };
    localStorage.setItem('speedread_schema_version', '2');
    localStorage.setItem('speedread_comprehension_attempts', JSON.stringify([legacyAttempt]));

    const loaded = loadComprehensionAttempts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('legacy-v2');
    expect(loaded[0].runMode).toBeUndefined();
    expect(loaded[0].questions[0].confidence).toBeUndefined();
    expect(loaded[0].questions[0].hintsUsed).toEqual(['ok-hint']);

    expect(localStorage.getItem('speedread_schema_version')).toBe('3');
    const persisted = JSON.parse(localStorage.getItem('speedread_comprehension_attempts') || '[]');
    expect(persisted[0].runMode).toBeUndefined();
    expect(persisted[0].questions[0].confidence).toBeUndefined();
    expect(persisted[0].questions[0].hintsUsed).toEqual(['ok-hint']);
  });

  it('returns empty array for non-array JSON', () => {
    localStorage.setItem('speedread_comprehension_attempts', '"not-an-array"');
    expect(loadComprehensionAttempts()).toEqual([]);
  });

  it('returns empty array for corrupt JSON', () => {
    localStorage.setItem('speedread_comprehension_attempts', '{broken');
    expect(loadComprehensionAttempts()).toEqual([]);
  });
});
