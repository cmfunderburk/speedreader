import { describe, expect, it } from 'vitest';
import {
  getActiveWpmActivity,
  getHeaderBackAction,
  getHeaderTitle,
  isActiveView,
  planContentBrowserArticleSelection,
  resolveContinueSessionInfo,
  shouldShowBackButton,
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
    expect(isActiveView({
      screen: 'active-comprehension',
      article: makeArticle('c1'),
      entryPoint: 'launcher',
      comprehension: {
        runMode: 'quick-check',
        sourceArticleIds: ['c1'],
      },
    })).toBe(false);
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
    expect(getHeaderTitle({
      screen: 'active-comprehension',
      article: makeArticle('c2'),
      entryPoint: 'post-reading',
      comprehension: {
        runMode: 'quick-check',
        sourceArticleIds: ['c2'],
      },
    })).toBe('Comprehension Check');
    expect(getHeaderTitle({ screen: 'content-browser', activity: 'training' })).toBe('Training');
    expect(getHeaderTitle({ screen: 'content-browser', activity: 'comprehension-check' })).toBe('Comprehension Check');
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
    expect(planContentBrowserArticleSelection('comprehension-check', article)).toEqual({
      screen: 'active-comprehension',
      article,
      entryPoint: 'launcher',
      comprehension: {
        runMode: 'quick-check',
        sourceArticleIds: [article.id],
      },
    });
    expect(planContentBrowserArticleSelection('paced-reading', article)).toEqual({
      screen: 'preview',
      activity: 'paced-reading',
      article,
    });
  });

  it('resolves continue-session info from last session and article set', () => {
    const a1 = makeArticle('a1');
    const a2 = makeArticle('a2');
    expect(resolveContinueSessionInfo(
      { articleId: 'a2', activity: 'active-recall', displayMode: 'prediction' },
      [a1, a2]
    )).toEqual({
      article: a2,
      activity: 'active-recall',
      displayMode: 'prediction',
    });

    expect(resolveContinueSessionInfo(
      { articleId: 'missing', activity: 'paced-reading', displayMode: 'saccade' },
      [a1]
    )).toBeNull();
    expect(resolveContinueSessionInfo(undefined, [a1])).toBeNull();
  });

  it('computes header back visibility and action', () => {
    expect(shouldShowBackButton({ screen: 'home' })).toBe(false);
    expect(shouldShowBackButton({ screen: 'settings' })).toBe(true);

    expect(getHeaderBackAction({ screen: 'active-exercise' })).toBe('close-active-exercise');
    expect(getHeaderBackAction({
      screen: 'active-comprehension',
      article: makeArticle('c3'),
      entryPoint: 'launcher',
      comprehension: {
        runMode: 'quick-check',
        sourceArticleIds: ['c3'],
      },
    })).toBe('close-active-comprehension');
    expect(getHeaderBackAction({ screen: 'active-reader' })).toBe('go-home');
  });
});
