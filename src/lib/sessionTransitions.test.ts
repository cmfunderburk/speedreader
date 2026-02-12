import { describe, expect, it } from 'vitest';
import {
  planCloseActiveExercise,
  planContinueSession,
  planFeaturedArticleLaunch,
  planStartReadingFromPreview,
} from './sessionTransitions';
import type { Article, SessionSnapshot } from '../types';

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

describe('sessionTransitions', () => {
  it('goes home without clearing snapshot when no reading snapshot exists', () => {
    expect(planCloseActiveExercise(null, [], 10)).toEqual({
      type: 'go-home',
      clearSnapshot: false,
    });

    const trainingOnly: SessionSnapshot = {
      training: { passageId: 'p1', mode: 'prediction', startedAt: 1 },
      updatedAt: 1,
    };
    expect(planCloseActiveExercise(trainingOnly, [], 10)).toEqual({
      type: 'go-home',
      clearSnapshot: false,
    });
  });

  it('goes home and clears snapshot when reading article no longer exists', () => {
    const snapshot: SessionSnapshot = {
      reading: { articleId: 'missing', chunkIndex: 42, displayMode: 'saccade' },
      updatedAt: 1,
    };
    expect(planCloseActiveExercise(snapshot, [], 10)).toEqual({
      type: 'go-home',
      clearSnapshot: true,
    });
  });

  it('resumes reading and updates snapshot transition metadata', () => {
    const article = makeArticle('a1');
    const snapshot: SessionSnapshot = {
      reading: { articleId: 'a1', chunkIndex: 12, displayMode: 'rsvp' },
      training: { passageId: 'p1', mode: 'recall', startedAt: 1 },
      lastTransition: 'read-to-recall',
      updatedAt: 1,
    };
    const plan = planCloseActiveExercise(snapshot, [article], 123);
    expect(plan).toEqual({
      type: 'resume-reading',
      plan: {
        article,
        displayMode: 'rsvp',
        chunkIndex: 12,
        snapshot: {
          reading: { articleId: 'a1', chunkIndex: 12, displayMode: 'rsvp' },
          training: undefined,
          lastTransition: 'return-to-reading',
          updatedAt: 123,
        },
      },
    });
  });

  it('normalizes non-reading display modes to saccade when resuming', () => {
    const article = makeArticle('a2');
    const snapshot: SessionSnapshot = {
      reading: { articleId: 'a2', chunkIndex: 7, displayMode: 'prediction' },
      updatedAt: 1,
    };
    const plan = planCloseActiveExercise(snapshot, [article], 55);
    expect(plan).toEqual({
      type: 'resume-reading',
      plan: {
        article,
        displayMode: 'saccade',
        chunkIndex: 7,
        snapshot: {
          reading: { articleId: 'a2', chunkIndex: 7, displayMode: 'prediction' },
          training: undefined,
          lastTransition: 'return-to-reading',
          updatedAt: 55,
        },
      },
    });
  });

  it('plans featured article launch into paced reading session', () => {
    const article = makeArticle('f1');
    expect(planFeaturedArticleLaunch(article)).toEqual({
      article,
      clearSnapshot: true,
      syncWpmActivity: 'paced-reading',
      loadOptions: { displayMode: 'saccade' },
      saveLastSession: {
        articleId: 'f1',
        activity: 'paced-reading',
        displayMode: 'saccade',
      },
      nextView: { screen: 'active-reader' },
      autoPlay: true,
    });
  });

  it('plans preview start transitions for paced reading and active recall', () => {
    const article = makeArticle('p1');
    expect(planStartReadingFromPreview('paced-reading', article, 'custom')).toEqual({
      article,
      clearSnapshot: true,
      syncWpmActivity: 'paced-reading',
      loadOptions: { displayMode: 'saccade', mode: 'custom' },
      saveLastSession: {
        articleId: 'p1',
        activity: 'paced-reading',
        displayMode: 'saccade',
      },
      nextView: { screen: 'active-reader' },
      autoPlay: true,
    });

    expect(planStartReadingFromPreview('active-recall', article, 'word')).toEqual({
      article,
      clearSnapshot: true,
      syncWpmActivity: 'active-recall',
      loadOptions: { displayMode: 'prediction' },
      saveLastSession: {
        articleId: 'p1',
        activity: 'active-recall',
        displayMode: 'prediction',
      },
      nextView: { screen: 'active-exercise' },
      autoPlay: false,
    });

    expect(planStartReadingFromPreview('training', article, 'word')).toBeNull();
  });

  it('plans continue-session transitions by activity', () => {
    const article = makeArticle('c1');
    expect(planContinueSession({ article, activity: 'paced-reading', displayMode: 'prediction' })).toEqual({
      article,
      clearSnapshot: true,
      syncWpmActivity: 'paced-reading',
      loadOptions: { displayMode: 'saccade' },
      saveLastSession: undefined,
      nextView: { screen: 'active-reader' },
      autoPlay: true,
    });

    expect(planContinueSession({ article, activity: 'active-recall', displayMode: 'recall' })).toEqual({
      article,
      clearSnapshot: true,
      syncWpmActivity: 'active-recall',
      loadOptions: { displayMode: 'recall' },
      nextView: { screen: 'active-exercise' },
      autoPlay: false,
    });

    expect(planContinueSession({ article, activity: 'training', displayMode: 'training' })).toEqual({
      article,
      clearSnapshot: true,
      syncWpmActivity: 'training',
      loadOptions: { displayMode: 'training' },
      nextView: { screen: 'active-training', article },
      autoPlay: false,
    });
  });
});
