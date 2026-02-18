import type { GenerationDifficulty } from '../types';
import { FUNCTION_WORDS } from './tokenizer';

interface MaskProfile {
  maxMaskRatio: number;
}

interface TokenInfo {
  raw: string;
  start: number;
  end: number;
  sentenceInitial: boolean;
}

interface CoreParts {
  leading: string;
  core: string;
  trailing: string;
}

interface MaskContext {
  tokenIndex: number;
  partsByTokenIndex: Map<number, CoreParts>;
  titleCaseLine: boolean;
}

const HYPHEN_SEPARATOR_REGEX = /[-\u2010\u2011\u2012\u2013\u2014]/;
const HYPHEN_SPLIT_REGEX = /([-\u2010\u2011\u2012\u2013\u2014]+)/;

const DIFFICULTY_PROFILES: Record<GenerationDifficulty, MaskProfile> = {
  normal: { maxMaskRatio: 0.25 },
  hard: { maxMaskRatio: 0.4 },
};

function hashToUnitInterval(input: string): number {
  // FNV-1a 32-bit hash
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) & 0xffffffff) / 0x100000000;
}

function splitCoreParts(token: string): CoreParts | null {
  const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9'’-]*)([^A-Za-z0-9]*)$/);
  if (!match) return null;
  return {
    leading: match[1],
    core: match[2],
    trailing: match[3],
  };
}

function isSentenceBoundaryToken(token: string): boolean {
  return /[.!?]["')\]]*$/.test(token);
}

function extractTokens(lineText: string): TokenInfo[] {
  const regex = /\S+/g;
  const tokens: TokenInfo[] = [];
  let match;
  let sentenceInitial = true;

  while ((match = regex.exec(lineText)) !== null) {
    const raw = match[0];
    tokens.push({
      raw,
      start: match.index,
      end: match.index + raw.length,
      sentenceInitial,
    });
    sentenceInitial = isSentenceBoundaryToken(raw);
  }

  return tokens;
}

function isAcronym(core: string): boolean {
  const normalized = core.replace(/[^A-Za-z0-9]/g, '');
  return /^[A-Z]{2,}$/.test(normalized);
}

function normalizeAlpha(core: string): string {
  return core.toLowerCase().replace(/[^a-z]/g, '');
}

function isSimpleTitleCase(core: string): boolean {
  return /^[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)*$/.test(core);
}

function isInternalCapWord(core: string): boolean {
  return /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(core);
}

function isNameLikeTitleWord(core: string): boolean {
  if (!isSimpleTitleCase(core)) return false;
  const alphaOnly = normalizeAlpha(core);
  if (alphaOnly.length < 3) return false;
  if (FUNCTION_WORDS.has(alphaOnly)) return false;
  return true;
}

function hasAdjacentNameLikeTitleWord(tokenIndex: number, partsByTokenIndex: Map<number, CoreParts>): boolean {
  const prev = partsByTokenIndex.get(tokenIndex - 1);
  if (prev && isNameLikeTitleWord(prev.core)) return true;
  const next = partsByTokenIndex.get(tokenIndex + 1);
  if (next && isNameLikeTitleWord(next.core)) return true;
  return false;
}

function isLikelyTitleCaseLine(tokens: TokenInfo[], partsByTokenIndex: Map<number, CoreParts>): boolean {
  let alphaTokenCount = 0;
  let titleCaseCount = 0;

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const parts = partsByTokenIndex.get(tokenIndex);
    if (!parts) continue;
    const alphaOnly = normalizeAlpha(parts.core);
    if (alphaOnly.length === 0) continue;

    alphaTokenCount += 1;
    if (isSimpleTitleCase(parts.core) || isInternalCapWord(parts.core) || isAcronym(parts.core)) {
      titleCaseCount += 1;
    }
  }

  if (alphaTokenCount < 3) return false;
  return (titleCaseCount / alphaTokenCount) >= 0.65;
}

function isProperNoun(core: string, sentenceInitial: boolean, context: MaskContext): boolean {
  if (isInternalCapWord(core)) return true;
  if (sentenceInitial) return false;
  if (!isSimpleTitleCase(core)) return false;

  if (!context.titleCaseLine) {
    return true;
  }

  // In heading/title-case lines, only preserve likely multi-word names.
  return hasAdjacentNameLikeTitleWord(context.tokenIndex, context.partsByTokenIndex);
}

function isMaskEligible(core: string, sentenceInitial: boolean, context: MaskContext): boolean {
  if (/\d/.test(core)) return false;
  if (isAcronym(core)) return false;
  if (isProperNoun(core, sentenceInitial, context)) return false;

  const alphaOnly = normalizeAlpha(core);
  if (alphaOnly.length === 0) return false;
  if (FUNCTION_WORDS.has(alphaOnly)) return false;

  return true;
}

