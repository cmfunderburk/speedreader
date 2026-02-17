import type { Activity, Article } from '../types';

import type {
  ComprehensionExamPreset,
  ComprehensionRunMode,
} from '../types';

export interface ComprehensionBuilderState {
  sourceArticleIds: string[];
  preset: ComprehensionExamPreset;
  difficultyTarget: 'standard' | 'challenging';
  openBookSynthesis: boolean;
}

export interface ActiveComprehensionContext {
  runMode: ComprehensionRunMode;
  sourceArticleIds: string[];
  examPreset?: ComprehensionExamPreset;
  difficultyTarget?: 'standard' | 'challenging';
  openBookSynthesis?: boolean;
}

export type ViewState =
  | { screen: 'home' }
  | { screen: 'content-browser'; activity: Activity }
  | { screen: 'preview'; activity: Activity; article: Article }
  | { screen: 'active-reader' }
  | { screen: 'active-exercise' }
  | { screen: 'active-comprehension'; article: Article; entryPoint: 'post-reading' | 'launcher'; comprehension: ActiveComprehensionContext }
  | { screen: 'active-training'; article?: Article }
  | { screen: 'settings' }
  | { screen: 'library-settings' }
  | { screen: 'comprehension-builder'; }
  | { screen: 'add' };

export type ViewAction =
  | { type: 'go-home' }
  | { type: 'open-content-browser'; activity: Activity }
  | { type: 'open-preview'; activity: Activity; article: Article }
  | { type: 'open-active-reader' }
  | { type: 'open-active-exercise' }
  | { type: 'open-active-comprehension'; article: Article; entryPoint: 'post-reading' | 'launcher'; comprehension: ActiveComprehensionContext }
  | { type: 'open-active-training'; article?: Article }
  | { type: 'open-comprehension-builder' }
  | { type: 'open-settings' }
  | { type: 'open-library-settings' }
  | { type: 'open-add' };

export function getInitialViewState(search: string): ViewState {
  void search;
  return { screen: 'home' };
}

export function appViewStateReducer(_state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case 'go-home':
      return { screen: 'home' };
    case 'open-content-browser':
      return { screen: 'content-browser', activity: action.activity };
    case 'open-preview':
      return { screen: 'preview', activity: action.activity, article: action.article };
    case 'open-active-reader':
      return { screen: 'active-reader' };
    case 'open-active-exercise':
      return { screen: 'active-exercise' };
    case 'open-active-comprehension':
      return {
        screen: 'active-comprehension',
        article: action.article,
        entryPoint: action.entryPoint,
        comprehension: action.comprehension,
      };
    case 'open-active-training':
      return { screen: 'active-training', ...(action.article ? { article: action.article } : {}) };
    case 'open-comprehension-builder':
      return { screen: 'comprehension-builder' };
    case 'open-settings':
      return { screen: 'settings' };
    case 'open-library-settings':
      return { screen: 'library-settings' };
    case 'open-add':
      return { screen: 'add' };
    default:
      return _state;
  }
}

export function viewStateToAction(state: ViewState): ViewAction {
  switch (state.screen) {
    case 'home':
      return { type: 'go-home' };
    case 'content-browser':
      return { type: 'open-content-browser', activity: state.activity };
    case 'preview':
      return { type: 'open-preview', activity: state.activity, article: state.article };
    case 'active-reader':
      return { type: 'open-active-reader' };
    case 'active-exercise':
      return { type: 'open-active-exercise' };
    case 'active-comprehension':
      return {
        type: 'open-active-comprehension',
        article: state.article,
        entryPoint: state.entryPoint,
        comprehension: state.comprehension,
      };
    case 'active-training':
      return { type: 'open-active-training', article: state.article };
    case 'comprehension-builder':
      return { type: 'open-comprehension-builder' };
    case 'settings':
      return { type: 'open-settings' };
    case 'library-settings':
      return { type: 'open-library-settings' };
    case 'add':
      return { type: 'open-add' };
    default:
      return { type: 'go-home' };
  }
}
