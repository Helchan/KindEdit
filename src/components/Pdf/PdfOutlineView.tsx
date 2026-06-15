import { useCallback, useMemo, useState } from 'react';
import type { PdfOutlineNode } from '../../types/pdf';

interface PdfOutlineViewProps {
  nodes: PdfOutlineNode[];
  currentPage: number;
  fontSize: number;
  onJumpToPage: (pageNumber: number, y?: number | null) => void;
  onChange: (nodes: PdfOutlineNode[]) => void;
  onFontSizeChange?: (fontSize: number) => void;
}

interface FlatOutlineNode {
  node: PdfOutlineNode;
  depth: number;
  path: number[];
}

interface MenuState {
  visible: boolean;
  x: number;
  y: number;
  path: number[] | null;
}

function flattenOutline(nodes: PdfOutlineNode[], depth = 0, parentPath: number[] = []): FlatOutlineNode[] {
  const result: FlatOutlineNode[] = [];
  nodes.forEach((node, index) => {
    const path = [...parentPath, index];
    result.push({ node, depth, path });
    if (node.expanded !== false && node.children.length > 0) {
      result.push(...flattenOutline(node.children, depth + 1, path));
    }
  });
  return result;
}

function updateNodeAtPath(
  nodes: PdfOutlineNode[],
  path: number[],
  updater: (node: PdfOutlineNode) => PdfOutlineNode
): PdfOutlineNode[] {
  if (path.length === 0) return nodes;
  const [index, ...rest] = path;
  return nodes.map((node, nodeIndex) => {
    if (nodeIndex !== index) return node;
    if (rest.length === 0) return updater(node);
    return { ...node, children: updateNodeAtPath(node.children, rest, updater) };
  });
}

function removeNodeAtPath(nodes: PdfOutlineNode[], path: number[]): PdfOutlineNode[] {
  if (path.length === 0) return nodes;
  const [index, ...rest] = path;
  if (rest.length === 0) {
    return nodes.filter((_, nodeIndex) => nodeIndex !== index);
  }
  return nodes.map((node, nodeIndex) => (
    nodeIndex === index
      ? { ...node, children: removeNodeAtPath(node.children, rest) }
      : node
  ));
}

function insertSibling(nodes: PdfOutlineNode[], path: number[], node: PdfOutlineNode): PdfOutlineNode[] {
  if (path.length === 0) return [...nodes, node];
  if (path.length === 1) {
    const next = [...nodes];
    next.splice(path[0] + 1, 0, node);
    return next;
  }
  const [index, ...rest] = path;
  return nodes.map((item, nodeIndex) => (
    nodeIndex === index
      ? { ...item, children: insertSibling(item.children, rest, node) }
      : item
  ));
}

function moveNode(nodes: PdfOutlineNode[], path: number[], direction: -1 | 1): PdfOutlineNode[] {
  if (path.length === 0) return nodes;
  if (path.length === 1) {
    const index = path[0];
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return nodes;
    const next = [...nodes];
    const [node] = next.splice(index, 1);
    next.splice(target, 0, node);
    return next;
  }
  const [index, ...rest] = path;
  return nodes.map((item, nodeIndex) => (
    nodeIndex === index
      ? { ...item, children: moveNode(item.children, rest, direction) }
      : item
  ));
}

function getNodeAtPath(nodes: PdfOutlineNode[], path: number[] | null): PdfOutlineNode | null {
  if (!path) return null;
  let current: PdfOutlineNode | null = null;
  let list = nodes;
  for (const index of path) {
    current = list[index] ?? null;
    if (!current) return null;
    list = current.children;
  }
  return current;
}

