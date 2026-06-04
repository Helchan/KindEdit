import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

type ThemeSetting = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeStore {
  setting: ThemeSetting;
  resolved: ResolvedTheme;

  setSetting: (setting: ThemeSetting) => void;
  initTheme: () => Promise<void>;
  applyTheme: (theme: ResolvedTheme) => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  setting: 'system',
  resolved: 'light',

  setSetting: (setting) => {
    set({ setting });
    if (setting === 'system') {
      get().initTheme();
    } else {
      get().applyTheme(setting);
    }
  },

  initTheme: async () => {
    const { setting } = get();
    if (setting === 'system') {
      try {
        const sysTheme = await invoke<string>('get_system_theme');
        const resolved: ResolvedTheme = sysTheme === 'dark' ? 'dark' : 'light';
        get().applyTheme(resolved);
      } catch {
        // Fallback: detect via media query
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        get().applyTheme(isDark ? 'dark' : 'light');
      }
    } else {
      get().applyTheme(setting);
    }
  },

  applyTheme: (theme) => {
    set({ resolved: theme });
    document.documentElement.setAttribute('data-theme', theme);
    // Sync native window title bar with theme
    invoke('set_window_theme', { dark: theme === 'dark' }).catch(() => {});
  },
}));
