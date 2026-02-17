import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendComprehensionAttempt, generateId } from '../lib/storage';
import { type ActiveComprehensionContext } from '../lib/appViewState';
import type { ComprehensionAdapter } from '../lib/comprehensionAdapter';
import type {
  Article,
  ComprehensionAttempt,
  ComprehensionQuestionResult,
  ComprehensionSourceRef,
  GeneratedComprehensionQuestion,
} from '../types';

interface ComprehensionCheckProps {
  article: Article;
  entryPoint: 'post-reading' | 'launcher';
  adapter: ComprehensionAdapter;
  onClose: () => void;
  onOpenSettings?: () => void;
  onAttemptSaved?: (attempt: ComprehensionAttempt) => void;
  questionCount?: number;
  sourceArticles: Article[];
  comprehension: ActiveComprehensionContext;
}

interface CheckResults {
  questions: ComprehensionQuestionResult[];
  overallScore: number;
}

type ReviewDepth = 'quick' | 'standard' | 'deep';
type ResultFilter = 'all' | 'needs-review';
type ExamSectionStats = { total: number; scoreTotal: number };
const FREE_RESPONSE_SCORE_CONCURRENCY = 2;
const EXAM_SECTION_ORDER = ['recall', 'interpretation', 'synthesis'] as const;

const MISSING_API_KEY_ERROR = 'Comprehension check requires an API key';
const MISSING_API_KEY_HELP_TEXT = 'Comprehension Check requires an API key. Add your key in Settings and retry.';
const EXAM_GENERATION_ERROR_HELP_TEXT = 'Could not generate a valid exam this time. The model output did not match the expected exam format. Please retry.';

function parseTrueFalseSelection(response: string): boolean | null {
  if (response === 'true') return true;
  if (response === 'false') return false;
  return null;
}

function countSentences(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  const matches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!matches) return 0;
  return matches
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .length;
}

function formatTrueFalseUserAnswer(response: string, explanation: string): string {
  const selection = parseTrueFalseSelection(response);
  const trimmedExplanation = explanation.trim();
  const answerText = selection === null ? '' : selection ? 'True' : 'False';

  if (!answerText && !trimmedExplanation) return '';
  if (!answerText) return trimmedExplanation;
  if (!trimmedExplanation) return answerText;
  return `${answerText}. ${trimmedExplanation}`;
}

function normalizeComparisonText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function feedbackMatchesModelAnswer(question: ComprehensionQuestionResult): boolean {
  return normalizeComparisonText(question.feedback) === normalizeComparisonText(question.modelAnswer);
}

function isQuestionNeedsReview(question: ComprehensionQuestionResult): boolean {
  if (question.correct !== undefined) {
    return !question.correct;
  }
  return question.score < 3;
}

function getQuestionStatus(question: ComprehensionQuestionResult): {
  label: string;
  tone: 'correct' | 'partial' | 'incorrect';
} {
  if (question.correct !== undefined) {
    return question.correct
      ? { label: 'Correct', tone: 'correct' }
      : { label: 'Incorrect', tone: 'incorrect' };
  }
  if (question.score >= 3) return { label: 'Strong', tone: 'correct' };
  if (question.score >= 2) return { label: 'Partial', tone: 'partial' };
  return { label: 'Needs review', tone: 'incorrect' };
}

function formatUserAnswer(question: GeneratedComprehensionQuestion, response: string): string {
  if (question.format === 'multiple-choice') {
    const selectedIndex = Number(response);
    if (!Number.isInteger(selectedIndex) || !question.options || selectedIndex < 0 || selectedIndex >= question.options.length) {
      return '';
    }
    return question.options[selectedIndex];
  }
  return response.trim();
}

function scoreAutoQuestion(
  question: GeneratedComprehensionQuestion,
  response: string
): { score: number; correct: boolean } | null {
  if (question.format === 'multiple-choice') {
    const selectedIndex = Number(response);
    const correct = Number.isInteger(selectedIndex) && selectedIndex === question.correctOptionIndex;
    return { score: correct ? 3 : 0, correct };
  }
  return null;
}

