import React from 'react';
import type { TreeNodeComponentProps, NodeType } from './types';

/** 获取节点类型图标 */
function getNodeIcon(nodeType: NodeType): React.ReactNode {
  const iconStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 3,
    marginRight: 4,
    flexShrink: 0,
  };

  switch (nodeType) {
    case 'Object':
      return <span style={{ ...iconStyle, color: '#d19a66', background: 'rgba(209,154,102,0.12)' }}>{'{}'}</span>;
    case 'Array':
      return <span style={{ ...iconStyle, color: '#56b6c2', background: 'rgba(86,182,194,0.12)' }}>{'[]'}</span>;
    case 'String':
      return <span style={{ ...iconStyle, color: '#98c379', background: 'rgba(152,195,121,0.12)' }}>{'‹›'}</span>;
    case 'Number':
      return <span style={{ ...iconStyle, color: '#d19a66', background: 'rgba(209,154,102,0.12)' }}>{'‹›'}</span>;
    case 'Boolean':
      return <span style={{ ...iconStyle, color: '#c678dd', background: 'rgba(198,120,221,0.12)' }}>{'‹›'}</span>;
    case 'Null':
      return <span style={{ ...iconStyle, color: '#abb2bf', background: 'rgba(171,178,191,0.12)' }}>{'‹›'}</span>;
    case 'Element':
      return <span style={{ ...iconStyle, color: '#e06c75', background: 'rgba(224,108,117,0.12)' }}>{'<>'}</span>;
    case 'Attribute':
      return <span style={{ ...iconStyle, color: '#61afef', background: 'rgba(97,175,239,0.12)' }}>@</span>;
    case 'Text':
      return <span style={{ ...iconStyle, color: '#abb2bf', background: 'rgba(171,178,191,0.12)' }}>T</span>;
    default:
      return <span style={iconStyle}>?</span>;
  }
}

/** 获取子节点数量提示 */
function getChildrenHint(node: { nodeType: NodeType; children: unknown[] }): string | null {
  if (node.children.length === 0) return null;
  if (node.nodeType === 'Object' || node.nodeType === 'Element') {
    return `{${node.children.length}}`;
  }
  if (node.nodeType === 'Array') {
    return `[${node.children.length}]`;
  }
  return null;
}

export default function TreeNodeComponent({
  node,
  depth,
  onToggle,
  onSelect,
  onContextMenu,
  isHighlighted,
  fontSize,
}: TreeNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const indent = depth * 16;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(node);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  };

  const childrenHint = getChildrenHint(node);

  // 截断 value 显示
  const displayValue = node.value != null
    ? node.value.length > 48 ? node.value.slice(0, 48) + '…' : node.value
    : null;

  return (
    <div
      className={`tree-node-row ${isHighlighted ? 'tree-node-highlighted' : ''}`}
      style={{
        paddingLeft: indent + 4,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        fontSize,
        fontFamily: 'var(--font-mono)',
        userSelect: 'none',
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* 展开箭头 */}
      <span
        className="tree-node-arrow"
        style={{
          width: 16,
          height: 16,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: hasChildren ? 1 : 0,
          pointerEvents: hasChildren ? 'auto' : 'none',
          transition: 'transform 0.15s',
          transform: node.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}
        onClick={hasChildren ? handleToggle : undefined}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
          <path d="M2 1 L6 4 L2 7 Z" />
        </svg>
      </span>

      {/* 类型图标 */}
      {getNodeIcon(node.nodeType)}

      {/* Key 名称 */}
      <span
        className="tree-node-key"
        style={{
          color: 'var(--color-text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {node.key}
      </span>

      {/* 子节点数量提示 */}
      {childrenHint && (
        <span
          style={{
            color: 'var(--color-text-secondary)',
            marginLeft: 4,
            fontSize: fontSize - 1,
            opacity: 0.7,
          }}
        >
          {childrenHint}
        </span>
      )}

      {/* Value 值 */}
      {displayValue != null && (
        <span
          className="tree-node-value"
          style={{
            color: 'var(--color-text-secondary)',
            marginLeft: 8,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
          }}
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}
