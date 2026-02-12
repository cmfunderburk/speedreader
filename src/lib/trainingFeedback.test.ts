import { describe, expect, it } from 'vitest';
import { planFinishRecallPhase } from './trainingFeedback';

describe('trainingFeedback', () => {
  it('advances to next sentence in article sentence-mode before feedback', () => {
    const plan = planFinishRecallPhase({
      stats: { totalWords: 4, exactMatches: 3, knownWords: 3, detailTotal: 1, detailKnown: 1 },
      finalWord: { known: true, exact: true, isDetail: false },
      isDrill: false,
      sentenceMode: true,
      currentSentenceIndex: 0,
      sentenceCount: 2,
      includeDetailsInScore: true,
      currentParagraphIndex: 3,
      wpm: 320,
      autoAdjustDifficulty: false,
      drillMinWpm: 250,
      drillMaxWpm: 390,
      hasRepeatedParagraph: false,
    });

    expect(plan).toEqual({
      type: 'advance-sentence',
      nextSentenceIndex: 1,
      finalStats: {
        totalWords: 5,
        exactMatches: 4,
        knownWords: 4,
        detailTotal: 1,
        detailKnown: 1,
      },
    });
  });

  it('plans drill feedback with bounded auto-adjust WPM change on low score', () => {
    const plan = planFinishRecallPhase({
      stats: { totalWords: 10, exactMatches: 6, knownWords: 8, detailTotal: 0, detailKnown: 0 },
      finalWord: null,
      isDrill: true,
      sentenceMode: false,
      currentSentenceIndex: 0,
      sentenceCount: 1,
      includeDetailsInScore: true,
      currentParagraphIndex: 0,
      wpm: 300,
      autoAdjustDifficulty: true,
      drillMinWpm: 250,
      drillMaxWpm: 360,
      hasRepeatedParagraph: false,
    });

    expect(plan).toMatchObject({
      type: 'to-feedback',
      mode: 'drill',
      nextWpm: 290,
      wpmDelta: -10,
      shouldApplyWpmChange: true,
      score: {
        scorePercent: 80,
        scoreNorm: 0.8,
      },
    });
  });

  it('plans drill feedback without WPM change when thresholds are not triggered', () => {
    const plan = planFinishRecallPhase({
      stats: { totalWords: 10, exactMatches: 8, knownWords: 9, detailTotal: 0, detailKnown: 0 },
      finalWord: null,
      isDrill: true,
      sentenceMode: false,
      currentSentenceIndex: 0,
      sentenceCount: 1,
      includeDetailsInScore: true,
      currentParagraphIndex: 0,
      wpm: 300,
      autoAdjustDifficulty: true,
      drillMinWpm: 250,
      drillMaxWpm: 360,
      hasRepeatedParagraph: false,
    });

    expect(plan).toMatchObject({
      type: 'to-feedback',
      mode: 'drill',
      nextWpm: 300,
      wpmDelta: 0,
      shouldApplyWpmChange: false,
      score: {
        scorePercent: 90,
      },
    });
  });

  it('plans article feedback with session result, history update, and WPM adjustment', () => {
    const plan = planFinishRecallPhase({
      stats: { totalWords: 8, exactMatches: 6, knownWords: 7, detailTotal: 2, detailKnown: 1 },
      finalWord: { known: true, exact: false, isDetail: true },
      isDrill: false,
      sentenceMode: false,
      currentSentenceIndex: 0,
      sentenceCount: 1,
      includeDetailsInScore: false,
      currentParagraphIndex: 4,
      wpm: 300,
      autoAdjustDifficulty: false,
      drillMinWpm: 250,
      drillMaxWpm: 360,
      hasRepeatedParagraph: true,
    });

    expect(plan).toMatchObject({
      type: 'to-feedback',
      mode: 'article',
      nextWpm: 315,
      wpmDelta: 15,
      score: {
        scorePercent: 100,
        scoreNorm: 1,
        effectiveTotal: 6,
        effectiveKnown: 6,
      },
      sessionResult: {
        paragraphIndex: 4,
        score: 1,
        wpm: 300,
        repeated: true,
        wordCount: 9,
        exactMatches: 6,
      },
      historyUpdate: {
        paragraphIndex: 4,
        score: 1,
        wpm: 300,
      },
    });
  });
});
