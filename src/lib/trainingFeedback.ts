import type { TrainingParagraphResult } from '../types';
import { adjustDrillDifficulty } from './trainingDrill';
import {
  adjustArticleTrainingWpm,
  computeTrainingScore,
  finalizeTrainingStats,
  type TrainingFinalWord,
  type TrainingScoreResult,
  type TrainingScoreStats,
} from './trainingScoring';

export interface TrainingArticleHistoryUpdate {
  paragraphIndex: number;
  score: number;
  wpm: number;
}

export interface PlanFinishRecallPhaseContext {
  stats: TrainingScoreStats;
  finalWord: TrainingFinalWord | null;
  isDrill: boolean;
  sentenceMode: boolean;
  currentSentenceIndex: number;
  sentenceCount: number;
  includeDetailsInScore: boolean;
  currentParagraphIndex: number;
  wpm: number;
  autoAdjustDifficulty: boolean;
  drillMinWpm: number;
  drillMaxWpm: number;
  hasRepeatedParagraph: boolean;
}

interface FinishRecallFeedbackBase {
  type: 'to-feedback';
  finalStats: TrainingScoreStats;
  score: TrainingScoreResult;
  lastDetailCount: number;
}

export interface FinishRecallAdvanceSentencePlan {
  type: 'advance-sentence';
  finalStats: TrainingScoreStats;
  nextSentenceIndex: number;
}

export interface FinishRecallDrillFeedbackPlan extends FinishRecallFeedbackBase {
  mode: 'drill';
  nextWpm: number;
  wpmDelta: number;
  shouldApplyWpmChange: boolean;
}

export interface FinishRecallArticleFeedbackPlan extends FinishRecallFeedbackBase {
  mode: 'article';
  nextWpm: number;
  wpmDelta: number;
  sessionResult: TrainingParagraphResult;
  historyUpdate: TrainingArticleHistoryUpdate;
}

export type FinishRecallPhasePlan =
  | FinishRecallAdvanceSentencePlan
  | FinishRecallDrillFeedbackPlan
  | FinishRecallArticleFeedbackPlan;

export function planFinishRecallPhase(context: PlanFinishRecallPhaseContext): FinishRecallPhasePlan {
  const finalStats = finalizeTrainingStats(context.stats, context.finalWord);

  if (!context.isDrill && context.sentenceMode && context.currentSentenceIndex < context.sentenceCount - 1) {
    return {
      type: 'advance-sentence',
      finalStats,
      nextSentenceIndex: context.currentSentenceIndex + 1,
    };
  }

  const score = computeTrainingScore(finalStats, context.includeDetailsInScore);

  if (context.isDrill) {
    let nextWpm = context.wpm;
    if (context.autoAdjustDifficulty && (score.scorePercent < 90 || score.scorePercent >= 95)) {
      const adjustment = adjustDrillDifficulty(
        context.wpm,
        context.drillMinWpm,
        context.drillMaxWpm,
        score.scorePercent >= 95
      );
      nextWpm = adjustment.wpm;
    }

    return {
      type: 'to-feedback',
      mode: 'drill',
      finalStats,
      score,
      lastDetailCount: finalStats.detailTotal,
      nextWpm,
      wpmDelta: nextWpm - context.wpm,
      shouldApplyWpmChange: nextWpm !== context.wpm,
    };
  }

  const sessionResult: TrainingParagraphResult = {
    paragraphIndex: context.currentParagraphIndex,
    score: score.scoreNorm,
    wpm: context.wpm,
    repeated: context.hasRepeatedParagraph,
    wordCount: finalStats.totalWords,
    exactMatches: finalStats.exactMatches,
  };

  const nextWpm = adjustArticleTrainingWpm(context.wpm, score.scorePercent);
  return {
    type: 'to-feedback',
    mode: 'article',
    finalStats,
    score,
    lastDetailCount: finalStats.detailTotal,
    nextWpm,
    wpmDelta: nextWpm - context.wpm,
    sessionResult,
    historyUpdate: {
      paragraphIndex: context.currentParagraphIndex,
      score: score.scoreNorm,
      wpm: context.wpm,
    },
  };
}
