import { describe, expect, it } from 'vitest';
import {
  getActiveWpmActivity,
  getHeaderTitle,
  isActiveView,
  planContentBrowserArticleSelection,
} from './appViewSelectors';
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

describe('appViewSelectors', () => {
  it('identifies active views and active WPM activity', () => {
    expect(isActiveView({ screen: 'active-reader' })).toBe(true);
    expect(isActiveView({ screen: 'active-exercise' })).toBe(true);
    expect(isActiveView({ screen: 'active-training' })).toBe(true);
    expect(isActiveView({ screen: 'home' })).toBe(false);

    expect(getActiveWpmActivity({ screen: 'active-reader' })).toBe('paced-reading');
    expect(getActiveWpmActivity({ screen: 'active-exercise' })).toBe('active-recall');
    expect(getActiveWpmActivity({ screen: 'active-training' })).toBe('training');
    expect(getActiveWpmActivity({ screen: 'home' })).toBeNull();
  });

  it('computes header title from view state', () => {
    expect(getHeaderTitle({ screen: 'home' })).toBe('Reader');
    expect(getHeaderTitle({ screen: 'active-reader' })).toBe('Paced Reading');
    expect(getHeaderTitle({ screen: 'active-exercise' })).toBe('Active Recall');
    expect(getHeaderTitle({ screen: 'active-training' })).toBe('Training');
    expect(getHeaderTitle({ screen: 'content-browser', activity: 'training' })).toBe('Training');
    expect(getHeaderTitle({ screen: 'preview', activity: 'active-recall', article: makeArticle('h1') })).toBe('Active Recall');
    expect(getHeaderTitle({ screen: 'settings' })).toBe('Settings');
    expect(getHeaderTitle({ screen: 'library-settings' })).toBe('Library Settings');
  });

  it('plans content-browser article selection transitions', () => {
    const article = makeArticle('a1');
    expect(planContentBrowserArticleSelection('training', article)).toEqual({
      screen: 'active-training',
      article,
    });
    expect(planContentBrowserArticleSelection('paced-reading', article)).toEqual({
      screen: 'preview',
      activity: 'paced-reading',
      article,
    });
  });
});
