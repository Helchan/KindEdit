import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface AppConfig {
  theme: 'system' | 'light' | 'dark';
  textFontSize: number;
  treeFontSize: number;
  syncDisplay: boolean;
  sqlUppercaseKeywords: boolean;
}

interface ConfigStore {
  config: AppConfig;
  loaded: boolean;

  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  updateConfig: (updates: Partial<AppConfig>) => void;
}

const defaultConfig: AppConfig = {
  theme: 'system',
  textFontSize: 14,
  treeFontSize: 13,
  syncDisplay: true,
  sqlUppercaseKeywords: true,
};

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: { ...defaultConfig },
  loaded: false,

  loadConfig: async () => {
    try {
      const loaded = await invoke<AppConfig>('load_config');
      set({ config: { ...defaultConfig, ...loaded }, loaded: true });
    } catch {
      // If backend is unavailable, use defaults
      set({ loaded: true });
    }
  },

  saveConfig: async () => {
    const { config } = get();
    try {
      await invoke('save_config', { config });
    } catch {
      // Silently fail if backend is unavailable
    }
  },

  updateConfig: (updates: Partial<AppConfig>) => {
    set((state) => ({
      config: { ...state.config, ...updates },
    }));
  },
}));
