import { describe, expect, it } from 'vitest';
import { appViewStateReducer, getInitialViewState, viewStateToAction } from './appViewState';
import type { ViewAction, ViewState } from './appViewState';
import type { Article } from '../types';

function makeArticle(id: string): Article {
  return {
    id,
    title: `Article ${id}`,
    content: 'Sample content',
    source: 'test',
    addedAt: 1,
    readPosition: 0,
    isRead: false,
  };
}

describe('appViewState', () => {
  it('initializes home screen without import query', () => {
    expect(getInitialViewState('?import=1')).toEqual({ screen: 'home' });
    expect(getInitialViewState('?foo=bar')).toEqual({ screen: 'home' });
    expect(getInitialViewState('')).toEqual({ screen: 'home' });
  });

  it('reduces each action to expected view state', () => {
    const article = makeArticle('a1');
    const start: ViewState = { screen: 'home' };
    const cases: Array<{ action: ViewAction; expected: ViewState }> = [
      { action: { type: 'go-home' }, expected: { screen: 'home' } },
      { action: { type: 'open-content-browser', activity: 'paced-reading' }, expected: { screen: 'content-browser', activity: 'paced-reading' } },
      { action: { type: 'open-preview', activity: 'active-recall', article }, expected: { screen: 'preview', activity: 'active-recall', article } },
      { action: { type: 'open-active-reader' }, expected: { screen: 'active-reader' } },
      { action: { type: 'open-active-exercise' }, expected: { screen: 'active-exercise' } },
      {
        action: {
          type: 'open-active-comprehension',
          article,
          entryPoint: 'launcher',
          comprehension: {
            runMode: 'quick-check',
            sourceArticleIds: [article.id],
          },
        },
        expected: {
          screen: 'active-comprehension',
          article,
          entryPoint: 'launcher',
          comprehension: {
            runMode: 'quick-check',
            sourceArticleIds: ['a1'],
          },
        },
      },
      { action: { type: 'open-active-training', article }, expected: { screen: 'active-training', article } },
      { action: { type: 'open-active-training' }, expected: { screen: 'active-training' } },
      { action: { type: 'open-settings' }, expected: { screen: 'settings' } },
      { action: { type: 'open-library-settings' }, expected: { screen: 'library-settings' } },
      { action: { type: 'open-add' }, expected: { screen: 'add' } },
    ];

    for (const testCase of cases) {
      expect(appViewStateReducer(start, testCase.action)).toEqual(testCase.expected);
    }
  });

  it('maps view states to actions and round-trips through reducer', () => {
    const article = makeArticle('a2');
    const states: ViewState[] = [
      { screen: 'home' },
      { screen: 'content-browser', activity: 'training' },
      { screen: 'preview', activity: 'paced-reading', article },
      { screen: 'active-reader' },
      { screen: 'active-exercise' },
      {
        screen: 'active-comprehension',
        article,
        entryPoint: 'post-reading',
        comprehension: {
          runMode: 'quick-check',
          sourceArticleIds: [article.id],
        },
      },
      { screen: 'active-training', article },
      { screen: 'settings' },
      { screen: 'library-settings' },
      { screen: 'add' },
    ];

    for (const state of states) {
      const action = viewStateToAction(state);
      expect(appViewStateReducer({ screen: 'home' }, action)).toEqual(state);
    }
  });
});
