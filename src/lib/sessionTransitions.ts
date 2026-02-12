import type { Activity, Article, DisplayMode, SessionSnapshot, TokenMode } from '../types';
import type { ContinueSessionInfo } from './appViewSelectors';
import type { ViewState } from './appViewState';

interface ResumeReadingPlan {
  article: Article;
  displayMode: 'saccade' | 'rsvp';
  chunkIndex: number;
  snapshot: SessionSnapshot;
}

export type CloseActiveExercisePlan =
  | { type: 'resume-reading'; plan: ResumeReadingPlan }
  | { type: 'go-home'; clearSnapshot: boolean };

export interface SessionLaunchPlan {
  article: Article;
  clearSnapshot: boolean;
  syncWpmActivity: Activity;
  loadOptions: {
    displayMode: DisplayMode;
    mode?: TokenMode;
  };
  saveLastSession?: {
    articleId: string;
    activity: Activity;
    displayMode: DisplayMode;
  };
  nextView: ViewState;
  autoPlay: boolean;
}

function normalizeReadingDisplayMode(displayMode: DisplayMode): 'saccade' | 'rsvp' {
  return displayMode === 'saccade' || displayMode === 'rsvp' ? displayMode : 'saccade';
}

function createPacedReadingLaunchPlan(
  article: Article,
  displayMode: 'saccade' | 'rsvp',
  mode?: TokenMode
): SessionLaunchPlan {
  return {
    article,
    clearSnapshot: true,
    syncWpmActivity: 'paced-reading',
    loadOptions: { displayMode, ...(mode ? { mode } : {}) },
    saveLastSession: {
      articleId: article.id,
      activity: 'paced-reading',
      displayMode,
    },
    nextView: { screen: 'active-reader' },
    autoPlay: true,
  };
}

export function planCloseActiveExercise(
  snapshot: SessionSnapshot | null,
  articles: Article[],
  now: number
): CloseActiveExercisePlan {
  const reading = snapshot?.reading;
  if (!reading) {
    return { type: 'go-home', clearSnapshot: false };
  }

  const sourceArticle = articles.find((article) => article.id === reading.articleId);
  if (!sourceArticle) {
    return { type: 'go-home', clearSnapshot: true };
  }

  return {
    type: 'resume-reading',
    plan: {
      article: sourceArticle,
      displayMode: normalizeReadingDisplayMode(reading.displayMode),
      chunkIndex: reading.chunkIndex,
      snapshot: {
        ...snapshot,
        training: undefined,
        lastTransition: 'return-to-reading',
        updatedAt: now,
      },
    },
  };
}

export function planFeaturedArticleLaunch(article: Article): SessionLaunchPlan {
  return createPacedReadingLaunchPlan(article, 'saccade');
}

export function planStartReadingFromPreview(
  activity: Activity,
  article: Article,
  mode: TokenMode
): SessionLaunchPlan | null {
  if (activity === 'paced-reading') {
    return createPacedReadingLaunchPlan(article, 'saccade', mode);
  }

  if (activity === 'active-recall') {
    return {
      article,
      clearSnapshot: true,
      syncWpmActivity: 'active-recall',
      loadOptions: { displayMode: 'prediction' },
      saveLastSession: {
        articleId: article.id,
        activity: 'active-recall',
        displayMode: 'prediction',
      },
      nextView: { screen: 'active-exercise' },
      autoPlay: false,
    };
  }

  if (activity === 'comprehension-check') {
    return null;
  }

  return null;
}

export function planContinueSession(info: ContinueSessionInfo): SessionLaunchPlan {
  if (info.activity === 'paced-reading') {
    const displayMode = normalizeReadingDisplayMode(info.displayMode);
    return {
      ...createPacedReadingLaunchPlan(info.article, displayMode),
      saveLastSession: undefined,
    };
  }

  if (info.activity === 'active-recall') {
    return {
      article: info.article,
      clearSnapshot: true,
      syncWpmActivity: 'active-recall',
      loadOptions: { displayMode: info.displayMode },
      nextView: { screen: 'active-exercise' },
      autoPlay: false,
    };
  }

  if (info.activity === 'comprehension-check') {
    return {
      ...createPacedReadingLaunchPlan(info.article, 'saccade'),
      saveLastSession: undefined,
    };
  }

  return {
    article: info.article,
    clearSnapshot: true,
    syncWpmActivity: 'training',
    loadOptions: { displayMode: info.displayMode },
    nextView: { screen: 'active-training', article: info.article },
    autoPlay: false,
  };
}
