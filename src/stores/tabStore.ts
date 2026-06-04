import { create } from 'zustand';

export interface TabState {
  id: string;
  title: string;
  filePath: string | null;
  docType: string;
  dirty: boolean;
  content: string;
  isLarge: boolean;
  userSetType: boolean;
}

interface TabStore {
  tabs: TabState[];
  activeTabId: string | null;

  addTab: (tab?: Partial<TabState>) => string;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<TabState>) => void;
  setTabContent: (id: string, content: string) => void;
  setTabDirty: (id: string, dirty: boolean) => void;
  getActiveTab: () => TabState | undefined;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  restoreTabs: (tabs: TabState[], activeTabId: string | null) => void;
}

let tabIdCounter = 0;
function generateTabId(): string {
  tabIdCounter += 1;
  return `tab-${Date.now()}-${tabIdCounter}`;
}

function createDefaultTab(overrides?: Partial<TabState>): TabState {
  return {
    id: generateTabId(),
    title: 'Untitled',
    filePath: null,
    docType: 'text',
    dirty: false,
    content: '',
    isLarge: false,
    userSetType: false,
    ...overrides,
  };
}

const initialTab = createDefaultTab();

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,

  addTab: (overrides?: Partial<TabState>) => {
    const newTab = createDefaultTab(overrides);
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
    return newTab.id;
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get();
    if (tabs.length === 1) {
      // Last tab: replace with new blank tab
      const newTab = createDefaultTab();
      set({ tabs: [newTab], activeTabId: newTab.id });
      return;
    }

    const index = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);

    let newActiveId = activeTabId;
    if (activeTabId === id) {
      // Activate adjacent tab
      const newIndex = Math.min(index, newTabs.length - 1);
      newActiveId = newTabs[newIndex].id;
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  closeOtherTabs: (id: string) => {
    const { tabs } = get();
    const kept = tabs.filter((t) => t.id === id);
    set({ tabs: kept, activeTabId: id });
  },

  closeTabsToRight: (id: string) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    const kept = tabs.slice(0, index + 1);

    let newActiveId = activeTabId;
    if (activeTabId && !kept.find((t) => t.id === activeTabId)) {
      newActiveId = id;
    }

    set({ tabs: kept, activeTabId: newActiveId });
  },

  setActiveTab: (id: string) => {
    set({ activeTabId: id });
  },

  updateTab: (id: string, updates: Partial<TabState>) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  },

  setTabContent: (id: string, content: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    }));
  },

  setTabDirty: (id: string, dirty: boolean) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)),
    }));
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },

  reorderTabs: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const newTabs = [...state.tabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { tabs: newTabs };
    });
  },

  restoreTabs: (restoredTabs: TabState[], restoredActiveTabId: string | null) => {
    if (restoredTabs.length === 0) return;
    const activeId = restoredActiveTabId && restoredTabs.find(t => t.id === restoredActiveTabId)
      ? restoredActiveTabId
      : restoredTabs[0].id;
    set({ tabs: restoredTabs, activeTabId: activeId });
  },
}));
