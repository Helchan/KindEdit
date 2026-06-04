import { useEffect } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { listen } from '@tauri-apps/api/event';

export function useTheme() {
  const { setting, resolved, setSetting, initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();

    // 监听系统主题变更事件（来自 Rust 后端）
    const unlisten = listen('theme-changed', (event) => {
      if (useThemeStore.getState().setting === 'system') {
        const newTheme = (event.payload as { theme: string }).theme;
        useThemeStore.getState().applyTheme(newTheme === 'dark' ? 'dark' : 'light');
      }
    });

    // 同时监听浏览器 prefers-color-scheme 变化（作为备选）
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (useThemeStore.getState().setting === 'system') {
        useThemeStore.getState().applyTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      unlisten.then(fn => fn());
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, []);

  return { setting, resolved, setSetting };
}
