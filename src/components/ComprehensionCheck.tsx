import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appendComprehensionAttempt, generateId } from '../lib/storage';
import type { ComprehensionAdapter } from '../lib/comprehensionAdapter';
import type {
  Article,
  ComprehensionAttempt,
  ComprehensionQuestionResult,
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
}

interface CheckResults {
  questions: ComprehensionQuestionResult[];
  overallScore: number;
}

type ReviewDepth = 'quick' | 'standard' | 'deep';
type ResultFilter = 'all' | 'needs-review';
const FREE_RESPONSE_SCORE_CONCURRENCY = 2;

const MISSING_API_KEY_ERROR = 'Comprehension check requires an API key';
const MISSING_API_KEY_HELP_TEXT = 'Comprehension Check requires an API key. Add your key in Settings and retry.';

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
  if (question.format === 'true-false') {
    if (response === 'true') return 'True';
    if (response === 'false') return 'False';
    return '';
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
  if (question.format === 'true-false') {
    const selected = response === 'true' ? true : response === 'false' ? false : null;
    const correct = selected !== null && selected === question.correctAnswer;
    return { score: correct ? 3 : 0, correct };
  }
  return null;
}

export function ComprehensionCheck({
  article,
  entryPoint,
  adapter,
  onClose,
  onOpenSettings,
  onAttemptSaved,
  questionCount = 8,
}: ComprehensionCheckProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'submitting' | 'complete'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMissingApiKeyError, setIsMissingApiKeyError] = useState(false);
  const [reviewDepth, setReviewDepth] = useState<ReviewDepth>('quick');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [questions, setQuestions] = useState<GeneratedComprehensionQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [results, setResults] = useState<CheckResults | null>(null);
  const startTimeRef = useRef(Date.now());

  const orderedQuestions = useMemo(() => {
    const factual = questions.filter((question) => question.dimension === 'factual');
    const nonFactual = questions.filter((question) => question.dimension !== 'factual');
    return [...factual, ...nonFactual];
  }, [questions]);

  const closedBookCount = useMemo(
    () => orderedQuestions.filter((question) => question.dimension === 'factual').length,
    [orderedQuestions]
  );
  const isOpenBookPhase = closedBookCount === 0 || currentIndex >= closedBookCount;

  const currentQuestion = orderedQuestions[currentIndex] ?? null;

  const loadQuestions = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    setIsMissingApiKeyError(false);
    setReviewDepth('quick');
    setResultFilter('all');
    setResults(null);
    setResponses({});
    setCurrentIndex(0);
    startTimeRef.current = Date.now();

    try {
      const generated = await adapter.generateCheck(article.content, questionCount);
      setQuestions(generated.questions);
      setStatus('ready');
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to generate comprehension check';
      const missingApiKey = rawMessage.trim() === MISSING_API_KEY_ERROR;
      const message = missingApiKey
        ? MISSING_API_KEY_HELP_TEXT
        : rawMessage;
      setErrorMessage(message);
      setIsMissingApiKeyError(missingApiKey);
      setStatus('error');
    }
  }, [adapter, article.content, questionCount]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const handleResponseChange = useCallback((questionId: string, value: string) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (orderedQuestions.length === 0) return;
    setStatus('submitting');

    const scoreQuestion = async (question: GeneratedComprehensionQuestion): Promise<ComprehensionQuestionResult> => {
      const response = responses[question.id] ?? '';
      const userAnswer = formatUserAnswer(question, response);
      const autoScore = scoreAutoQuestion(question, response);

      if (autoScore) {
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
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
          prompt: question.prompt,
          userAnswer: '',
          modelAnswer: question.modelAnswer,
          score: 0,
          feedback: 'No answer submitted. Review the model answer below.',
        };
      }

      try {
        const scored = await adapter.scoreAnswer(article.content, question, userAnswer);
        return {
          id: question.id,
          dimension: question.dimension,
          format: question.format,
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

    const totalScore = scoredQuestions.reduce((sum, question) => sum + question.score, 0);
    const maxScore = scoredQuestions.length * 3;
    const overallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const attempt: ComprehensionAttempt = {
      id: generateId(),
      articleId: article.id,
      articleTitle: article.title,
      entryPoint,
      questions: scoredQuestions,
      overallScore,
      createdAt: Date.now(),
      durationMs: Math.max(0, Date.now() - startTimeRef.current),
    };
    appendComprehensionAttempt(attempt);
    onAttemptSaved?.(attempt);

    setResults({ questions: scoredQuestions, overallScore });
    setStatus('complete');
  }, [adapter, article.content, article.id, article.title, entryPoint, onAttemptSaved, orderedQuestions, responses]);

  if (status === 'loading') {
    return (
      <div className="comprehension-check">
        <h2>Comprehension Check</h2>
        <p>Generating questions...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="comprehension-check">
        <h2>Comprehension Check</h2>
        <p>{errorMessage ?? 'Unable to generate comprehension check.'}</p>
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
    const questionEntries = results.questions.map((question, index) => {
      const statusInfo = getQuestionStatus(question);
      return {
        question,
        index,
        statusInfo,
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
          {visibleEntries.map(({ question, index, statusInfo, needsReview, feedbackDuplicate }) => (
            <article key={question.id} className="comprehension-result-card">
              <div className="comprehension-result-header">
                <h3>Q{index + 1} · {question.dimension} · {question.format}</h3>
                <span className={`comprehension-result-status ${statusInfo.tone}`}>
                  {statusInfo.label}
                </span>
              </div>
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
  const canGoBack = currentIndex > 0;
  const canGoNext = currentIndex < orderedQuestions.length - 1;

  return (
    <div className="comprehension-check">
      <h2>Comprehension Check</h2>
      <p className="comprehension-meta">
        {article.title} · Question {currentIndex + 1} of {orderedQuestions.length}
      </p>
      <p className={`comprehension-phase ${isOpenBookPhase ? 'open' : 'closed'}`}>
        {isOpenBookPhase ? 'Open-book phase' : 'Closed-book phase'}
      </p>

      {isOpenBookPhase && (
        <details className="comprehension-passage">
          <summary>Show passage</summary>
          <div>{article.content}</div>
        </details>
      )}

      <article className="comprehension-question-card">
        <h3>{currentQuestion.dimension} · {currentQuestion.format}</h3>
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
