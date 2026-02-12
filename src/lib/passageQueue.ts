import type { Passage, PassageReviewState } from '../types';

export function passageStatePriority(state: PassageReviewState): number {
  switch (state) {
    case 'hard':
      return 0;
    case 'new':
      return 1;
    case 'easy':
      return 2;
    case 'done':
      return 3;
    default:
      return 4;
  }
}

export function buildPassageReviewQueue(passages: Passage[]): Passage[] {
  return passages
    .filter((passage) => passage.reviewState !== 'done')
    .sort((a, b) => {
      const byState = passageStatePriority(a.reviewState) - passageStatePriority(b.reviewState);
      if (byState !== 0) return byState;
      return b.updatedAt - a.updatedAt;
    });
}
