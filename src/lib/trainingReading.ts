export type TrainingReadingStartPlan =
  | { type: 'to-recall' }
  | { type: 'run-sweep' };

export type TrainingReadingStepPlan =
  | { type: 'to-recall' }
  | { type: 'show-line'; lineIndex: number; nextStep: number };

export function planTrainingReadingStart(bodyLineCount: number): TrainingReadingStartPlan {
  if (bodyLineCount <= 0) {
    return { type: 'to-recall' };
  }
  return { type: 'run-sweep' };
}

export function planTrainingReadingStep(step: number, bodyLineIndices: number[]): TrainingReadingStepPlan {
  if (step >= bodyLineIndices.length) {
    return { type: 'to-recall' };
  }
  return {
    type: 'show-line',
    lineIndex: bodyLineIndices[step],
    nextStep: step + 1,
  };
}
