import type { Activity, Article, DisplayMode } from '../types';
import type { ViewState } from './appViewState';

const ACTIVITY_LABELS: Record<Activity, string> = {
  'paced-reading': 'Paced Reading',
  'active-recall': 'Active Recall',
  training: 'Training',
  'comprehension-check': 'Comprehension Check',
};

export function isActiveView(viewState: ViewState): boolean {
  return (
    viewState.screen === 'active-reader' ||
    viewState.screen === 'active-exercise' ||
    viewState.screen === 'active-training'
  );
}

export function getActiveWpmActivity(viewState: ViewState): Activity | null {
  if (viewState.screen === 'active-reader') return 'paced-reading';
  if (viewState.screen === 'active-exercise') return 'active-recall';
  if (viewState.screen === 'active-training') return 'training';
  return null;
}

export function getHeaderTitle(viewState: ViewState): string {
  switch (viewState.screen) {
    case 'active-reader':
      return 'Paced Reading';
    case 'active-exercise':
      return 'Active Recall';
    case 'active-training':
      return 'Training';
    case 'active-comprehension':
      return 'Comprehension Check';
    case 'comprehension-builder':
      return 'Build Exam';
    case 'content-browser':
      return ACTIVITY_LABELS[viewState.activity];
    case 'preview':
      return ACTIVITY_LABELS[viewState.activity];
    case 'settings':
      return 'Settings';
    case 'library-settings':
      return 'Library Settings';
    default:
      return 'Reader';
  }
}

export function planContentBrowserArticleSelection(activity: Activity, article: Article): ViewState {
  if (activity === 'training') {
    return { screen: 'active-training', article };
  }
  if (activity === 'comprehension-check') {
    return {
      screen: 'active-comprehension',
      article,
      entryPoint: 'launcher',
      comprehension: {
        runMode: 'quick-check',
        sourceArticleIds: [article.id],
      },
    };
  }
  return { screen: 'preview', activity, article };
}

interface LastSessionRef {
  articleId: string;
  activity: Activity;
  displayMode: DisplayMode;
}

export interface ContinueSessionInfo {
  article: Article;
  activity: Activity;
  displayMode: DisplayMode;
}

export function resolveContinueSessionInfo(
  lastSession: LastSessionRef | undefined,
  articles: Article[]
): ContinueSessionInfo | null {
  if (!lastSession) return null;
  const article = articles.find((item) => item.id === lastSession.articleId);
  if (!article) return null;
  return {
    article,
    activity: lastSession.activity,
    displayMode: lastSession.displayMode,
  };
}

export function shouldShowBackButton(viewState: ViewState): boolean {
  return viewState.screen !== 'home';
}

export type HeaderBackAction = 'go-home' | 'close-active-exercise' | 'close-active-comprehension';

export function getHeaderBackAction(viewState: ViewState): HeaderBackAction {
  if (viewState.screen === 'active-exercise') {
    return 'close-active-exercise';
  }
  if (viewState.screen === 'active-comprehension') {
    return 'close-active-comprehension';
  }
  return 'go-home';
}
