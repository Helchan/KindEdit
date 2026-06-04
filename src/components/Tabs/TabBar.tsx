import { useState, useRef } from 'react';
import Tab from './Tab';
import ContextMenu, { MenuItem } from '../ContextMenu/ContextMenu';

export interface TabInfo {
  id: string;
  title: string;
  dirty: boolean;
  docType: string;
}

interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}

export default function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; tabId: string }>({
    visible: false,
    x: 0,
    y: 0,
    tabId: '',
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, tabId });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const contextMenuItems: MenuItem[] = [
    {
      label: '关闭',
      action: () => onCloseTab(contextMenu.tabId),
    },
    {
      label: '关闭其他',
      action: () => {
        tabs.forEach((t) => {
          if (t.id !== contextMenu.tabId) onCloseTab(t.id);
        });
      },
      disabled: tabs.length <= 1,
      separator: false,
    },
    {
      label: '关闭右侧所有',
      action: () => {
        const index = tabs.findIndex((t) => t.id === contextMenu.tabId);
        tabs.slice(index + 1).forEach((t) => onCloseTab(t.id));
      },
      disabled: tabs.findIndex((t) => t.id === contextMenu.tabId) >= tabs.length - 1,
      separator: false,
    },
  ];

  return (
    <div className="tab-bar">
      <div className="tab-bar-scroll" ref={scrollRef}>
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            id={tab.id}
            title={tab.title}
            active={tab.id === activeTabId}
            dirty={tab.dirty}
            onSelect={() => onSelectTab(tab.id)}
            onClose={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
          />
        ))}
        <button className="tab-bar-new" onClick={onNewTab} title="新建页签">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>
      </div>
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenuItems}
        onClose={closeContextMenu}
      />
    </div>
  );
}
