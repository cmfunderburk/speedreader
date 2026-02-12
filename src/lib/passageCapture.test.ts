import { describe, expect, it } from 'vitest';
import {
  getContiguousNonBlankLineRange,
  normalizeCaptureLineText,
  planLastLinesCapture,
  planParagraphCapture,
  planSentenceCapture,
  type FlatSaccadeCaptureLine,
} from './passageCapture';

function makeLine(
  globalLineIndex: number,
  pageIndex: number,
  lineIndex: number,
  text: string,
  type: string = 'body'
): FlatSaccadeCaptureLine {
  return {
    globalLineIndex,
    pageIndex,
    lineIndex,
    text,
    type,
    chunkIndex: globalLineIndex,
  };
}

describe('passageCapture', () => {
  it('normalizes capture line text', () => {
    expect(normalizeCaptureLineText('  alpha   beta\tgamma  ')).toBe('alpha beta gamma');
  });

  it('finds contiguous non-blank line range around center', () => {
    const lines = [
      makeLine(0, 0, 0, 'First'),
      makeLine(1, 0, 1, 'Second'),
      makeLine(2, 0, 2, '', 'blank'),
      makeLine(3, 0, 3, 'Third'),
    ];

    expect(getContiguousNonBlankLineRange(lines, 1)).toEqual([0, 1]);
    expect(getContiguousNonBlankLineRange(lines, 3)).toEqual([3, 3]);
    expect(getContiguousNonBlankLineRange(lines, 2)).toBeNull();
  });

  it('plans paragraph capture from contiguous non-blank lines', () => {
    const lines = [
      makeLine(0, 0, 0, 'Alpha'),
      makeLine(1, 0, 1, 'Beta'),
      makeLine(2, 0, 2, '', 'blank'),
      makeLine(3, 0, 3, 'Gamma'),
    ];

    const selected = planParagraphCapture(lines, 1);
    expect(selected?.map((line) => line.text)).toEqual(['Alpha', 'Beta']);
  });

  it('plans sentence capture anchored to the current line', () => {
    const lines = [
      makeLine(0, 0, 0, 'First sentence ends here.'),
      makeLine(1, 0, 1, 'Second sentence starts and ends now.'),
      makeLine(2, 0, 2, '', 'blank'),
    ];

    const plan = planSentenceCapture(lines, 1);
    expect(plan).toMatchObject({
      sentenceText: 'Second sentence starts and ends now.',
    });
    expect(plan?.sentenceLines.map((line) => line.lineIndex)).toEqual([1]);
  });

  it('plans last-lines capture on the current page, skipping blanks and empty text', () => {
    const lines = [
      makeLine(0, 0, 0, 'Line A'),
      makeLine(1, 0, 1, '   '),
      makeLine(2, 0, 2, 'Line B'),
      makeLine(3, 0, 3, '', 'blank'),
      makeLine(4, 0, 4, 'Line C'),
      makeLine(5, 1, 0, 'Other page line'),
    ];

    const selected = planLastLinesCapture(lines, 4, 3);
    expect(selected.map((line) => line.text)).toEqual(['Line A', 'Line B', 'Line C']);
  });
});
