import { describe, expect, it } from 'vitest';
import {
  applyStatsDelta,
  buildRemainingMissStats,
  collectRemainingPreviewWordKeys,
  consumeRecallTokens,
  parseNoScaffoldRecallInput,
  planScaffoldMissContinue,
  planScaffoldRecallSubmission,
  planScaffoldRecallTransition,
} from './trainingRecall';

describe('trainingRecall', () => {
  it('plans scaffold known-word transitions', () => {
    expect(planScaffoldRecallTransition({
      isKnown: true,
      isExact: true,
      isDetail: true,
      isDrill: false,
      currentIndex: 0,
      chunkCount: 3,
    })).toEqual({
      type: 'advance',
      nextIndex: 1,
      statsDelta: {
        totalWords: 1,
        exactMatches: 1,
        knownWords: 1,
        detailTotal: 1,
        detailKnown: 1,
      },
    });

    expect(planScaffoldRecallTransition({
      isKnown: true,
      isExact: false,
      isDetail: false,
      isDrill: false,
      currentIndex: 2,
      chunkCount: 3,
    })).toEqual({
      type: 'finish',
      finalWord: { known: true, exact: false, isDetail: false },
    });
  });

  it('plans scaffold miss transitions for non-drill and drill modes', () => {
    expect(planScaffoldRecallTransition({
      isKnown: false,
      isExact: false,
      isDetail: true,
      isDrill: false,
      currentIndex: 0,
      chunkCount: 3,
    })).toEqual({ type: 'show-miss' });

    expect(planScaffoldRecallTransition({
      isKnown: false,
      isExact: false,
      isDetail: true,
      isDrill: true,
      currentIndex: 0,
      chunkCount: 3,
    })).toEqual({
      type: 'advance',
      nextIndex: 1,
      statsDelta: {
        totalWords: 1,
        exactMatches: 0,
        knownWords: 0,
        detailTotal: 1,
        detailKnown: 0,
      },
    });

    expect(planScaffoldRecallTransition({
      isKnown: false,
      isExact: false,
      isDetail: false,
      isDrill: true,
      currentIndex: 2,
      chunkCount: 3,
    })).toEqual({
      type: 'finish',
      finalWord: { known: false, exact: false, isDetail: false },
    });
  });

  it('plans scaffold submission result including completed word and miss details', () => {
    const plan = planScaffoldRecallSubmission({
      predicted: 'alpah',
      chunk: { text: 'alpha', saccade: { lineIndex: 2, startChar: 5 } },
      isDrill: false,
      currentIndex: 1,
      chunkCount: 3,
      isDetail: false,
      isWordKnown: () => false,
      isExactMatch: () => false,
    });

    expect(plan).toEqual({
      type: 'show-miss',
      completedWord: { key: '0:2:5', text: 'alpha', correct: false },
      missResult: { predicted: 'alpah', actual: 'alpha' },
    });
  });

  it('plans scaffold submission advance with fallback key for non-saccade chunk', () => {
    const plan = planScaffoldRecallSubmission({
      predicted: 'beta',
      chunk: { text: 'beta' },
      isDrill: true,
      currentIndex: 4,
      chunkCount: 6,
      isDetail: true,
      isWordKnown: () => true,
      isExactMatch: () => true,
    });

    expect(plan).toEqual({
      type: 'advance',
      completedWord: { key: 'fallback:4', text: 'beta', correct: true },
      nextIndex: 5,
      statsDelta: {
        totalWords: 1,
        exactMatches: 1,
        knownWords: 1,
        detailTotal: 1,
        detailKnown: 1,
      },
    });
  });

  it('plans drill miss-continue transitions', () => {
    expect(planScaffoldMissContinue({
      currentIndex: 1,
      chunkCount: 3,
      isDetail: true,
    })).toEqual({
      type: 'advance',
      nextIndex: 2,
      statsDelta: {
        totalWords: 1,
        exactMatches: 0,
        knownWords: 0,
        detailTotal: 1,
        detailKnown: 0,
      },
    });

    expect(planScaffoldMissContinue({
      currentIndex: 2,
      chunkCount: 3,
      isDetail: false,
    })).toEqual({
      type: 'finish',
      finalWord: { known: false, exact: false, isDetail: false },
    });
  });

  it('parses no-scaffold recall input into complete and pending tokens', () => {
    expect(parseNoScaffoldRecallInput('alpha beta ')).toEqual({
      completeTokens: ['alpha', 'beta'],
      pendingToken: '',
    });

    expect(parseNoScaffoldRecallInput('alpha beta gam')).toEqual({
      completeTokens: ['alpha', 'beta'],
      pendingToken: 'gam',
    });

    expect(parseNoScaffoldRecallInput('   ')).toEqual({
      completeTokens: [],
      pendingToken: '',
    });
  });

  it('applies stats delta deterministically', () => {
    expect(applyStatsDelta(
      { totalWords: 4, exactMatches: 2, knownWords: 3, detailTotal: 1, detailKnown: 1 },
      { totalWords: 1, exactMatches: 0, knownWords: 1, detailTotal: 1, detailKnown: 0 }
    )).toEqual({
      totalWords: 5,
      exactMatches: 2,
      knownWords: 4,
      detailTotal: 2,
      detailKnown: 1,
    });
  });

  it('collects preview keys from remaining saccade chunks', () => {
    const keys = collectRemainingPreviewWordKeys([
      { text: 'skip' },
      { text: 'alpha', saccade: { lineIndex: 2, startChar: 3 } },
      { text: 'beta', saccade: { lineIndex: 2, startChar: 10 } },
      { text: 'gamma' },
    ], 1);

    expect(keys).toEqual(['0:2:3', '0:2:10']);
  });

  it('scores token consumption with forfeits and detail counting', () => {
    const result = consumeRecallTokens({
      tokens: ['alpha', 'beta', 'gamma'],
      chunks: [
        { text: 'alpha', saccade: { lineIndex: 0, startChar: 0 } },
        { text: 'beta', saccade: { lineIndex: 0, startChar: 6 } },
        { text: 'gamma', saccade: { lineIndex: 1, startChar: 0 } },
      ],
      startIndex: 0,
      stats: { totalWords: 2, exactMatches: 1, knownWords: 1, detailTotal: 1, detailKnown: 0 },
      forfeitedWordKeys: new Set(['0:0:6']),
      isWordKnown: (predicted, actual) => predicted === actual,
      isExactMatch: (predicted, actual) => predicted === actual,
      isDetailChunk: (chunkIndex) => chunkIndex === 2,
    });

    expect(result.scoredWords).toEqual([
      { key: '0:0:0', text: 'alpha', correct: true, forfeited: false },
      { key: '0:0:6', text: 'beta', correct: false, forfeited: true },
      { key: '0:1:0', text: 'gamma', correct: true, forfeited: false },
    ]);
    expect(result.nextIndex).toBe(3);
    expect(result.nextStats).toEqual({
      totalWords: 5,
      exactMatches: 3,
      knownWords: 3,
      detailTotal: 2,
      detailKnown: 1,
    });
  });

  it('builds remaining-miss stats deterministically', () => {
    expect(buildRemainingMissStats({
      chunkCount: 5,
      currentIndex: 2,
      stats: {
        totalWords: 10,
        exactMatches: 7,
        knownWords: 8,
        detailTotal: 2,
        detailKnown: 1,
      },
      isDetailChunk: (index) => index === 3,
    })).toEqual({
      totalWords: 13,
      exactMatches: 7,
      knownWords: 8,
      detailTotal: 3,
      detailKnown: 1,
    });

    expect(buildRemainingMissStats({
      chunkCount: 3,
      currentIndex: 3,
      stats: {
        totalWords: 1,
        exactMatches: 1,
        knownWords: 1,
        detailTotal: 0,
        detailKnown: 0,
      },
      isDetailChunk: () => false,
    })).toBeNull();
  });
});
