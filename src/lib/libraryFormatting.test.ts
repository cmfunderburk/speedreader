import { describe, expect, it } from 'vitest';
import { formatBookName } from './libraryFormatting';

describe('libraryFormatting', () => {
  it('formats kebab and snake case names for display', () => {
    expect(formatBookName('a-study-in-scarlet')).toBe('A Study In Scarlet');
    expect(formatBookName('war_and_peace')).toBe('War And Peace');
  });
});
