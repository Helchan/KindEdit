import { useEffect } from 'react';

interface KeyboardShortcuts {
  onSave?: () => void;
  onOpen?: () => void;
  onNewTab?: () => void;
  onCloseTab?: () => void;
}

export function useKeyboard(shortcuts: KeyboardShortcuts) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 's') {
        e.preventDefault();
        shortcuts.onSave?.();
      }
      if (mod && e.key === 'o') {
        e.preventDefault();
        shortcuts.onOpen?.();
      }
      if (mod && e.key === 't') {
        e.preventDefault();
        shortcuts.onNewTab?.();
      }
      if (mod && e.key === 'w') {
        e.preventDefault();
        shortcuts.onCloseTab?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