function createOutlineNode(currentPage: number): PdfOutlineNode {
  return {
    id: `pdf-outline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: '新建书签',
    pageNumber: currentPage,
    children: [],
    expanded: true,
  };
}

function setExpandedRecursive(nodes: PdfOutlineNode[], expanded: boolean): PdfOutlineNode[] {
  return nodes.map((node) => ({
    ...node,
    expanded,
    children: setExpandedRecursive(node.children, expanded),
  }));
}

export default function PdfOutlineView({
  nodes,
  currentPage,
  fontSize,
  onJumpToPage,
  onChange,
  onFontSizeChange,
}: PdfOutlineViewProps) {
  const [menu, setMenu] = useState<MenuState>({ visible: false, x: 0, y: 0, path: null });
  const [editingPath, setEditingPath] = useState<number[] | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const flatNodes = useMemo(() => flattenOutline(nodes), [nodes]);
  const rowHeight = Math.max(24, Math.round(fontSize + 11));
  const menuNode = getNodeAtPath(nodes, menu.path);

  const closeMenu = useCallback(() => setMenu((prev) => ({ ...prev, visible: false })), []);

  const startRename = useCallback((path: number[]) => {
    const node = getNodeAtPath(nodes, path);
    if (!node) return;
    setEditingPath(path);
    setEditingTitle(node.title);
    closeMenu();
  }, [closeMenu, nodes]);

  const commitRename = useCallback(() => {
    if (!editingPath) return;
    const title = editingTitle.trim() || '未命名书签';
    onChange(updateNodeAtPath(nodes, editingPath, (node) => ({ ...node, title })));
    setEditingPath(null);
    setEditingTitle('');
  }, [editingPath, editingTitle, nodes, onChange]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || !onFontSizeChange) return;
    event.preventDefault();
    event.stopPropagation();
    onFontSizeChange(fontSize + (event.deltaY < 0 ? 1 : -1));
  }, [fontSize, onFontSizeChange]);

  const openMenu = useCallback((event: React.MouseEvent, path: number[] | null) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ visible: true, x: event.clientX, y: event.clientY, path });
  }, []);

  const toggleNode = useCallback((path: number[]) => {
    onChange(updateNodeAtPath(nodes, path, (node) => ({ ...node, expanded: node.expanded === false })));
  }, [nodes, onChange]);

  const addSibling = useCallback((path: number[] | null) => {
    const next = path ? insertSibling(nodes, path, createOutlineNode(currentPage)) : [...nodes, createOutlineNode(currentPage)];
    onChange(next);
    closeMenu();
  }, [closeMenu, currentPage, nodes, onChange]);

  const addChild = useCallback((path: number[]) => {
    onChange(updateNodeAtPath(nodes, path, (node) => ({
      ...node,
      expanded: true,
      children: [...node.children, createOutlineNode(currentPage)],
    })));
    closeMenu();
  }, [closeMenu, currentPage, nodes, onChange]);

  const deleteNode = useCallback((path: number[]) => {
    onChange(removeNodeAtPath(nodes, path));
    closeMenu();
  }, [closeMenu, nodes, onChange]);

  const setTargetPage = useCallback((path: number[]) => {
    onChange(updateNodeAtPath(nodes, path, (node) => ({ ...node, pageNumber: currentPage, x: null, y: null })));
    closeMenu();
  }, [closeMenu, currentPage, nodes, onChange]);

  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    closeMenu();
  }, [closeMenu]);

  return (
    <div className="pdf-outline" onWheel={handleWheel} onContextMenu={(event) => openMenu(event, null)}>
      <div className="pdf-outline-list">
        {flatNodes.length === 0 && (
          <div className="pdf-outline-empty" style={{ fontSize }}>无目录</div>
        )}
        {flatNodes.map(({ node, depth, path }) => {
          const isEditing = JSON.stringify(path) === JSON.stringify(editingPath);
          return (
            <div
              key={node.id}
              className="pdf-outline-row"
              style={{
                minHeight: rowHeight,
                paddingLeft: 6 + depth * Math.max(16, fontSize + 3),
                fontSize,
              }}
              onClick={() => onJumpToPage(node.pageNumber, node.y)}
              onContextMenu={(event) => openMenu(event, path)}
            >
              <button
                className="pdf-outline-toggle"
                disabled={node.children.length === 0}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleNode(path);
                }}
              >
                {node.children.length > 0 ? (node.expanded === false ? '+' : '-') : ''}
              </button>
              {isEditing ? (
                <input
                  className="pdf-outline-input"
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRename();
                    if (event.key === 'Escape') setEditingPath(null);
                  }}
                  autoFocus
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <>
                  <span className="pdf-outline-title">{node.title || '未命名书签'}</span>
                  <span className="pdf-outline-page">p.{node.pageNumber}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {menu.visible && (
        <div className="tree-context-menu pdf-outline-menu" style={{ left: menu.x, top: menu.y }}>
          {menuNode ? (
            <>
              <div className="tree-context-menu-item" onClick={() => startRename(menu.path!)}>重命名</div>
              <div className="tree-context-menu-item" onClick={() => addSibling(menu.path)}>新增同级</div>
              <div className="tree-context-menu-item" onClick={() => addChild(menu.path!)}>新增子级</div>
              <div className="tree-context-menu-item" onClick={() => setTargetPage(menu.path!)}>设置目标为当前页</div>
              <div className="tree-context-menu-separator" />
              <div className="tree-context-menu-item" onClick={() => { onChange(moveNode(nodes, menu.path!, -1)); closeMenu(); }}>上移</div>
              <div className="tree-context-menu-item" onClick={() => { onChange(moveNode(nodes, menu.path!, 1)); closeMenu(); }}>下移</div>
              <div className="tree-context-menu-separator" />
              <div className="tree-context-menu-item" onClick={() => copyText(menuNode.title)}>复制标题</div>
              <div className="tree-context-menu-item" onClick={() => copyText(menu.path!.join('/'))}>复制路径</div>
              <div className="tree-context-menu-separator" />
              <div className="tree-context-menu-item danger" onClick={() => deleteNode(menu.path!)}>
                {menuNode.children.length > 0 ? '删除（含子级）' : '删除'}
              </div>
            </>
          ) : (
            <>
              <div className="tree-context-menu-item" onClick={() => addSibling(null)}>新增书签</div>
              <div className="tree-context-menu-separator" />
              <div className="tree-context-menu-item" onClick={() => { onChange(setExpandedRecursive(nodes, true)); closeMenu(); }}>展开所有</div>
              <div className="tree-context-menu-item" onClick={() => { onChange(setExpandedRecursive(nodes, false)); closeMenu(); }}>折叠所有</div>
              <div className="tree-context-menu-separator" />
              <div className="tree-context-menu-item" onClick={() => copyText('')}>复制路径</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