function isValidSection(value: string | undefined): value is 'recall' | 'interpretation' | 'synthesis' {
  return value === 'recall' || value === 'interpretation' || value === 'synthesis';
}

function buildAttemptSourceRefs(articles: Article[]): ComprehensionSourceRef[] {
  return articles.map((article) => ({
    articleId: article.id,
    title: article.title,
    ...(article.group ? { group: article.group } : {}),
  }));
}

function buildAttemptTitle(articles: Article[]): string {
  const first = articles[0];
  if (!first) return '';
  if (articles.length === 1) return first.title;
  const extras = articles.length - 1;
  return `${first.title}, +${extras} more`;
}

function isLikelyExamFormatError(message: string): boolean {
  return (
    message.includes('Exam item') ||
    message.includes('Exam section') ||
    message.includes('Generated exam JSON') ||
    message.includes('LLM response') ||
    message.includes('Failed to generate a valid exam')
  );
}

export function ComprehensionCheck({
  article,
  entryPoint,
  adapter,
  onClose,
  onOpenSettings,
  onAttemptSaved,
  questionCount = 8,
  sourceArticles,
  comprehension,
}: ComprehensionCheckProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'submitting' | 'complete'>('loading');
  const [loadingMessage, setLoadingMessage] = useState('Generating questions...');
  const [loadingElapsedSeconds, setLoadingElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [isMissingApiKeyError, setIsMissingApiKeyError] = useState(false);
  const [reviewDepth, setReviewDepth] = useState<ReviewDepth>('quick');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [questions, setQuestions] = useState<GeneratedComprehensionQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [trueFalseExplanations, setTrueFalseExplanations] = useState<Record<string, string>>({});
  const [results, setResults] = useState<CheckResults | null>(null);
  const startTimeRef = useRef(Date.now());
  const sourceArticlesRef = useRef(sourceArticles);
  const loadRequestIdRef = useRef(0);
  const submitRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    sourceArticlesRef.current = sourceArticles;
  }, [sourceArticles]);

  const sourceArticleRefs = useMemo(
    () => buildAttemptSourceRefs(sourceArticles),
    [sourceArticles]
  );

  const sourceArticleMap = useMemo(() => {
    const map = new Map(sourceArticles.map((article) => [article.id, article]));
    return map;
  }, [sourceArticles]);

  const questionSourceRefs = useMemo(() => {
    const map = new Map(sourceArticleRefs.map((articleRef) => [articleRef.articleId, articleRef]));
    return map;
  }, [sourceArticleRefs]);

  const sourceArticleIdsKey = useMemo(
    () => sourceArticles.map((sourceArticle) => sourceArticle.id).join('|'),
    [sourceArticles]
  );

  const isExamMode = comprehension.runMode === 'exam';
  const synthesisOpenBookEnabled = comprehension.openBookSynthesis ?? true;
  const orderedQuestions = useMemo(() => {
    const hasSectionInfo = questions.every((question) => isValidSection(question.section));
    if (!isExamMode || !hasSectionInfo) {
      const factual = questions.filter((question) => question.dimension === 'factual');
      const nonFactual = questions.filter((question) => question.dimension !== 'factual');
      return [...factual, ...nonFactual];
    }

    const sectionRank = new Map(EXAM_SECTION_ORDER.map((section, index) => [section, index]));
    return [...questions]
      .map((question, index) => ({ question, index }))
      .sort((first, second) => {
        const firstSection = first.question.section ?? 'recall';
        const secondSection = second.question.section ?? 'recall';
        const sectionDiff = (sectionRank.get(firstSection) ?? 0) - (sectionRank.get(secondSection) ?? 0);
        if (sectionDiff !== 0) return sectionDiff;

        const sourceFirst = first.question.sourceArticleId ?? '';
        const sourceSecond = second.question.sourceArticleId ?? '';
        if (sourceFirst !== sourceSecond) return sourceFirst.localeCompare(sourceSecond);
        return first.index - second.index;
      })
      .map((item) => item.question);
  }, [isExamMode, questions]);

  const closedBookCount = useMemo(() => (
    isExamMode
      ? orderedQuestions.filter((question) => question.section === 'recall').length
      : orderedQuestions.filter((question) => question.dimension === 'factual').length
  ), [isExamMode, orderedQuestions]);

  const isOpenBookPhase = useMemo(() => {
    const currentQuestion = orderedQuestions[currentIndex];
    if (!currentQuestion) return false;
    if (isExamMode) {
      if (currentQuestion.section === 'recall') return false;
      if (currentQuestion.section === 'synthesis') return synthesisOpenBookEnabled;
      return true;
    }
    return currentQuestion.dimension !== 'factual' || closedBookCount === 0 || currentIndex >= closedBookCount;
  }, [closedBookCount, currentIndex, isExamMode, orderedQuestions, synthesisOpenBookEnabled]);

  const currentQuestion = orderedQuestions[currentIndex] ?? null;

  const loadQuestions = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const isStaleRequest = () => !isMountedRef.current || loadRequestIdRef.current !== requestId;

    setStatus('loading');
    setLoadingMessage(isExamMode ? 'Preparing exam context...' : 'Generating questions...');
    setLoadingElapsedSeconds(0);
    setErrorMessage(null);
    setErrorDetails(null);
    setIsMissingApiKeyError(false);
    setReviewDepth('quick');
    setResultFilter('all');
    setResults(null);
    setResponses({});
    setTrueFalseExplanations({});
    setCurrentIndex(0);
    startTimeRef.current = Date.now();

    try {
      if (isExamMode && sourceArticleIdsKey.length === 0) {
        throw new Error('No exam sources were selected.');
      }
      if (isExamMode) {
        const generated = await adapter.generateExam({
          selectedArticles: sourceArticlesRef.current,
          preset: comprehension.examPreset ?? 'quiz',
          difficultyTarget: comprehension.difficultyTarget ?? 'standard',
          openBookSynthesis: comprehension.openBookSynthesis ?? true,
          onProgress: (message) => {
            if (isStaleRequest()) return;
            setLoadingMessage(message);
          },
        });
        if (isStaleRequest()) return;
        setQuestions(generated.questions);
      } else {
        const generated = await adapter.generateCheck(article.content, questionCount);
        if (isStaleRequest()) return;
        setQuestions(generated.questions);
      }
      if (isStaleRequest()) return;
      setStatus('ready');
    } catch (error) {
      if (isStaleRequest()) return;
      const rawMessage = error instanceof Error ? error.message : 'Failed to generate comprehension check';
      const missingApiKey = rawMessage.trim() === MISSING_API_KEY_ERROR;
      const friendlyExamError = isExamMode && isLikelyExamFormatError(rawMessage);
      const message = missingApiKey
        ? MISSING_API_KEY_HELP_TEXT
        : friendlyExamError
          ? EXAM_GENERATION_ERROR_HELP_TEXT
          : rawMessage;
      setErrorMessage(message);
      setErrorDetails(friendlyExamError ? rawMessage : null);
      setIsMissingApiKeyError(missingApiKey);
      setStatus('error');
    }
  }, [adapter, comprehension.difficultyTarget, comprehension.examPreset, comprehension.openBookSynthesis, isExamMode, questionCount, sourceArticleIdsKey, article.content]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    if (status !== 'loading') {
      setLoadingElapsedSeconds(0);
      return;
    }
    const intervalId = window.setInterval(() => {
      setLoadingElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [status]);

  const handleResponseChange = useCallback((questionId: string, value: string) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleTrueFalseExplanationChange = useCallback((questionId: string, value: string) => {
    setTrueFalseExplanations((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (orderedQuestions.length === 0) return;

    const requestId = submitRequestIdRef.current + 1;
    submitRequestIdRef.current = requestId;
    const isStaleRequest = () => !isMountedRef.current || submitRequestIdRef.current !== requestId;

    setStatus('submitting');

    const scoreTrueFalseQuestion = async (question: GeneratedComprehensionQuestion): Promise<ComprehensionQuestionResult> => {
      const response = responses[question.id] ?? '';
      const explanation = (trueFalseExplanations[question.id] ?? '').trim();
      const selected = parseTrueFalseSelection(response);
      const choiceLabel = selected === null ? '' : selected ? 'True' : 'False';
      const userAnswer = formatTrueFalseUserAnswer(response, explanation);

      if (selected === null && explanation.length === 0) {
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer: '',
          modelAnswer: question.modelAnswer,
          score: 0,
          feedback: 'No answer submitted. Select True or False and add a brief explanation.',
        };
      }

      if (selected === null) {
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer,
          modelAnswer: question.modelAnswer,
          score: 0,
          feedback: 'Select True or False, then explain your reasoning in no more than 2 sentences.',
        };
      }

      if (selected !== question.correctAnswer) {
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer,
          modelAnswer: question.modelAnswer,
          score: 0,
          feedback: `Incorrect true/false choice (${choiceLabel}). ${question.modelAnswer}`,
        };
      }

      if (!explanation) {
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer,
          modelAnswer: question.modelAnswer,
          score: 1,
          feedback: 'True/False choice is correct, but add a brief explanation (<= 2 sentences) to earn full credit.',
        };
      }

      const sentenceCount = countSentences(explanation);
      const exceedsSentenceLimit = sentenceCount > 2;
      const scorePromptAnswer = [
        `True/False selection: ${choiceLabel}`,
        `Explanation (<= 2 sentences): ${explanation}`,
      ].join('\n');

      try {
        const scoringArticle = question.sourceArticleId
          ? sourceArticleMap.get(question.sourceArticleId)
          : null;
        const passageForScoring = scoringArticle?.content ?? article.content;
        const scored = await adapter.scoreAnswer(passageForScoring, question, scorePromptAnswer);
        const score = exceedsSentenceLimit
          ? Math.min(Math.max(0, Math.min(3, scored.score)), 2)
          : Math.max(0, Math.min(3, scored.score));
        const sentenceLimitFeedback = exceedsSentenceLimit
          ? ` Keep explanations to 2 sentences or fewer (received ${sentenceCount}).`
          : '';

        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer,
          modelAnswer: question.modelAnswer,
          score,
          feedback: `${scored.feedback}${sentenceLimitFeedback}`,
        };
      } catch {
        const sentenceLimitFeedback = exceedsSentenceLimit
          ? ` Explanation exceeded 2 sentences (${sentenceCount}).`
          : '';
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer,
          modelAnswer: question.modelAnswer,
          score: 1,
          feedback: `True/False choice is correct, but explanation could not be fully scored automatically.${sentenceLimitFeedback} Review the model answer below.`,
        };
      }
    };

    const scoreQuestion = async (question: GeneratedComprehensionQuestion): Promise<ComprehensionQuestionResult> => {
      if (question.format === 'true-false') {
        return scoreTrueFalseQuestion(question);
      }

      const response = responses[question.id] ?? '';
      const userAnswer = formatUserAnswer(question, response);
      const autoScore = scoreAutoQuestion(question, response);

      if (autoScore) {
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer,
          modelAnswer: question.modelAnswer,
          score: autoScore.score,
          feedback: question.modelAnswer,
          correct: autoScore.correct,
        };
      }

      if (!userAnswer) {
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer: '',
          modelAnswer: question.modelAnswer,
          score: 0,
          feedback: 'No answer submitted. Review the model answer below.',
        };
      }

      try {
        const scoringArticle = question.sourceArticleId
          ? sourceArticleMap.get(question.sourceArticleId)
          : null;
        const passageForScoring = scoringArticle?.content ?? article.content;
        const scored = await adapter.scoreAnswer(passageForScoring, question, userAnswer);
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer,
          modelAnswer: question.modelAnswer,
          score: scored.score,
          feedback: scored.feedback,
        };
      } catch {
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
          section: question.section,
          sourceArticleId: question.sourceArticleId,
          prompt: question.prompt,
          userAnswer,
          modelAnswer: question.modelAnswer,
          score: 0,
          feedback: 'Unable to score this answer automatically. Review the model answer below.',
        };
      }
    };

    const scoredQuestions = new Array<ComprehensionQuestionResult>(orderedQuestions.length);
    let cursor = 0;
    const workerCount = Math.min(FREE_RESPONSE_SCORE_CONCURRENCY, orderedQuestions.length);
    const runWorker = async () => {
      while (cursor < orderedQuestions.length) {
        const index = cursor;
        cursor += 1;
        scoredQuestions[index] = await scoreQuestion(orderedQuestions[index]);
      }
    };
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    if (isStaleRequest()) return;

    const totalScore = scoredQuestions.reduce((sum, question) => sum + question.score, 0);
    const maxScore = scoredQuestions.length * 3;
    const overallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const attempt: ComprehensionAttempt = {
      id: generateId(),
      articleId: article.id,
      articleTitle: isExamMode ? buildAttemptTitle(sourceArticles) : article.title,
      entryPoint,
      runMode: comprehension.runMode,
      examPreset: comprehension.examPreset,
      sourceArticles: isExamMode ? sourceArticleRefs : undefined,
      difficultyTarget: comprehension.difficultyTarget,
      openBookSynthesis: comprehension.openBookSynthesis,
      questions: scoredQuestions,
      overallScore,
      createdAt: Date.now(),
      durationMs: Math.max(0, Date.now() - startTimeRef.current),
    };

    if (isStaleRequest()) return;
    appendComprehensionAttempt(attempt);
    onAttemptSaved?.(attempt);

    if (isStaleRequest()) return;
    setResults({ questions: scoredQuestions, overallScore });
    setStatus('complete');
  }, [
    article.id,
    article.title,
    article.content,
    adapter,
    isExamMode,
    sourceArticles,
    entryPoint,
    onAttemptSaved,
    orderedQuestions,
    responses,
    sourceArticleMap,
    sourceArticleRefs,
    trueFalseExplanations,
    comprehension,
  ]);

  if (status === 'loading') {
    return (
      <div className="comprehension-check">
        <h2>Comprehension Check</h2>
        <p>{loadingMessage}</p>
        <p className="comprehension-meta">
          {loadingElapsedSeconds < 8
            ? 'This may take up to 30 seconds.'
            : `Still working... ${loadingElapsedSeconds}s elapsed.`}
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="comprehension-check">
        <h2>Comprehension Check</h2>
        <p>{errorMessage ?? 'Unable to generate comprehension check.'}</p>
        {errorDetails && (
          <details>
            <summary>Technical details</summary>
            <pre>{errorDetails}</pre>
          </details>
        )}
        <div className="comprehension-actions">
          {isMissingApiKeyError && onOpenSettings && (
            <button className="control-btn" onClick={onOpenSettings}>Open Settings</button>
          )}
          <button className="control-btn" onClick={() => void loadQuestions()}>Retry</button>
          <button className="control-btn" onClick={onClose}>Dismiss</button>
        </div>
      </div>
    );
  }

  if (status === 'complete' && results) {
    const sectionStats = results.questions.reduce<Record<string, ExamSectionStats>>((acc, question) => {
      const sectionKey = question.section ?? 'recall';
      const existing = acc[sectionKey] ?? { total: 0, scoreTotal: 0 };
      acc[sectionKey] = {
        total: existing.total + 1,
        scoreTotal: existing.scoreTotal + Math.max(0, Math.min(3, question.score)),
      };
      return acc;
    }, {});

    const sourceCoverage = results.questions.reduce<Map<string, number>>((acc, question) => {
      const key = question.sourceArticleId ?? article.id;
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
    const sourceCoverageNames = Array.from(sourceCoverage.keys()).map((sourceId) => questionSourceRefs.get(sourceId)?.title ?? sourceId);
    const questionEntries = results.questions.map((question, index) => {
      const statusInfo = getQuestionStatus(question);
      const sourceLabel = question.sourceArticleId ? questionSourceRefs.get(question.sourceArticleId)?.title : undefined;
      return {
        question,
        index,
        statusInfo,
        sourceLabel,
        needsReview: isQuestionNeedsReview(question),
        feedbackDuplicate: feedbackMatchesModelAnswer(question),
      };
    });

    const visibleEntries = questionEntries.filter((entry) => {
      if (resultFilter === 'all') return true;
      return entry.needsReview;
    });
    const needsReviewCount = questionEntries.filter((entry) => entry.needsReview).length;
    const correctCount = questionEntries.length - needsReviewCount;
    const dimensionStats = questionEntries.reduce((acc, entry) => {
      const key = entry.question.dimension;
      const existing = acc.get(key) ?? { total: 0, scoreTotal: 0 };
      existing.total += 1;
      existing.scoreTotal += Math.max(0, Math.min(3, entry.question.score));
      acc.set(key, existing);
      return acc;
    }, new Map<string, { total: number; scoreTotal: number }>());
    const focusDimensions = Array.from(dimensionStats.entries())
      .map(([dimension, stat]) => ({ dimension, average: stat.scoreTotal / stat.total }))
      .filter((item) => item.average < 2.2)
      .sort((a, b) => a.average - b.average)
      .slice(0, 2)
      .map((item) => item.dimension);

    return (
      <div className="comprehension-check">
        <h2>Comprehension Check Results</h2>
        <p className="comprehension-summary">
          Overall score: <strong>{results.overallScore}%</strong>
        </p>

        {isExamMode && sourceCoverageNames.length > 0 && (
          <p className="comprehension-summary">
            Source coverage: {sourceCoverageNames.length}/{comprehension.sourceArticleIds.length} selected
          </p>
        )}

        {isExamMode && EXAM_SECTION_ORDER.some((section) => sectionStats[section] !== undefined) && (
          <div className="comprehension-results-chips">
            {EXAM_SECTION_ORDER.map((section) => {
              const stat = sectionStats[section];
              if (!stat) return null;
              const avg = stat.scoreTotal / stat.total;
              const percent = Math.round((avg / 3) * 100);
              return (
                <span key={section} className="comprehension-chip">
                  {section}: {percent}%
                </span>
              );
            })}
          </div>
        )}

        <div className="comprehension-results-toolbar">
          <div className="comprehension-results-chips">
            <span className="comprehension-chip">Correct: {correctCount}/{questionEntries.length}</span>
            <span className="comprehension-chip comprehension-chip-warning">Needs review: {needsReviewCount}</span>
            {focusDimensions.length > 0 && (
              <span className="comprehension-chip">Focus: {focusDimensions.join(', ')}</span>
            )}
          </div>

          <div className="comprehension-results-controls">
            <span className="comprehension-results-controls-label">Review depth</span>
            <div className="comprehension-results-control-buttons">
              <button
                className={`settings-preset${reviewDepth === 'quick' ? ' settings-preset-active' : ''}`}
                onClick={() => setReviewDepth('quick')}
              >
                Quick
              </button>
              <button
                className={`settings-preset${reviewDepth === 'standard' ? ' settings-preset-active' : ''}`}
                onClick={() => setReviewDepth('standard')}
              >
                Standard
              </button>
              <button
                className={`settings-preset${reviewDepth === 'deep' ? ' settings-preset-active' : ''}`}
                onClick={() => setReviewDepth('deep')}
              >
                Deep
              </button>
            </div>
          </div>

          <div className="comprehension-results-controls">
            <span className="comprehension-results-controls-label">Filter</span>
            <div className="comprehension-results-control-buttons">
              <button
                className={`settings-preset${resultFilter === 'all' ? ' settings-preset-active' : ''}`}
                onClick={() => setResultFilter('all')}
              >
                All questions
              </button>
              <button
                className={`settings-preset${resultFilter === 'needs-review' ? ' settings-preset-active' : ''}`}
                onClick={() => setResultFilter('needs-review')}
              >
                Needs review
              </button>
            </div>
          </div>
        </div>

        {visibleEntries.length === 0 && (
          <p className="comprehension-summary">No questions match this filter.</p>
        )}

        <div className="comprehension-results">
          {visibleEntries.map(({ question, index, sourceLabel, statusInfo, needsReview, feedbackDuplicate }) => (
            <article key={question.id} className="comprehension-result-card">
              <div className="comprehension-result-header">
                <h3>
                  Q{index + 1}
                  {question.section ? ` · ${question.section}` : ''}
                  {' · '}
                  {question.format}
                </h3>
                <span className={`comprehension-result-status ${statusInfo.tone}`}>
                  {statusInfo.label}
                </span>
              </div>
              {sourceLabel && (
                <p className="comprehension-result-meta">
                  Source: {sourceLabel}
                </p>
              )}
              <p className="comprehension-result-prompt">{question.prompt}</p>
              <p><strong>Your answer:</strong> {question.userAnswer || '(no answer)'}</p>
              {question.correct !== undefined && (
                <p><strong>Auto score:</strong> {question.correct ? 'Correct' : 'Incorrect'}</p>
              )}

              {reviewDepth === 'quick' && needsReview && (
                <p><strong>Why:</strong> {question.feedback}</p>
              )}

              {reviewDepth === 'standard' && (
                <>
                  {feedbackDuplicate ? (
                    <p><strong>Explanation:</strong> {question.feedback}</p>
                  ) : (
                    <>
                      <p><strong>Feedback:</strong> {question.feedback}</p>
                      {needsReview && <p><strong>Model answer:</strong> {question.modelAnswer}</p>}
                    </>
                  )}
                </>
              )}

              {reviewDepth === 'deep' && (
                <>
                  {feedbackDuplicate ? (
                    <p><strong>Feedback / model answer:</strong> {question.feedback}</p>
                  ) : (
                    <>
                      <p><strong>Feedback:</strong> {question.feedback}</p>
                      <p><strong>Model answer:</strong> {question.modelAnswer}</p>
                    </>
                  )}
                  <p><strong>Score:</strong> {question.score}/3</p>
                </>
              )}
            </article>
          ))}
        </div>
        <div className="comprehension-actions">
          <button className="control-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="comprehension-check">
        <h2>Comprehension Check</h2>
        <p>No questions were generated.</p>
        <button className="control-btn" onClick={onClose}>Dismiss</button>
      </div>
    );
  }

  const responseValue = responses[currentQuestion.id] ?? '';
  const trueFalseExplanationValue = currentQuestion.format === 'true-false'
    ? (trueFalseExplanations[currentQuestion.id] ?? '')
    : '';
  const trueFalseSentenceCount = currentQuestion.format === 'true-false'
    ? countSentences(trueFalseExplanationValue)
    : 0;
  const trueFalseExceedsSentenceLimit = trueFalseSentenceCount > 2;
  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex < orderedQuestions.length - 1;
  const progressLabel = isExamMode
    ? `${currentQuestion.section ?? 'recall'} section`
    : `${currentQuestion.dimension} question`;
  const sourcePassage = currentQuestion.sourceArticleId
    ? sourceArticleMap.get(currentQuestion.sourceArticleId)?.content ?? article.content
    : article.content;

  return (
    <div className="comprehension-check">
      <h2>Comprehension Check</h2>
      <p className="comprehension-meta">
        {article.title} · Question {currentIndex + 1} of {orderedQuestions.length} · {progressLabel}
      </p>
      <p className={`comprehension-phase ${isOpenBookPhase ? 'open' : 'closed'}`}>
        {isOpenBookPhase ? 'Open-book phase' : 'Closed-book phase'}
      </p>

      {isOpenBookPhase && (
        <details className="comprehension-passage">
          <summary>Show passage</summary>
          <div>{sourcePassage}</div>
        </details>
      )}

      <article className="comprehension-question-card">
        <h3>
          {currentQuestion.section && `${currentQuestion.section} · `}
          {currentQuestion.format}
        </h3>
        <p>{currentQuestion.prompt}</p>

        {currentQuestion.format === 'multiple-choice' && currentQuestion.options && (
          <fieldset className="comprehension-options">
            {currentQuestion.options.map((option, index) => (
              <label key={`${currentQuestion.id}-${index}`}>
                <input
                  type="radio"
                  name={`question-${currentQuestion.id}`}
                  value={String(index)}
                  checked={responseValue === String(index)}
                  onChange={(event) => handleResponseChange(currentQuestion.id, event.target.value)}
                />
                {option}
              </label>
            ))}
          </fieldset>
        )}

        {currentQuestion.format === 'true-false' && (
          <>
            <fieldset className="comprehension-options">
              <label>
                <input
                  type="radio"
                  name={`question-${currentQuestion.id}`}
                  value="true"
                  checked={responseValue === 'true'}
                  onChange={(event) => handleResponseChange(currentQuestion.id, event.target.value)}
                />
                True
              </label>
              <label>
                <input
                  type="radio"
                  name={`question-${currentQuestion.id}`}
                  value="false"
                  checked={responseValue === 'false'}
                  onChange={(event) => handleResponseChange(currentQuestion.id, event.target.value)}
                />
                False
              </label>
            </fieldset>
            <textarea
              className="comprehension-textarea"
              value={trueFalseExplanationValue}
              onChange={(event) => handleTrueFalseExplanationChange(currentQuestion.id, event.target.value)}
              placeholder="Explain your answer in no more than 2 sentences."
              rows={3}
            />
            <p className="comprehension-meta">
              Explain in {'<='} 2 sentences.
              {trueFalseSentenceCount > 0 ? ` (${trueFalseSentenceCount}/2)` : ''}
              {trueFalseExceedsSentenceLimit ? ' Extra sentences reduce your score.' : ''}
            </p>
          </>
        )}

        {currentQuestion.format === 'short-answer' && (
          <input
            className="comprehension-input"
            type="text"
            value={responseValue}
            onChange={(event) => handleResponseChange(currentQuestion.id, event.target.value)}
            placeholder="Write a short answer"
          />
        )}

        {currentQuestion.format === 'essay' && (
          <textarea
            className="comprehension-textarea"
            value={responseValue}
            onChange={(event) => handleResponseChange(currentQuestion.id, event.target.value)}
            placeholder="Write your response"
            rows={8}
          />
        )}
      </article>

      <div className="comprehension-actions">
        <button
          className="control-btn"
          onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
          disabled={!canGoBack}
        >
          Previous
        </button>
        {canGoNext ? (
          <button
            className="control-btn"
            onClick={() => setCurrentIndex((index) => Math.min(index + 1, orderedQuestions.length - 1))}
          >
            Next
          </button>
        ) : (
          <button
            className="control-btn"
            onClick={() => void submit()}
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? 'Scoring...' : 'Submit'}
          </button>
        )}
        <button className="control-btn" onClick={onClose}>Dismiss</button>
      </div>
    </div>
  );
}
