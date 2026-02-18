import { useState } from 'react';
import type { Activity, Article, ComprehensionAttempt, DisplayMode } from '../types';

interface ContinueInfo {
  article: Article;
  activity: Activity;
  displayMode: DisplayMode;
}

interface HomeScreenProps {
  onSelectActivity: (activity: Activity) => void;
  onContinue: (info: ContinueInfo) => void;
  onStartDrill: () => void;
  onStartComprehensionBuilder: () => void;
  onStartDaily: () => void;
  dailyStatus: 'idle' | 'loading' | 'error';
  dailyError: string | null;
  onStartRandom: () => void;
  randomStatus: 'idle' | 'loading' | 'error';
  randomError: string | null;
  continueInfo: ContinueInfo | null;
  comprehensionSummary: { attemptCount: number; lastScore: number | null };
  comprehensionAttempts: ComprehensionAttempt[];
}

const MAX_HISTORY_ATTEMPTS = 30;

function formatAttemptDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return String(timestamp);
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatEntryPoint(entryPoint: ComprehensionAttempt['entryPoint']): string {
  return entryPoint === 'post-reading' ? 'Post-reading' : 'Launcher';
}

export function HomeScreen({
  onSelectActivity,
  onContinue,
  onStartDrill,
  onStartComprehensionBuilder,
  onStartDaily,
  dailyStatus,
  dailyError,
  onStartRandom,
  randomStatus,
  randomError,
  continueInfo,
  comprehensionSummary,
  comprehensionAttempts,
}: HomeScreenProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const attemptsToShow = comprehensionAttempts.slice(0, MAX_HISTORY_ATTEMPTS);

  return (
    <div className="home-screen">
      {continueInfo && (
        <button
          className="continue-banner"
          onClick={() => onContinue(continueInfo)}
        >
          <span className="continue-label">Continue</span>
          <span className="continue-title">{continueInfo.article.title}</span>
          <span className="continue-meta">{continueInfo.displayMode.toUpperCase()}</span>
        </button>
      )}

      <div className="featured-row">
        <button
          className="daily-banner"
          onClick={onStartDaily}
          disabled={dailyStatus === 'loading'}
        >
          <span className="daily-label">Daily Article</span>
          <span className="daily-desc">
            {dailyStatus === 'loading'
              ? 'Fetching\u2026'
              : dailyStatus === 'error'
                ? dailyError ?? 'Failed to load'
                : 'Today\u2019s Wikipedia featured article'}
          </span>
          <span className="daily-meta">Saccade</span>
        </button>

        <button
          className="daily-banner"
          onClick={onStartRandom}
          disabled={randomStatus === 'loading'}
        >
          <span className="daily-label">Random Article</span>
          <span className="daily-desc">
            {randomStatus === 'loading'
              ? 'Fetching\u2026'
              : randomStatus === 'error'
                ? randomError ?? 'Failed to load'
                : 'Random Wikipedia featured article'}
          </span>
          <span className="daily-meta">Saccade</span>
        </button>
      </div>

      <div className="activity-grid">
        <button
          className="activity-card"
          onClick={() => onSelectActivity('paced-reading')}
        >
          <h2 className="activity-card-title">Paced Reading</h2>
          <p className="activity-card-desc">Read with adjustable pace guidance</p>
          <div className="activity-card-modes">
            <span className="activity-card-mode">RSVP</span>
            <span className="activity-card-mode">Saccade</span>
            <span className="activity-card-mode">Generation</span>
          </div>
        </button>

        <button
          className="activity-card"
          onClick={() => onSelectActivity('active-recall')}
        >
          <h2 className="activity-card-title">Active Recall</h2>
          <p className="activity-card-desc">Test working memory and retention</p>
          <div className="activity-card-modes">
            <span className="activity-card-mode">Prediction</span>
            <span className="activity-card-mode">Recall</span>
          </div>
        </button>

        <div className="activity-card activity-card-split">
          <h2 className="activity-card-title">Comprehension Check</h2>
          <p className="activity-card-desc">LLM-generated questions with explanatory feedback</p>
          <p className="activity-card-meta">
            {comprehensionSummary.attemptCount > 0
              ? `Attempts: ${comprehensionSummary.attemptCount} · Last score: ${comprehensionSummary.lastScore}%`
              : 'No attempts yet'}
          </p>
          <div className="activity-card-actions">
            <button
              className="activity-card-action"
              onClick={() => onSelectActivity('comprehension-check')}
            >
              Start Check
            </button>
            <button
              className="activity-card-action"
              onClick={onStartComprehensionBuilder}
            >
              Build Exam
            </button>
            <button
              className="activity-card-action"
              onClick={() => setIsHistoryOpen((value) => !value)}
            >
              {isHistoryOpen ? 'Hide History' : 'Review History'}
            </button>
          </div>
          <div className="activity-card-modes">
            <span className="activity-card-mode">Factual</span>
            <span className="activity-card-mode">Inference</span>
            <span className="activity-card-mode">Evaluative</span>
          </div>
        </div>

        <div className="activity-card activity-card-split">
          <h2 className="activity-card-title">Training</h2>
          <p className="activity-card-desc">Structured read-recall loops with adaptive pacing</p>
          <div className="activity-card-actions">
            <button
              className="activity-card-action"
              onClick={() => onSelectActivity('training')}
            >
              Memorize
            </button>
            <button
              className="activity-card-action"
              onClick={onStartDrill}
            >
              Random Drill
            </button>
          </div>
        </div>
      </div>

      {isHistoryOpen && (
        <section className="comprehension-history-panel" aria-label="Comprehension history">
          <div className="comprehension-history-header">
            <h2>Comprehension History</h2>
            <p>
              Showing {attemptsToShow.length}
              {comprehensionAttempts.length > MAX_HISTORY_ATTEMPTS
                ? ` of ${comprehensionAttempts.length}`
                : ''}
              {' '}attempts
            </p>
          </div>

          {attemptsToShow.length === 0 ? (
            <p className="comprehension-history-empty">No comprehension attempts yet.</p>
          ) : (
            <div className="comprehension-history-list">
              {attemptsToShow.map((attempt) => (
                <article key={attempt.id} className="comprehension-history-item">
                  <h3>{attempt.articleTitle}</h3>
                  <p className="comprehension-history-meta">
                    Score {attempt.overallScore}% · {attempt.questions.length} questions · {formatDuration(attempt.durationMs)} · {formatEntryPoint(attempt.entryPoint)}
                  </p>
                  <p className="comprehension-history-time">{formatAttemptDate(attempt.createdAt)}</p>

                  <details className="comprehension-history-details">
                    <summary>Review answers</summary>
                    <div className="comprehension-history-answers">
                      {attempt.questions.map((question, index) => (
                        <section key={`${attempt.id}-${question.id}`} className="comprehension-history-answer">
                          <h4>Q{index + 1} · {question.dimension} · {question.format}</h4>
                          <p>{question.prompt}</p>
                          <p><strong>Your answer:</strong> {question.userAnswer || '(no answer)'}</p>
                          <p><strong>Feedback:</strong> {question.feedback}</p>
                          <p><strong>Model answer:</strong> {question.modelAnswer}</p>
                        </section>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
