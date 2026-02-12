import { describe, expect, it } from 'vitest';
import { planTrainingContinue, planTrainingStart } from './trainingPhase';

describe('trainingPhase', () => {
  it('plans article-mode continue transitions', () => {
    expect(planTrainingContinue({
      isDrill: false,
      shouldRepeat: true,
      currentParagraphIndex: 2,
      paragraphCount: 5,
      sessionTimeLimit: null,
      sessionStartTime: null,
      now: 0,
      drillSentenceIndex: 0,
      drillRoundSentenceCount: 0,
      drillSentenceCount: 0,
    })).toEqual({ type: 'reading-same-paragraph' });

    expect(planTrainingContinue({
      isDrill: false,
      shouldRepeat: false,
      currentParagraphIndex: 1,
      paragraphCount: 5,
      sessionTimeLimit: null,
      sessionStartTime: null,
      now: 0,
      drillSentenceIndex: 0,
      drillRoundSentenceCount: 0,
      drillSentenceCount: 0,
    })).toEqual({ type: 'reading-next-paragraph', nextParagraphIndex: 2 });

    expect(planTrainingContinue({
      isDrill: false,
      shouldRepeat: false,
      currentParagraphIndex: 4,
      paragraphCount: 5,
      sessionTimeLimit: null,
      sessionStartTime: null,
      now: 0,
      drillSentenceIndex: 0,
      drillRoundSentenceCount: 0,
      drillSentenceCount: 0,
    })).toEqual({ type: 'complete' });
  });

  it('plans drill-mode continue transitions and session expiry', () => {
    expect(planTrainingContinue({
      isDrill: true,
      shouldRepeat: false,
      currentParagraphIndex: 0,
      paragraphCount: 0,
      sessionTimeLimit: 300,
      sessionStartTime: 1000,
      now: 1000 + 301_000,
      drillSentenceIndex: 0,
      drillRoundSentenceCount: 1,
      drillSentenceCount: 10,
    })).toEqual({ type: 'complete' });

    expect(planTrainingContinue({
      isDrill: true,
      shouldRepeat: false,
      currentParagraphIndex: 0,
      paragraphCount: 0,
      sessionTimeLimit: null,
      sessionStartTime: null,
      now: 0,
      drillSentenceIndex: 2,
      drillRoundSentenceCount: 1,
      drillSentenceCount: 6,
    })).toEqual({ type: 'drill-next-sentence', nextSentenceIndex: 3 });

    expect(planTrainingContinue({
      isDrill: true,
      shouldRepeat: false,
      currentParagraphIndex: 0,
      paragraphCount: 0,
      sessionTimeLimit: null,
      sessionStartTime: null,
      now: 0,
      drillSentenceIndex: 5,
      drillRoundSentenceCount: 1,
      drillSentenceCount: 6,
    })).toEqual({ type: 'drill-fetch-next-article' });
  });

  it('plans training start transitions', () => {
    expect(planTrainingStart(false)).toEqual({ type: 'reading' });
    expect(planTrainingStart(true)).toEqual({ type: 'drill-fetch-first-article' });
  });
});
