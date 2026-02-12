import type { ViewState } from './appViewState';

export type EscapeAction = 'none' | 'go-home' | 'close-active-exercise';

export function planEscapeAction(viewState: ViewState): EscapeAction {
  if (viewState.screen === 'home') {
    return 'none';
  }
  if (viewState.screen === 'active-exercise') {
    return 'close-active-exercise';
  }
  return 'go-home';
}
