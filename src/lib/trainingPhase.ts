export interface TrainingContinueContext {
  isDrill: boolean;
  shouldRepeat: boolean;
  currentParagraphIndex: number;
  paragraphCount: number;
  sessionTimeLimit: number | null;
  sessionStartTime: number | null;
  now: number;
  drillSentenceIndex: number;
  drillRoundSentenceCount: number;
  drillSentenceCount: number;
}

export type TrainingContinuePlan =
  | { type: 'complete' }
  | { type: 'reading-same-paragraph' }
  | { type: 'reading-next-paragraph'; nextParagraphIndex: number }
  | { type: 'drill-next-sentence'; nextSentenceIndex: number }
  | { type: 'drill-fetch-next-article' };

export type TrainingStartPlan =
  | { type: 'reading' }
  | { type: 'drill-fetch-first-article' };

function isSessionExpired(sessionTimeLimit: number | null, sessionStartTime: number | null, now: number): boolean {
  if (sessionTimeLimit == null || sessionStartTime == null) return false;
  const elapsedSeconds = (now - sessionStartTime) / 1000;
  return elapsedSeconds >= sessionTimeLimit;
}

export function planTrainingContinue(context: TrainingContinueContext): TrainingContinuePlan {
  if (context.isDrill) {
    if (isSessionExpired(context.sessionTimeLimit, context.sessionStartTime, context.now)) {
      return { type: 'complete' };
    }

    const nextSentenceIndex = context.drillSentenceIndex + context.drillRoundSentenceCount;
    if (nextSentenceIndex < context.drillSentenceCount) {
      return { type: 'drill-next-sentence', nextSentenceIndex };
    }

    return { type: 'drill-fetch-next-article' };
  }

  if (context.shouldRepeat) {
    return { type: 'reading-same-paragraph' };
  }

  const nextParagraphIndex = context.currentParagraphIndex + 1;
  if (nextParagraphIndex >= context.paragraphCount) {
    return { type: 'complete' };
  }

  return { type: 'reading-next-paragraph', nextParagraphIndex };
}

export function planTrainingStart(isDrill: boolean): TrainingStartPlan {
  return isDrill ? { type: 'drill-fetch-first-article' } : { type: 'reading' };
}
