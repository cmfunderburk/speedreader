export interface RecallStatsDelta {
  totalWords: number;
  exactMatches: number;
  knownWords: number;
  detailTotal: number;
  detailKnown: number;
}

export interface RecallChunkLike {
  text: string;
  saccade?: {
    lineIndex: number;
    startChar: number;
  };
}

export interface RecallScoredWord {
  key: string;
  text: string;
  correct: boolean;
  forfeited: boolean;
}

interface RecallFinishWord {
  known: boolean;
  exact: boolean;
  isDetail: boolean;
}

export type ScaffoldRecallPlan =
  | { type: 'show-miss' }
  | { type: 'advance'; nextIndex: number; statsDelta: RecallStatsDelta }
  | { type: 'finish'; finalWord: RecallFinishWord };

interface ConsumeRecallTokensArgs {
  tokens: string[];
  chunks: RecallChunkLike[];
  startIndex: number;
  stats: RecallStatsDelta;
  forfeitedWordKeys: ReadonlySet<string>;
  isWordKnown: (predicted: string, actual: string) => boolean;
  isExactMatch: (predicted: string, actual: string) => boolean;
  isDetailChunk: (chunkIndex: number) => boolean;
}

interface ConsumeRecallTokensResult {
  nextIndex: number;
  nextStats: RecallStatsDelta;
  scoredWords: RecallScoredWord[];
}

interface BuildRemainingMissStatsArgs {
  chunkCount: number;
  currentIndex: number;
  stats: RecallStatsDelta;
  isDetailChunk: (chunkIndex: number) => boolean;
}

interface PlanScaffoldRecallArgs {
  isKnown: boolean;
  isExact: boolean;
  isDetail: boolean;
  isDrill: boolean;
  currentIndex: number;
  chunkCount: number;
}

export function applyStatsDelta<T extends RecallStatsDelta>(stats: T, delta: RecallStatsDelta): T {
  return {
    ...stats,
    totalWords: stats.totalWords + delta.totalWords,
    exactMatches: stats.exactMatches + delta.exactMatches,
    knownWords: stats.knownWords + delta.knownWords,
    detailTotal: stats.detailTotal + delta.detailTotal,
    detailKnown: stats.detailKnown + delta.detailKnown,
  };
}

export function makeRecallWordKey(lineIndex: number, startChar: number): string {
  return `0:${lineIndex}:${startChar}`;
}

export function collectRemainingPreviewWordKeys(chunks: RecallChunkLike[], startIndex: number): string[] {
  const keys: string[] = [];
  for (let i = startIndex; i < chunks.length; i++) {
    const saccade = chunks[i]?.saccade;
    if (!saccade) continue;
    keys.push(makeRecallWordKey(saccade.lineIndex, saccade.startChar));
  }
  return keys;
}

export function consumeRecallTokens({
  tokens,
  chunks,
  startIndex,
  stats,
  forfeitedWordKeys,
  isWordKnown,
  isExactMatch,
  isDetailChunk,
}: ConsumeRecallTokensArgs): ConsumeRecallTokensResult {
  let nextIndex = startIndex;
  let nextStats = { ...stats };
  const scoredWords: RecallScoredWord[] = [];

  for (const token of tokens) {
    const chunk = chunks[nextIndex];
    if (!chunk) break;

    const actual = chunk.text;
    const known = isWordKnown(token, actual);
    const exact = isExactMatch(token, actual);
    const detail = isDetailChunk(nextIndex);
    const key = chunk.saccade
      ? makeRecallWordKey(chunk.saccade.lineIndex, chunk.saccade.startChar)
      : `fallback:${nextIndex}`;
    const forfeited = forfeitedWordKeys.has(key);
    const creditedKnown = forfeited ? false : known;
    const creditedExact = forfeited ? false : exact;

    scoredWords.push({
      key,
      text: actual,
      correct: creditedKnown,
      forfeited,
    });
    nextStats = {
      totalWords: nextStats.totalWords + 1,
      exactMatches: nextStats.exactMatches + (creditedExact ? 1 : 0),
      knownWords: nextStats.knownWords + (creditedKnown ? 1 : 0),
      detailTotal: nextStats.detailTotal + (detail ? 1 : 0),
      detailKnown: nextStats.detailKnown + (creditedKnown && detail ? 1 : 0),
    };
    nextIndex += 1;
  }

  return { nextIndex, nextStats, scoredWords };
}

export function buildRemainingMissStats({
  chunkCount,
  currentIndex,
  stats,
  isDetailChunk,
}: BuildRemainingMissStatsArgs): RecallStatsDelta | null {
  const remaining = chunkCount - currentIndex;
  if (remaining <= 0) return null;

  let remainingDetails = 0;
  for (let i = currentIndex; i < chunkCount; i++) {
    if (isDetailChunk(i)) remainingDetails++;
  }

  return {
    totalWords: stats.totalWords + remaining,
    exactMatches: stats.exactMatches,
    knownWords: stats.knownWords,
    detailTotal: stats.detailTotal + remainingDetails,
    detailKnown: stats.detailKnown,
  };
}

export function planScaffoldRecallTransition({
  isKnown,
  isExact,
  isDetail,
  isDrill,
  currentIndex,
  chunkCount,
}: PlanScaffoldRecallArgs): ScaffoldRecallPlan {
  const nextIndex = currentIndex + 1;
  const atEnd = nextIndex >= chunkCount;

  if (isKnown) {
    if (atEnd) {
      return { type: 'finish', finalWord: { known: true, exact: isExact, isDetail } };
    }
    return {
      type: 'advance',
      nextIndex,
      statsDelta: {
        totalWords: 1,
        exactMatches: isExact ? 1 : 0,
        knownWords: 1,
        detailTotal: isDetail ? 1 : 0,
        detailKnown: isDetail ? 1 : 0,
      },
    };
  }

  if (!isDrill) {
    return { type: 'show-miss' };
  }

  if (atEnd) {
    return { type: 'finish', finalWord: { known: false, exact: false, isDetail } };
  }

  return {
    type: 'advance',
    nextIndex,
    statsDelta: {
      totalWords: 1,
      exactMatches: 0,
      knownWords: 0,
      detailTotal: isDetail ? 1 : 0,
      detailKnown: 0,
    },
  };
}