function maskSingleCoreWord(core: string, maxMaskRatio: number, seed: string): string {
  const letters: number[] = [];
  for (let i = 0; i < core.length; i++) {
    if (/[A-Za-z]/.test(core[i])) letters.push(i);
  }
  if (letters.length <= 1) return core;

  const first = letters[0];
  const last = letters[letters.length - 1];
  const maskCandidates = letters.filter((idx) => idx !== first && idx !== last);
  if (maskCandidates.length === 0) return core;

  const maxMaskCount = Math.max(1, Math.floor(letters.length * maxMaskRatio));
  const maskCount = Math.min(maskCandidates.length, maxMaskCount);
  if (maskCount <= 0) return core;

  const maskSet = selectNonConsecutiveIndices(maskCandidates, maskCount, seed);
  if (maskSet.size === 0) return core;

  const chars = [...core];
  for (const letterIndex of letters) {
    if (!maskSet.has(letterIndex)) continue;
    chars[letterIndex] = '_';
  }

  return chars.join('');
}

function maskCoreWord(core: string, maxMaskRatio: number, seed: string): string {
  if (!HYPHEN_SEPARATOR_REGEX.test(core)) {
    return maskSingleCoreWord(core, maxMaskRatio, seed);
  }

  const segments = core.split(HYPHEN_SPLIT_REGEX);
  return segments
    .map((segment, segmentIndex) => {
      if (segmentIndex % 2 === 1) return segment;
      return maskSingleCoreWord(segment, maxMaskRatio, `${seed}|seg:${segmentIndex}`);
    })
    .join('');
}

function selectNonConsecutiveIndices(candidates: number[], desiredCount: number, seed: string): Set<number> {
  if (candidates.length === 0 || desiredCount <= 0) return new Set();

  const sorted = [...candidates].sort((a, b) => a - b);
  const scores = sorted.map((idx) => hashToUnitInterval(`${seed}|${idx}`));
  const n = sorted.length;
  const memo = new Map<string, number>();

  const getCost = (index: number, remaining: number, prevSelected: boolean): number => {
    if (remaining === 0) return 0;
    if (index >= n) return Number.POSITIVE_INFINITY;

    const key = `${index}|${remaining}|${prevSelected ? 1 : 0}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const skipCost = getCost(index + 1, remaining, false);
    let takeCost = Number.POSITIVE_INFINITY;
    const prevAdjacent = prevSelected && index > 0 && (sorted[index] - sorted[index - 1] === 1);
    if (!prevAdjacent) {
      const tailCost = getCost(index + 1, remaining - 1, true);
      if (Number.isFinite(tailCost)) {
        takeCost = scores[index] + tailCost;
      }
    }

    const best = Math.min(skipCost, takeCost);
    memo.set(key, best);
    return best;
  };

  let target = Math.min(desiredCount, n);
  while (target > 0 && !Number.isFinite(getCost(0, target, false))) {
    target -= 1;
  }
  if (target === 0) return new Set();

  const selected = new Set<number>();
  const rebuild = (index: number, remaining: number, prevSelected: boolean): void => {
    if (remaining === 0 || index >= n) return;

    const current = getCost(index, remaining, prevSelected);
    const skipCost = getCost(index + 1, remaining, false);
    const prevAdjacent = prevSelected && index > 0 && (sorted[index] - sorted[index - 1] === 1);
    let takeCost = Number.POSITIVE_INFINITY;
    if (!prevAdjacent) {
      const tailCost = getCost(index + 1, remaining - 1, true);
      if (Number.isFinite(tailCost)) {
        takeCost = scores[index] + tailCost;
      }
    }

    if (Number.isFinite(takeCost) && Math.abs(current - takeCost) <= 1e-12) {
      selected.add(sorted[index]);
      rebuild(index + 1, remaining - 1, true);
      return;
    }
    if (Number.isFinite(skipCost)) {
      rebuild(index + 1, remaining, false);
    }
  };

  rebuild(0, target, false);
  return selected;
}

export function maskGenerationLine(
  lineText: string,
  difficulty: GenerationDifficulty,
  seed: number,
  lineIndex: number
): string {
  if (!lineText.trim()) return lineText;

  const profile = DIFFICULTY_PROFILES[difficulty];
  const tokens = extractTokens(lineText);
  if (tokens.length === 0) return lineText;

  const partsByTokenIndex = new Map<number, CoreParts>();

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    const parts = splitCoreParts(token.raw);
    if (!parts) continue;
    partsByTokenIndex.set(tokenIndex, parts);
  }
  const titleCaseLine = isLikelyTitleCaseLine(tokens, partsByTokenIndex);

  let cursor = 0;
  let result = '';

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    result += lineText.slice(cursor, token.start);

    const parts = partsByTokenIndex.get(tokenIndex);
    if (!parts || !isMaskEligible(parts.core, token.sentenceInitial, { tokenIndex, partsByTokenIndex, titleCaseLine })) {
      result += token.raw;
      cursor = token.end;
      continue;
    }

    const maskedCore = maskCoreWord(
      parts.core,
      profile.maxMaskRatio,
      `${seed}|${lineIndex}|${tokenIndex}|${parts.core}`
    );
    result += `${parts.leading}${maskedCore}${parts.trailing}`;
    cursor = token.end;
  }

  result += lineText.slice(cursor);
  return result;
}
