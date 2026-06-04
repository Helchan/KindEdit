import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { TreeNode, TreeViewProps } from './types';
import TreeNodeComponent from './TreeNode';
import './TreeView.css';

const NODE_HEIGHT = 24;

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
  onNodeClick,
  onCopyNodeKey,
  onCopyNodeValue,
  onCopyNodePath,
  highlightedPath,
  fontSize = 13,
}: TreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });

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

  // 当 highlightedPath 改变时，自动展开路径上所有父节点并滚动到可见
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

    // 滚动到高亮节点（等展开生效后）
    requestAnimationFrame(() => {
      // 使用更新后的 flatNodes 来找到节点索引
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
  }, [highlightedPath, nodes]);

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
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

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

  // 关闭菜单（点击任何地方）
  const handleContainerClick = useCallback(() => {
    if (contextMenu.visible) closeContextMenu();
  }, [contextMenu.visible, closeContextMenu]);

  return (
    <div
      className="tree-view-container"
      ref={containerRef}
      onScroll={handleScroll}
      onClick={handleContainerClick}
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
              isHighlighted={highlightedPath === node.path}
              fontSize={fontSize}
            />
          ))}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.node && (
        <div
          className="tree-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <div
            className="tree-context-menu-item"
            onClick={() => {
              onCopyNodeKey?.(contextMenu.node!);
              closeContextMenu();
            }}
          >
            复制 Key
          </div>
          <div
            className="tree-context-menu-item"
            onClick={() => {
              onCopyNodeValue?.(contextMenu.node!);
              closeContextMenu();
            }}
          >
            复制 Value
          </div>
          <div
            className="tree-context-menu-item"
            onClick={() => {
              onCopyNodePath?.(contextMenu.node!);
              closeContextMenu();
            }}
          >
            复制 Path
          </div>
        </div>
      )}
    </div>
  );
}
