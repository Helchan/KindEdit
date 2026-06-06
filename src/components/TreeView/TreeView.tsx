import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import type { TreeNode, TreeViewProps } from './types';
import TreeNodeComponent from './TreeNode';
import './TreeView.css';

const NODE_HEIGHT = 24;
const MENU_VIEWPORT_PADDING = 8;

/** 扁平化展开的树节点（用于虚拟滚动） */
interface FlatNode {
  node: TreeNode;
  depth: number;
}

function flattenNodes(nodes: TreeNode[], depth: number = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.expanded && node.children.length > 0) {
      result.push(...flattenNodes(node.children, depth + 1));
    }
  }
  return result;
}

/** 右键上下文菜单 */
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: TreeNode | null;
}

export default function TreeView({
  nodes,
  sourceContent = '',
  onNodeClick,
  highlightedPath,
  highlightedSignal = 0,
  fontSize = 13,
}: TreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  // 当节点重新加载时，默认展开根节点
  useEffect(() => {
    if (nodes.length > 0) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        for (const root of nodes) {
          next.add(root.path);
        }
        return next;
      });
    }
  }, [nodes]);

  // 应用展开状态到节点
  const nodesWithExpand = useMemo(() => {
    function applyExpand(items: TreeNode[]): TreeNode[] {
      return items.map((n) => ({
        ...n,
        expanded: expandedPaths.has(n.path),
        children: applyExpand(n.children),
      }));
    }
    return applyExpand(nodes);
  }, [nodes, expandedPaths]);

  const flatNodes = useMemo(() => flattenNodes(nodesWithExpand), [nodesWithExpand]);

  const expandablePaths = useMemo(() => {
    const paths: string[] = [];
    function collect(items: TreeNode[]) {
      for (const node of items) {
        if (node.children.length > 0) {
          paths.push(node.path);
          collect(node.children);
        }
      }
    }
    collect(nodes);
    return paths;
  }, [nodes]);

  // 当 highlightedPath 改变时，自动展开路径上所有父节点
  useEffect(() => {
    if (!highlightedPath) return;

    // 收集所有需要展开的祖先路径
    const pathsToExpand = new Set<string>();
    function collectAncestors(items: TreeNode[], target: string): boolean {
      for (const node of items) {
        if (node.path === target) {
          return true;
        }
        if (node.children.length > 0) {
          if (collectAncestors(node.children, target)) {
            pathsToExpand.add(node.path);
            return true;
          }
        }
      }
      return false;
    }
    collectAncestors(nodes, highlightedPath);

    if (pathsToExpand.size > 0) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        for (const p of pathsToExpand) {
          next.add(p);
        }
        return next;
      });
    }

  }, [highlightedPath, highlightedSignal, nodes]);

  // 展开状态生效并重新扁平化后，再滚动到高亮节点。
  useEffect(() => {
    if (!highlightedPath) return;

    requestAnimationFrame(() => {
      const idx = flatNodes.findIndex((fn) => fn.node.path === highlightedPath);
      if (idx >= 0 && containerRef.current) {
        const targetTop = idx * NODE_HEIGHT;
        const container = containerRef.current;
        const visibleTop = container.scrollTop;
        const visibleBottom = visibleTop + container.clientHeight;
        if (targetTop < visibleTop || targetTop + NODE_HEIGHT > visibleBottom) {
          container.scrollTop = targetTop - container.clientHeight / 2 + NODE_HEIGHT / 2;
        }
      }
    });
  }, [highlightedPath, highlightedSignal, flatNodes]);

  const handleToggle = useCallback((node: TreeNode) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (node: TreeNode) => {
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  }, []);

  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (menuRef.current?.contains(e.target as Node)) return;

    setMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node: null,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  useLayoutEffect(() => {
    if (!contextMenu.visible) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      closeContextMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [contextMenu.visible, closeContextMenu]);

  useEffect(() => {
    if (!contextMenu.visible) return;

    const updateMenuPosition = () => {
      const menu = menuRef.current;
      if (!menu) return;

      const rect = menu.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - MENU_VIEWPORT_PADDING;
      const maxY = window.innerHeight - rect.height - MENU_VIEWPORT_PADDING;
      setMenuPosition({
        x: Math.max(MENU_VIEWPORT_PADDING, Math.min(contextMenu.x, Math.max(MENU_VIEWPORT_PADDING, maxX))),
        y: Math.max(MENU_VIEWPORT_PADDING, Math.min(contextMenu.y, Math.max(MENU_VIEWPORT_PADDING, maxY))),
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [contextMenu.visible, contextMenu.x, contextMenu.y, contextMenu.node]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // 虚拟滚动计算
  const containerHeight = containerRef.current?.clientHeight ?? 600;
  const totalHeight = flatNodes.length * NODE_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / NODE_HEIGHT) - 2);
  const endIndex = Math.min(
    flatNodes.length,
    Math.ceil((scrollTop + containerHeight) / NODE_HEIGHT) + 2
  );
  const visibleNodes = flatNodes.slice(startIndex, endIndex);
  const offsetY = startIndex * NODE_HEIGHT;

  const expandAll = useCallback(() => {
    setExpandedPaths(new Set(expandablePaths));
  }, [expandablePaths]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const collectSubtreeExpandablePaths = useCallback((node: TreeNode): string[] => {
    const paths: string[] = [];
    function collect(item: TreeNode) {
      if (item.children.length > 0) {
        paths.push(item.path);
        for (const child of item.children) {
          collect(child);
        }
      }
    }
    collect(node);
    return paths;
  }, []);

  const expandNodeSubtree = useCallback((node: TreeNode) => {
    const paths = collectSubtreeExpandablePaths(node);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const path of paths) {
        next.add(path);
      }
      return next;
    });
  }, [collectSubtreeExpandablePaths]);

  const collapseNodeSubtree = useCallback((node: TreeNode) => {
    const paths = collectSubtreeExpandablePaths(node);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const path of paths) {
        next.delete(path);
      }
      return next;
    });
  }, [collectSubtreeExpandablePaths]);

  const getRawNodeValue = useCallback((node: TreeNode): string => {
    if (
      sourceContent &&
      node.startOffset >= 0 &&
      node.endOffset > node.startOffset &&
      node.endOffset <= sourceContent.length
    ) {
      return sourceContent.slice(node.startOffset, node.endOffset);
    }
    if (node.value == null) return '';
    if (node.nodeType === 'String') return JSON.stringify(node.value);
    return node.value;
  }, [sourceContent]);

  const getNodeCopyText = useCallback((node: TreeNode): string => {
    const value = getRawNodeValue(node);
    if (node.path === '$' || node.key === 'Root') return value;
    const key = node.key.startsWith('[') ? node.key : JSON.stringify(node.key);
    return value ? `${key}: ${value}` : key;
  }, [getRawNodeValue]);

  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      // Clipboard can be denied by the host; menu state should still close.
    });
  }, []);

  const targetExpandablePaths = contextMenu.node
    ? collectSubtreeExpandablePaths(contextMenu.node)
    : [];
  const canExpandAll = expandablePaths.some((path) => !expandedPaths.has(path));
  const canCollapseAll = expandablePaths.some((path) => expandedPaths.has(path));
  const canExpandTarget = targetExpandablePaths.some((path) => !expandedPaths.has(path));
  const canCollapseTarget = targetExpandablePaths.some((path) => expandedPaths.has(path));

  const runMenuAction = (disabled: boolean, action: () => void) => {
    if (disabled) return;
    action();
    closeContextMenu();
  };

  return (
    <div
      className="tree-view-container"
      ref={containerRef}
      onScroll={handleScroll}
      onContextMenu={handleContainerContextMenu}
      style={{ overflow: 'auto', height: '100%', background: 'var(--color-bg-secondary)' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleNodes.map(({ node, depth }) => (
            <TreeNodeComponent
              key={node.path}
              node={node}
              depth={depth}
              onToggle={handleToggle}
              onSelect={handleSelect}
              onContextMenu={handleContextMenu}
              onDoubleClick={handleToggle}
              isHighlighted={highlightedPath === node.path}
              fontSize={fontSize}
            />
          ))}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && (
        <div
          ref={menuRef}
          className="tree-context-menu"
          style={{
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
            zIndex: 1000,
          }}
        >
          <div
            className={`tree-context-menu-item${canExpandAll ? '' : ' disabled'}`}
            onClick={() => runMenuAction(!canExpandAll, expandAll)}
          >
            展开所有
          </div>
          <div
            className={`tree-context-menu-item${canCollapseAll ? '' : ' disabled'}`}
            onClick={() => runMenuAction(!canCollapseAll, collapseAll)}
          >
            折叠所有
          </div>
          {contextMenu.node && (
            <>
              <div className="tree-context-menu-separator" />
              <div
                className={`tree-context-menu-item${canExpandTarget ? '' : ' disabled'}`}
                onClick={() => runMenuAction(!canExpandTarget, () => expandNodeSubtree(contextMenu.node!))}
              >
                展开此项
              </div>
              <div
                className={`tree-context-menu-item${canCollapseTarget ? '' : ' disabled'}`}
                onClick={() => runMenuAction(!canCollapseTarget, () => collapseNodeSubtree(contextMenu.node!))}
              >
                折叠此项
              </div>
              <div className="tree-context-menu-separator" />
              <div
                className="tree-context-menu-item"
                onClick={() => runMenuAction(false, () => copyText(getNodeCopyText(contextMenu.node!)))}
              >
                复制
              </div>
              <div
                className="tree-context-menu-item"
                onClick={() => runMenuAction(false, () => copyText(getRawNodeValue(contextMenu.node!)))}
              >
                复制值
              </div>
              <div
                className="tree-context-menu-item"
                onClick={() => runMenuAction(false, () => copyText(contextMenu.node!.path))}
              >
                复制路径
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
