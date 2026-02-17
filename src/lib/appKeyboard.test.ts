import { describe, expect, it } from 'vitest';
import { planEscapeAction } from './appKeyboard';
import type { Article } from '../types';

function makeArticle(id: string): Article {
  return {
    id,
    title: `Article ${id}`,
    content: 'Sample',
    source: 'test',
    addedAt: 1,
    readPosition: 0,
    isRead: false,
  };
}

describe('appKeyboard', () => {
  it('returns none on home', () => {
    expect(planEscapeAction({ screen: 'home' })).toBe('none');
  });

  it('returns close-active-exercise on active exercise', () => {
    expect(planEscapeAction({ screen: 'active-exercise' })).toBe('close-active-exercise');
  });

  it('returns close-active-comprehension on active comprehension', () => {
    const article = makeArticle('c1');
    expect(planEscapeAction({
      screen: 'active-comprehension',
      article,
      entryPoint: 'launcher',
      comprehension: {
        runMode: 'quick-check',
        sourceArticleIds: [article.id],
      },
    })).toBe('close-active-comprehension');
  });

  it('returns go-home for all other screens', () => {
    const article = makeArticle('a1');
    expect(planEscapeAction({ screen: 'content-browser', activity: 'training' })).toBe('go-home');
    expect(planEscapeAction({ screen: 'preview', activity: 'paced-reading', article })).toBe('go-home');
    expect(planEscapeAction({ screen: 'active-reader' })).toBe('go-home');
    expect(planEscapeAction({ screen: 'active-training', article })).toBe('go-home');
    expect(planEscapeAction({ screen: 'settings' })).toBe('go-home');
    expect(planEscapeAction({ screen: 'library-settings' })).toBe('go-home');
    expect(planEscapeAction({ screen: 'add' })).toBe('go-home');
  });
});
