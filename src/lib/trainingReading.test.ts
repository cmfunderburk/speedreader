import { describe, expect, it } from 'vitest';
import { planTrainingReadingStart, planTrainingReadingStep } from './trainingReading';

describe('trainingReading', () => {
  it('plans reading start based on body-line availability', () => {
    expect(planTrainingReadingStart(0)).toEqual({ type: 'to-recall' });
    expect(planTrainingReadingStart(3)).toEqual({ type: 'run-sweep' });
  });

  it('plans each sweep step and transitions to recall at end', () => {
    const lines = [2, 5, 9];
    expect(planTrainingReadingStep(0, lines)).toEqual({
      type: 'show-line',
      lineIndex: 2,
      nextStep: 1,
    });
    expect(planTrainingReadingStep(2, lines)).toEqual({
      type: 'show-line',
      lineIndex: 9,
      nextStep: 3,
    });
    expect(planTrainingReadingStep(3, lines)).toEqual({ type: 'to-recall' });
  });
});
