import { describe, it, expect } from 'vitest';
import { calculateDisplayTime, calculateRemainingTime, isBreakChunk, AVG_WORD_LENGTH } from './rsvp';
import type { Chunk } from '../types';

const DEFAULT_WPM = 400;
const CHARS_PER_MINUTE = DEFAULT_WPM * AVG_WORD_LENGTH; // 1920
const MS_PER_CHAR = 60000 / CHARS_PER_MINUTE; // ~31.25ms

function createChunk(text: string): Chunk {
  const isMultiWord = text.includes(' ');
  return {
    text,
    wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
    orpIndex: isMultiWord ? Math.floor(text.length / 2) : Math.floor(text.length * 0.35),
  };
}

function createBreakChunk(): Chunk {
  return {
    text: '· · ·',
    wordCount: 0,
    orpIndex: 2,
  };
}

function nonSpaceChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

describe('calculateDisplayTime', () => {
  describe('character-based timing', () => {
    it('scales with character count, not word count', () => {
      const shortWord = createChunk('I');              // 1 char
      const longWord = createChunk('responsibilities'); // 16 chars

      const shortTime = calculateDisplayTime(shortWord, DEFAULT_WPM);
      const longTime = calculateDisplayTime(longWord, DEFAULT_WPM);

      expect(longTime).toBeGreaterThan(shortTime);
      expect(longTime).toBeCloseTo(16 * MS_PER_CHAR, 1);
    });

    it('average-length word (~5 chars) takes ~156ms at 400 WPM', () => {
      const chunk = createChunk('hello'); // 5 chars
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(5 * MS_PER_CHAR, 1);
    });

    it('multi-word chunk uses total non-space character count', () => {
      const chunk = createChunk('the quick brown'); // 13 non-space chars
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(nonSpaceChars('the quick brown') * MS_PER_CHAR, 1);
    });

    it('spaces do not contribute to display time', () => {
      // Both have the same non-space chars but different spacing
      const a = createChunk('ab cd');
      const b = createChunk('abcd');
      // b has wordCount 1, a has wordCount 2, but timing should be same
      // (both 4 non-space chars, neither ends with punctuation)
      expect(calculateDisplayTime(a, DEFAULT_WPM))
        .toBeCloseTo(calculateDisplayTime(b, DEFAULT_WPM), 1);
    });
  });

  describe('punctuation pauses', () => {
    it('adds 50% for sentence-ending punctuation (.)', () => {
      const chunk = createChunk('world.');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(nonSpaceChars('world.') * MS_PER_CHAR * 1.5, 1);
    });

    it('adds 50% for question marks', () => {
      const chunk = createChunk('why?');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(nonSpaceChars('why?') * MS_PER_CHAR * 1.5, 1);
    });

    it('adds 50% for exclamation marks', () => {
      const chunk = createChunk('wow!');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(nonSpaceChars('wow!') * MS_PER_CHAR * 1.5, 1);
    });

    it('adds 25% for comma', () => {
      const chunk = createChunk('however,');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(nonSpaceChars('however,') * MS_PER_CHAR * 1.25, 1);
    });

    it('adds 25% for semicolon', () => {
      const chunk = createChunk('done;');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(nonSpaceChars('done;') * MS_PER_CHAR * 1.25, 1);
    });

    it('no bonus for mid-chunk punctuation', () => {
      const chunk = createChunk("don't stop");
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      // Apostrophe doesn't match end-of-chunk punctuation patterns
      expect(time).toBeCloseTo(nonSpaceChars("don't stop") * MS_PER_CHAR, 1);
    });
  });

  describe('minimum display time', () => {
    it('enforces 80ms minimum for very short chunks', () => {
      const chunk = createChunk('I'); // 1 char → ~31ms unclamped
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBe(80);
    });

    it('does not clamp longer chunks', () => {
      const chunk = createChunk('hello'); // 5 chars → ~156ms
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeGreaterThan(80);
      expect(time).toBeCloseTo(5 * MS_PER_CHAR, 1);
    });
  });

  describe('WPM scaling', () => {
    it('doubling WPM halves display time', () => {
      const chunk = createChunk('testing');

      const time400 = calculateDisplayTime(chunk, 400);
      const time800 = calculateDisplayTime(chunk, 800);

      expect(time400).toBeCloseTo(time800 * 2, 5);
    });

    it('600 WPM is 2x faster than 300 WPM', () => {
      const chunk = createChunk('sample text');

      const time300 = calculateDisplayTime(chunk, 300);
      const time600 = calculateDisplayTime(chunk, 600);

      expect(time300 / time600).toBeCloseTo(2, 5);
    });
  });

  describe('break chunks', () => {
    it('break chunks get a 2-word pause', () => {
      const breakChunk = createBreakChunk();
      const time = calculateDisplayTime(breakChunk, DEFAULT_WPM);

      const msPerWord = 60000 / DEFAULT_WPM; // 150ms
      expect(time).toBeCloseTo(2 * msPerWord, 5);
    });

    it('isBreakChunk correctly identifies break markers', () => {
      expect(isBreakChunk(createBreakChunk())).toBe(true);
      expect(isBreakChunk(createChunk('hello'))).toBe(false);
    });
  });
});

describe('pacing proportionality', () => {
  it('long words take proportionally longer than short words', () => {
    const short = createChunk('go');           // 2 chars
    const medium = createChunk('running');      // 7 chars
    const long = createChunk('understanding'); // 13 chars

    const shortTime = calculateDisplayTime(short, DEFAULT_WPM);
    const mediumTime = calculateDisplayTime(medium, DEFAULT_WPM);
    const longTime = calculateDisplayTime(long, DEFAULT_WPM);

    expect(mediumTime).toBeGreaterThan(shortTime);
    expect(longTime).toBeGreaterThan(mediumTime);
  });

  it('sentence endings create natural pauses', () => {
    const midSentence = createChunk('the');
    const endSentence = createChunk('end.');

    const midTime = calculateDisplayTime(midSentence, DEFAULT_WPM);
    const endTime = calculateDisplayTime(endSentence, DEFAULT_WPM);

    // "end." (4 chars * 1.5x) should be much longer than "the" (3 chars * 1x)
    expect(endTime / midTime).toBeGreaterThan(1.5);
  });
});

describe('calculateRemainingTime', () => {
  it('calculates total time for remaining chunks', () => {
    const chunks = [
      createChunk('one'),
      createChunk('two'),
      createChunk('three'),
      createChunk('four'),
    ];

    const remaining = calculateRemainingTime(chunks, 2, DEFAULT_WPM);
    const expected = calculateDisplayTime(chunks[2], DEFAULT_WPM) +
                     calculateDisplayTime(chunks[3], DEFAULT_WPM);

    expect(remaining).toBeCloseTo(expected, 5);
  });

  it('returns 0 when at end of chunks', () => {
    const chunks = [createChunk('one'), createChunk('two')];
    expect(calculateRemainingTime(chunks, 2, DEFAULT_WPM)).toBe(0);
  });
});
