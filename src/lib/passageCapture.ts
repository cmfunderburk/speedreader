import { isSentenceBoundaryChunk } from './predictionPreview';

export interface FlatSaccadeCaptureLine {
  globalLineIndex: number;
  pageIndex: number;
  lineIndex: number;
  type: string;
  text: string;
  chunkIndex?: number;
}

interface SentenceTokenMatch {
  text: string;
  start: number;
  end: number;
}

interface CaptureSentencePlan {
  sentenceText: string;
  sentenceLines: FlatSaccadeCaptureLine[];
}

interface CaptureSegment extends FlatSaccadeCaptureLine {
  start: number;
  end: number;
}

export function normalizeCaptureLineText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function getContiguousNonBlankLineRange(
  flatLines: FlatSaccadeCaptureLine[],
  centerGlobalLineIndex: number
): [number, number] | null {
  if (centerGlobalLineIndex < 0 || centerGlobalLineIndex >= flatLines.length) return null;
  const centerLine = flatLines[centerGlobalLineIndex];
  if (centerLine.type === 'blank') return null;

  let start = centerGlobalLineIndex;
  let end = centerGlobalLineIndex;
  while (start > 0 && flatLines[start - 1].type !== 'blank') {
    start -= 1;
  }
  while (end < flatLines.length - 1 && flatLines[end + 1].type !== 'blank') {
    end += 1;
  }
  return [start, end];
}

function buildSentenceTokenMatches(paragraphText: string): SentenceTokenMatch[] {
  return [...paragraphText.matchAll(/\S+/g)].map((match) => ({
    text: match[0],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function buildCaptureSegments(paragraphRefs: FlatSaccadeCaptureLine[]): CaptureSegment[] {
  let cursor = 0;
  return paragraphRefs.map((line) => {
    const text = normalizeCaptureLineText(line.text);
    const start = cursor;
    const end = start + text.length;
    cursor = end + 1;
    return { ...line, text, start, end };
  }).filter((line) => line.text.length > 0);
}

export function planSentenceCapture(
  flatLines: FlatSaccadeCaptureLine[],
  centerGlobalLineIndex: number
): CaptureSentencePlan | null {
  const paragraphRange = getContiguousNonBlankLineRange(flatLines, centerGlobalLineIndex);
  if (!paragraphRange) return null;

  const centerLine = flatLines[centerGlobalLineIndex];
  if (!centerLine) return null;

  const [paraStart, paraEnd] = paragraphRange;
  const paragraphRefs = flatLines.slice(paraStart, paraEnd + 1)
    .filter((line) => line.type !== 'blank');
  if (paragraphRefs.length === 0) return null;

  const segments = buildCaptureSegments(paragraphRefs);
  if (segments.length === 0) return null;

  const paragraphText = segments.map((line) => line.text).join(' ');
  const currentSegment = segments.find((line) =>
    line.pageIndex === centerLine.pageIndex && line.lineIndex === centerLine.lineIndex
  ) ?? segments[Math.floor(segments.length / 2)];
  const anchorChar = currentSegment.start + Math.max(0, Math.floor((currentSegment.end - currentSegment.start) / 2));

  const tokenMatches = buildSentenceTokenMatches(paragraphText);
  if (tokenMatches.length === 0) return null;

  let anchorTokenIndex = tokenMatches.findIndex((token) => anchorChar >= token.start && anchorChar < token.end);
  if (anchorTokenIndex < 0) {
    anchorTokenIndex = tokenMatches.findIndex((token) => token.start >= anchorChar);
    if (anchorTokenIndex < 0) anchorTokenIndex = tokenMatches.length - 1;
  }

  const sentenceChunks = tokenMatches.map((token) => ({
    text: token.text,
    wordCount: 1,
    orpIndex: 0,
  }));

  let sentenceStartTokenIndex = 0;
  for (let i = anchorTokenIndex - 1; i >= 0; i--) {
    if (isSentenceBoundaryChunk(sentenceChunks, i)) {
      sentenceStartTokenIndex = i + 1;
      break;
    }
  }

  let sentenceEndTokenIndex = tokenMatches.length - 1;
  for (let i = anchorTokenIndex; i < tokenMatches.length; i++) {
    if (isSentenceBoundaryChunk(sentenceChunks, i)) {
      sentenceEndTokenIndex = i;
      break;
    }
  }

  const sentenceStartChar = tokenMatches[sentenceStartTokenIndex].start;
  const sentenceEndChar = tokenMatches[sentenceEndTokenIndex].end;
  const sentenceText = paragraphText.slice(sentenceStartChar, sentenceEndChar).trim();
  const sentenceLines = segments
    .filter((line) => line.end > sentenceStartChar && line.start < sentenceEndChar)
    .map((line) => ({
      globalLineIndex: line.globalLineIndex,
      pageIndex: line.pageIndex,
      lineIndex: line.lineIndex,
      type: line.type,
      text: line.text,
      chunkIndex: line.chunkIndex,
    }));

  return { sentenceText, sentenceLines };
}

export function planParagraphCapture(
  flatLines: FlatSaccadeCaptureLine[],
  centerGlobalLineIndex: number
): FlatSaccadeCaptureLine[] | null {
  const paragraphRange = getContiguousNonBlankLineRange(flatLines, centerGlobalLineIndex);
  if (!paragraphRange) return null;
  const [start, end] = paragraphRange;
  return flatLines.slice(start, end + 1).filter((line) => line.type !== 'blank');
}

export function planLastLinesCapture(
  flatLines: FlatSaccadeCaptureLine[],
  centerGlobalLineIndex: number,
  lineCount: number
): FlatSaccadeCaptureLine[] {
  if (lineCount <= 0) return [];
  const centerLine = flatLines[centerGlobalLineIndex];
  if (!centerLine) return [];

  const selected: FlatSaccadeCaptureLine[] = [];
  for (let i = centerGlobalLineIndex; i >= 0 && selected.length < lineCount; i--) {
    const line = flatLines[i];
    if (line.pageIndex !== centerLine.pageIndex) break;
    if (line.type === 'blank') continue;
    if (normalizeCaptureLineText(line.text).length === 0) continue;
    selected.push(line);
  }

  return selected.reverse();
}
