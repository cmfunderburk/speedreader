import { useEffect, useCallback } from 'react';

interface KeyboardHandlers {
  onSpace?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onBracketLeft?: () => void;
  onBracketRight?: () => void;
  onEscape?: () => void;
}

export function useKeyboard(handlers: KeyboardHandlers): void {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ignore if user is typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        handlers.onSpace?.();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        handlers.onLeft?.();
        break;
      case 'ArrowRight':
        event.preventDefault();
        handlers.onRight?.();
        break;
      case 'BracketLeft':
        event.preventDefault();
        handlers.onBracketLeft?.();
        break;
      case 'BracketRight':
        event.preventDefault();
        handlers.onBracketRight?.();
        break;
      case 'Escape':
        event.preventDefault();
        handlers.onEscape?.();
        break;
    }
  }, [handlers]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
