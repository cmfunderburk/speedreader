import { describe, it, expect } from 'vitest';
import { calculateDisplayTime, calculateRemainingTime, isBreakChunk, AVG_WORD_LENGTH } from './rsvp';
import type { Chunk } from '../types';

const DEFAULT_WPM = 400;
const MS_PER_WORD = 60000 / DEFAULT_WPM; // 150ms

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

describe('calculateDisplayTime — word mode (default)', () => {
  describe('word-based cadence', () => {
    it('uses ms-per-word as the baseline for single words', () => {
      const chunk = createChunk('river');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeCloseTo(MS_PER_WORD, 1);
    });

    it('longer words take more time than very short words', () => {
      const short = createChunk('go');
      const medium = createChunk('running');
      const long = createChunk('extraordinary');

      const shortTime = calculateDisplayTime(short, DEFAULT_WPM);
      const mediumTime = calculateDisplayTime(medium, DEFAULT_WPM);
      const longTime = calculateDisplayTime(long, DEFAULT_WPM);

      expect(mediumTime).toBeGreaterThan(shortTime);
      expect(longTime).toBeGreaterThan(mediumTime);
      expect(longTime / shortTime).toBeGreaterThan(1.2);
    });

    it('multi-word chunks land between single-word and sequential timing', () => {
      const single = createChunk('alpha');
      const twoWord = createChunk('alpha beta');
      const threeWord = createChunk('alpha beta gamma');

      const singleTime = calculateDisplayTime(single, DEFAULT_WPM);
      const doubleTime = calculateDisplayTime(twoWord, DEFAULT_WPM);
      const tripleTime = calculateDisplayTime(threeWord, DEFAULT_WPM);

      expect(doubleTime).toBeGreaterThan(singleTime);
      expect(doubleTime).toBeLessThan(singleTime * 2);
      expect(tripleTime).toBeGreaterThan(doubleTime);
      expect(tripleTime).toBeLessThan(singleTime * 3);
    });
  });

  describe('punctuation pauses', () => {
    it('adds 50% for sentence-ending punctuation (.)', () => {
      const chunk = createChunk('world.');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      const base = calculateDisplayTime(createChunk('world'), DEFAULT_WPM);
      expect(time / base).toBeCloseTo(1.5, 1);
    });

    it('adds 50% for question marks', () => {
      const chunk = createChunk('why?');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      const base = calculateDisplayTime(createChunk('why'), DEFAULT_WPM);
      expect(time / base).toBeCloseTo(1.5, 1);
    });

    it('adds 50% for exclamation marks', () => {
      const chunk = createChunk('wow!');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      const base = calculateDisplayTime(createChunk('wow'), DEFAULT_WPM);
      expect(time / base).toBeCloseTo(1.5, 1);
    });

    it('adds 25% for comma', () => {
      const chunk = createChunk('however,');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      const base = calculateDisplayTime(createChunk('however'), DEFAULT_WPM);
      expect(time / base).toBeCloseTo(1.25, 1);
    });

    it('adds 25% for semicolon', () => {
      const chunk = createChunk('done;');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      const base = calculateDisplayTime(createChunk('done'), DEFAULT_WPM);
      expect(time / base).toBeCloseTo(1.25, 1);
    });

    it('no bonus for mid-chunk punctuation in word mode', () => {
      const chunk = createChunk("don't stop");
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      // Apostrophe doesn't match end-of-chunk punctuation patterns
      const base = calculateDisplayTime(createChunk("dont stop"), DEFAULT_WPM);
      expect(time).toBeCloseTo(base, 1);
    });
  });

  describe('minimum display time', () => {
    it('enforces 80ms minimum for very short chunks', () => {
      const chunk = createChunk('I');
      const time = calculateDisplayTime(chunk, 2000); // extremely fast WPM to hit clamp

      expect(time).toBe(80);
    });

    it('does not clamp longer chunks', () => {
      const chunk = createChunk('hello');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM);

      expect(time).toBeGreaterThan(80);
      expect(time).toBeCloseTo(MS_PER_WORD, 1);
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

describe('calculateDisplayTime — custom mode (char-proportional)', () => {
  describe('character-proportional base timing', () => {
    it('time scales linearly with lexical character count', () => {
      const short = createChunk('the');       // 3 chars
      const long = createChunk('wonderful');  // 9 chars

      const shortTime = calculateDisplayTime(short, DEFAULT_WPM, 'custom');
      const longTime = calculateDisplayTime(long, DEFAULT_WPM, 'custom');

      // Ratio should approximate the ratio of char counts (9/3 = 3.0)
      expect(longTime / shortTime).toBeCloseTo(9 / 3, 1);
    });

    it('a 4.8-char word (AVG_WORD_LENGTH) gets exactly msPerWord', () => {
      // "river" = 5 chars, close to 4.8
      const chunk = createChunk('river');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM, 'custom');
      const expected = (5 / AVG_WORD_LENGTH) * MS_PER_WORD;

      expect(time).toBeCloseTo(expected, 1);
    });

    it('WPM consistency: wider span at same WPM has proportionally longer display', () => {
      const narrow = createChunk('alpha');              // 5 lexical
      const wide = createChunk('alpha beta gamma');     // 14 lexical (no spaces)

      const narrowTime = calculateDisplayTime(narrow, DEFAULT_WPM, 'custom');
      const wideTime = calculateDisplayTime(wide, DEFAULT_WPM, 'custom');

      // Lexical chars: narrow=5, wide=14 → ratio ~2.8
      const narrowChars = 5;
      const wideChars = 14;
      expect(wideTime / narrowTime).toBeCloseTo(wideChars / narrowChars, 0);
    });

    it('spaces and punctuation do not count toward lexical chars', () => {
      const plain = createChunk('hello world');  // 10 lexical
      const puncy = createChunk('hello, world'); // still 10 lexical

      const plainTime = calculateDisplayTime(plain, DEFAULT_WPM, 'custom');
      const puncyTime = calculateDisplayTime(puncy, DEFAULT_WPM, 'custom');

      // puncy has a minor punct occurrence so it should be slightly longer
      expect(puncyTime).toBeGreaterThan(plainTime);
      // But the base portion (from lexical chars) should be equal
      const baseExpected = (10 / AVG_WORD_LENGTH) * MS_PER_WORD;
      // puncyTime = baseExpected + 1 minor punct bonus
      const minorBonus = MS_PER_WORD * 0.25;
      expect(puncyTime).toBeCloseTo(baseExpected + minorBonus, 1);
    });
  });

  describe('per-occurrence punctuation pauses', () => {
    it('each period adds 0.5 × msPerWord', () => {
      const chunk = createChunk('end.');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM, 'custom');

      const lexChars = 3; // "end"
      const base = (lexChars / AVG_WORD_LENGTH) * MS_PER_WORD;
      const bonus = MS_PER_WORD * 0.5; // 1 major punct
      expect(time).toBeCloseTo(base + bonus, 1);
    });

    it('multiple punctuation marks each contribute independently', () => {
      // "Wait. What? No!" has 3 major punct marks
      const chunk = createChunk('Wait. What? No!');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM, 'custom');

      const lexChars = 'WaitWhatNo'.length; // 10
      const base = (lexChars / AVG_WORD_LENGTH) * MS_PER_WORD;
      const bonus = 3 * MS_PER_WORD * 0.5; // 3 major punct
      expect(time).toBeCloseTo(base + bonus, 1);
    });

    it('commas add 0.25 × msPerWord each', () => {
      // "red, blue, green" has 2 commas
      const chunk = createChunk('red, blue, green');
      const time = calculateDisplayTime(chunk, DEFAULT_WPM, 'custom');

      const lexChars = 'redbluegreen'.length; // 12
      const base = (lexChars / AVG_WORD_LENGTH) * MS_PER_WORD;
      const bonus = 2 * MS_PER_WORD * 0.25; // 2 minor punct
      expect(time).toBeCloseTo(base + bonus, 1);
    });

    it('mid-chunk punctuation gets counted (unlike word mode)', () => {
      // In word mode, only end-of-chunk punct matters.
      // In custom mode, the period in "Mr. Smith" counts.
      const chunk = createChunk('Mr. Smith');
      const timeCustom = calculateDisplayTime(chunk, DEFAULT_WPM, 'custom');

      const lexChars = 'MrSmith'.length; // 7
      const base = (lexChars / AVG_WORD_LENGTH) * MS_PER_WORD;
      const bonus = MS_PER_WORD * 0.5; // 1 major punct
      expect(timeCustom).toBeCloseTo(base + bonus, 1);
    });
  });

  describe('WPM scaling', () => {
    it('doubling WPM halves display time', () => {
      const chunk = createChunk('testing');

      const time400 = calculateDisplayTime(chunk, 400, 'custom');
      const time800 = calculateDisplayTime(chunk, 800, 'custom');

      expect(time400).toBeCloseTo(time800 * 2, 5);
    });
  });

  describe('minimum display time', () => {
    it('enforces 80ms minimum', () => {
      const chunk = createChunk('I');
      const time = calculateDisplayTime(chunk, 2000, 'custom');

      expect(time).toBe(80);
    });
  });

  describe('break chunks use same timing regardless of mode', () => {
    it('break chunk in custom mode gets 2-word pause', () => {
      const breakChunk = createBreakChunk();
      const time = calculateDisplayTime(breakChunk, DEFAULT_WPM, 'custom');

      expect(time).toBeCloseTo(2 * MS_PER_WORD, 5);
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

    expect(endTime / midTime).toBeCloseTo(1.5, 1);
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

  it('uses custom mode timing when mode is custom', () => {
    const chunks = [
      createChunk('one'),
      createChunk('two'),
      createChunk('three'),
    ];

    const wordRemaining = calculateRemainingTime(chunks, 1, DEFAULT_WPM, 'word');
    const customRemaining = calculateRemainingTime(chunks, 1, DEFAULT_WPM, 'custom');

    // They should differ because the models are different
    expect(wordRemaining).not.toBeCloseTo(customRemaining, 1);
  });
});
