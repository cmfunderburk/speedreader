function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Map an index from one tokenized sequence length to another while preserving
 * approximate progress through the source sequence.
 */
export function mapChunkIndexByProgress(currentIndex: number, fromLength: number, toLength: number): number {
  if (toLength <= 0) return 0;
  if (fromLength <= 0) return 0;

  const safeSourceIndex = clamp(currentIndex, 0, fromLength);
  const normalized = safeSourceIndex / fromLength;
  const mapped = Math.floor(normalized * toLength);
  return clamp(mapped, 0, toLength - 1);
}
