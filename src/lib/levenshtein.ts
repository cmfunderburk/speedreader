/**
 * Calculate Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Damerau-Levenshtein distance (optimal string alignment variant).
 * Like Levenshtein but treats adjacent transpositions as a single edit.
 * "difficluty" → "difficulty" = 1 (transposition), not 2 (two substitutions).
 */
export function damerauLevenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  const d: number[][] = [];

  for (let i = 0; i <= lenA; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= lenB; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,         // deletion
        d[i][j - 1] + 1,         // insertion
        d[i - 1][j - 1] + cost   // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposition
      }
    }
  }

  return d[lenA][lenB];
}

/**
 * Strip punctuation from word for comparison.
 * "dog." -> "dog", "it's" -> "its"
 */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Calculate normalized loss (0-1) between predicted and actual words.
 * 0 = perfect match, 1 = completely different
 * Uses normalizeWord() for comparison (case-insensitive, punctuation-stripped).
 */
export function normalizedLoss(predicted: string, actual: string): number {
  const pred = normalizeWord(predicted);
  const act = normalizeWord(actual);

  if (pred === act) return 0;
  if (pred.length === 0 || act.length === 0) return 1;

  const distance = levenshteinDistance(pred, act);
  const maxLen = Math.max(pred.length, act.length);

  return distance / maxLen;
}

/**
 * Check if prediction is "correct" (exact match after normalization).
 */
export function isExactMatch(predicted: string, actual: string): boolean {
  return normalizeWord(predicted) === normalizeWord(actual);
}

/**
 * Binary "did you know this word?" check with typo tolerance.
 * Uses Damerau-Levenshtein so transpositions cost 1 edit.
 * Threshold scales with word length: ≤1 for short words, ≤2 for ≥8 chars.
 */
export function isWordKnown(predicted: string, actual: string): boolean {
  const pred = normalizeWord(predicted);
  const act = normalizeWord(actual);

  if (pred === act) return true;
  if (pred.length === 0 || act.length === 0) return false;

  const distance = damerauLevenshteinDistance(pred, act);
  const threshold = act.length >= 8 ? 2 : 1;
  return distance <= threshold;
}

/**
 * Derive display percentages from prediction stats.
 */
export function predictionScorePercents(stats: { totalWords: number; exactMatches: number; knownWords: number }): {
  exactPercent: number;
  knownPercent: number;
} {
  const exactPercent = stats.totalWords > 0
    ? Math.round((stats.exactMatches / stats.totalWords) * 100)
    : 0;
  const knownPercent = stats.totalWords > 0
    ? Math.round((stats.knownWords / stats.totalWords) * 100)
    : 100;
  return { exactPercent, knownPercent };
}
