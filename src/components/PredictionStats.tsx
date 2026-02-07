import type { PredictionStats as Stats } from '../types';
import { predictionScorePercents } from '../lib/levenshtein';

interface PredictionStatsProps {
  stats: Stats;
}

/**
 * Stats bar showing prediction progress and accuracy.
 */
export function PredictionStats({ stats }: PredictionStatsProps) {
  const { exactPercent, knownPercent } = predictionScorePercents(stats);

  return (
    <div className="prediction-stats-bar">
      <div className="prediction-stat">
        <span className="prediction-stat-value">{stats.totalWords}</span>
        <span className="prediction-stat-label">words</span>
      </div>
      <div className="prediction-stat">
        <span className="prediction-stat-value">{knownPercent}%</span>
        <span className="prediction-stat-label">known</span>
      </div>
      <div className="prediction-stat">
        <span className="prediction-stat-value">{exactPercent}%</span>
        <span className="prediction-stat-label">exact</span>
      </div>
    </div>
  );
}
