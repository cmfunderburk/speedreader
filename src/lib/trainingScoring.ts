export interface TrainingScoreStats {
  totalWords: number;
  exactMatches: number;
  knownWords: number;
  detailTotal: number;
  detailKnown: number;
}

export interface TrainingFinalWord {
  known: boolean;
  exact: boolean;
  isDetail: boolean;
}

export interface TrainingScoreResult {
  scorePercent: number;
  scoreNorm: number;
  effectiveTotal: number;
  effectiveKnown: number;
}

export function finalizeTrainingStats(
  stats: TrainingScoreStats,
  finalWord: TrainingFinalWord | null
): TrainingScoreStats {
  if (!finalWord) return stats;

  return {
    totalWords: stats.totalWords + 1,
    exactMatches: stats.exactMatches + (finalWord.exact ? 1 : 0),
    knownWords: stats.knownWords + (finalWord.known ? 1 : 0),
    detailTotal: stats.detailTotal + (finalWord.isDetail ? 1 : 0),
    detailKnown: stats.detailKnown + (finalWord.isDetail && finalWord.known ? 1 : 0),
  };
}

export function computeTrainingScore(
  stats: TrainingScoreStats,
  includeDetails: boolean
): TrainingScoreResult {
  const effectiveTotal = includeDetails ? stats.totalWords : stats.totalWords - stats.detailTotal;
  const effectiveKnown = includeDetails ? stats.knownWords : stats.knownWords - stats.detailKnown;
  const scorePercent = effectiveTotal > 0 ? Math.round((effectiveKnown / effectiveTotal) * 100) : 0;

  return {
    scorePercent,
    scoreNorm: scorePercent / 100,
    effectiveTotal,
    effectiveKnown,
  };
}

export function adjustArticleTrainingWpm(currentWpm: number, scorePercent: number): number {
  if (scorePercent < 90) {
    return Math.max(100, currentWpm - 25);
  }
  if (scorePercent >= 95) {
    return Math.min(800, currentWpm + 15);
  }
  return currentWpm;
}
