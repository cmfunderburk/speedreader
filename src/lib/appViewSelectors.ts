import type { Activity, Article } from '../types';
import type { ViewState } from './appViewState';

const ACTIVITY_LABELS: Record<Activity, string> = {
  'paced-reading': 'Paced Reading',
  'active-recall': 'Active Recall',
  training: 'Training',
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
  return { screen: 'preview', activity, article };
}
