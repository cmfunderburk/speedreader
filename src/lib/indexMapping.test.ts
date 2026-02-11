import { describe, expect, it } from 'vitest';
import { mapChunkIndexByProgress } from './indexMapping';

describe('mapChunkIndexByProgress', () => {
  it('returns 0 when target length is empty', () => {
    expect(mapChunkIndexByProgress(5, 10, 0)).toBe(0);
  });

  it('returns 0 when source length is empty', () => {
    expect(mapChunkIndexByProgress(5, 0, 10)).toBe(0);
  });

  it('keeps boundaries stable', () => {
    expect(mapChunkIndexByProgress(0, 10, 7)).toBe(0);
    expect(mapChunkIndexByProgress(9, 10, 7)).toBe(6);
  });

  it('clamps out-of-range source indices', () => {
    expect(mapChunkIndexByProgress(-100, 10, 8)).toBe(0);
    expect(mapChunkIndexByProgress(999, 10, 8)).toBe(7);
  });

  it('is monotonic across increasing source indices', () => {
    for (let fromLength = 1; fromLength <= 30; fromLength++) {
      for (let toLength = 1; toLength <= 30; toLength++) {
        let previous = -1;
        for (let sourceIndex = 0; sourceIndex < fromLength; sourceIndex++) {
          const mapped = mapChunkIndexByProgress(sourceIndex, fromLength, toLength);
          expect(mapped).toBeGreaterThanOrEqual(previous);
          expect(mapped).toBeGreaterThanOrEqual(0);
          expect(mapped).toBeLessThan(toLength);
          previous = mapped;
        }
      }
    }
  });
});
