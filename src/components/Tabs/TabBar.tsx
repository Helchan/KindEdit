import { useEffect, useLayoutEffect, useState, useRef } from 'react';
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
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
}

export default function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab, onReorderTabs }: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; tabId: string }>({
    visible: false,
    x: 0,
    y: 0,
    tabId: '',
  });
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggedTabIdRef = useRef<string | null>(null);
  const isPointerDraggingRef = useRef(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragGrabOffsetXRef = useRef(0);
  const lastPointerXRef = useRef(0);
  const pendingAnimationRectsRef = useRef<Map<string, DOMRect> | null>(null);
  const suppressSelectRef = useRef(false);

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, tabId });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const getTabElements = () => {
    if (!scrollRef.current) return [];
    return Array.from(scrollRef.current.querySelectorAll<HTMLElement>('.tab[data-tab-id]'));
  };

  const captureTabRects = () => {
    const rects = new Map<string, DOMRect>();
    getTabElements().forEach((el) => {
      const tabId = el.dataset.tabId;
      if (tabId) {
        rects.set(tabId, el.getBoundingClientRect());
      }
    });
    return rects;
  };

  const getTabBaseLeft = (el: HTMLElement) => {
    if (!scrollRef.current) return el.getBoundingClientRect().left;
    const containerRect = scrollRef.current.getBoundingClientRect();
    return containerRect.left + el.offsetLeft - scrollRef.current.scrollLeft;
  };

  const updateDraggedOffset = (clientX: number) => {
    const draggedTabId = draggedTabIdRef.current;
    if (!draggedTabId) return;

    const draggedEl = getTabElements().find((el) => el.dataset.tabId === draggedTabId);
    if (!draggedEl) return;

    const baseLeft = getTabBaseLeft(draggedEl);
    setDragOffsetX(clientX - dragGrabOffsetXRef.current - baseLeft);
  };

  useLayoutEffect(() => {
    if (draggedTabIdRef.current && isPointerDraggingRef.current) {
      updateDraggedOffset(lastPointerXRef.current);
    }

    const previousRects = pendingAnimationRectsRef.current;
    if (!previousRects) return;
    pendingAnimationRectsRef.current = null;

    getTabElements().forEach((el) => {
      const tabId = el.dataset.tabId;
      if (!tabId) return;
      if (tabId === draggedTabIdRef.current && isPointerDraggingRef.current) return;

      const previousRect = previousRects.get(tabId);
      if (!previousRect) return;

      const nextRect = el.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      if (Math.abs(deltaX) < 1) return;

      el.style.transition = 'none';
      el.style.transform = `translateX(${deltaX}px)`;

      requestAnimationFrame(() => {
        el.style.transition = 'transform 140ms ease';
        el.style.transform = 'translateX(0)';
      });

      window.setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
      }, 180);
    });
  }, [tabs]);

  const clearDragState = () => {
    draggedTabIdRef.current = null;
    isPointerDraggingRef.current = false;
    dragStartPointRef.current = null;
    dragGrabOffsetXRef.current = 0;
    lastPointerXRef.current = 0;
    setDraggingTabId(null);
    setDragOffsetX(0);
    window.setTimeout(() => {
      suppressSelectRef.current = false;
    }, 0);
  };

  const handlePointerDown = (e: React.PointerEvent, tabId: string) => {
    if (e.button !== 0) return;

    draggedTabIdRef.current = tabId;
    isPointerDraggingRef.current = false;
    dragStartPointRef.current = { x: e.clientX, y: e.clientY };
    lastPointerXRef.current = e.clientX;
    dragGrabOffsetXRef.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const draggedTabId = draggedTabIdRef.current;
    const startPoint = dragStartPointRef.current;
    if (!draggedTabId || !startPoint || !scrollRef.current) return;
    e.preventDefault();
    lastPointerXRef.current = e.clientX;

    if (!isPointerDraggingRef.current) {
      const movedX = Math.abs(e.clientX - startPoint.x);
      const movedY = Math.abs(e.clientY - startPoint.y);
      if (movedX < 4 && movedY < 4) return;
      isPointerDraggingRef.current = true;
      suppressSelectRef.current = true;
      setDraggingTabId(draggedTabId);
    }

    updateDraggedOffset(e.clientX);

    const fromIndex = tabs.findIndex((tab) => tab.id === draggedTabId);
    if (fromIndex < 0) return;

    const tabElements = getTabElements();
    const targetEl = tabElements.find((el) => {
      if (el.dataset.tabId === draggedTabId) return false;
      const rect = el.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX <= rect.right;
    });
    if (!targetEl) return;

    const targetTabId = targetEl.dataset.tabId;
    const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId);
    if (targetIndex < 0 || targetIndex === fromIndex) return;

    const targetRect = targetEl.getBoundingClientRect();
    const targetInsertIndex = e.clientX < targetRect.left + targetRect.width / 2
      ? targetIndex
      : targetIndex + 1;
    const toIndex = targetInsertIndex > fromIndex ? targetInsertIndex - 1 : targetInsertIndex;
    if (fromIndex === toIndex) return;

    pendingAnimationRectsRef.current = captureTabRects();
    onReorderTabs(fromIndex, toIndex);
  };

  const handleSelectTab = (tabId: string) => {
    if (suppressSelectRef.current) return;
    onSelectTab(tabId);
  };

  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (draggedTabIdRef.current) {
        clearDragState();
      }
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => window.removeEventListener('pointerup', handleWindowPointerUp);
  }, []);

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
            dragging={tab.id === draggingTabId}
            dragOffsetX={tab.id === draggingTabId ? dragOffsetX : 0}
            onSelect={() => handleSelectTab(tab.id)}
            onClose={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            onPointerDown={(e) => handlePointerDown(e, tab.id)}
            onPointerMove={handlePointerMove}
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
