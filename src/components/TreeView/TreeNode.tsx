import React from 'react';
import type { TreeNodeComponentProps, NodeType } from './types';

/** 获取节点类型图标 */
function getNodeIcon(nodeType: NodeType, fontSize: number): React.ReactNode {
  const iconSize = Math.max(16, Math.round(fontSize + 5));
  const iconFontSize = Math.max(9, Math.round(fontSize * 0.75));
  const iconStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: iconSize,
    height: iconSize,
    fontSize: iconFontSize,
    fontWeight: 700,
    borderRadius: Math.max(3, Math.round(iconSize * 0.18)),
    marginRight: 4,
    flexShrink: 0,
    lineHeight: 1,
  };
  const plainNodeStyle: React.CSSProperties = {
    ...iconStyle,
    color: '#98c379',
    background: 'rgba(152,195,121,0.12)',
  };

  switch (nodeType) {
    case 'Object':
      return <span style={{ ...iconStyle, color: '#d19a66', background: 'rgba(209,154,102,0.12)' }}>{'{}'}</span>;
    case 'Array':
      return <span style={{ ...iconStyle, color: '#56b6c2', background: 'rgba(86,182,194,0.12)' }}>{'[]'}</span>;
    case 'String':
    case 'Number':
    case 'Boolean':
    case 'Null':
      return <span style={plainNodeStyle}>{'‹›'}</span>;
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
  ancestorLast,
  isLast,
  rowHeight,
  onToggle,
  onSelect,
  onContextMenu,
  onDoubleClick,
  isHighlighted,
  fontSize,
}: TreeNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const indentUnit = Math.max(16, Math.round(fontSize + 3));
  const arrowSize = Math.max(16, Math.round(fontSize + 3));
  const connectorX = (level: number) => 4 + level * indentUnit + arrowSize / 2;
  const parentConnectorX = depth > 0 ? connectorX(depth - 1) : 0;
  const currentContentLeft = depth * indentUnit + 4;
  const toggleBoxSize = Math.max(12, Math.round(fontSize + 1));

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.detail > 1) {
      e.preventDefault();
    }

    const target = e.target as HTMLElement;
    const isArrowClick = target.closest('.tree-node-arrow') !== null;
    if (e.button === 0 && e.detail > 1 && e.detail % 2 === 0 && hasChildren && !isArrowClick) {
      e.stopPropagation();
      onDoubleClick(node);
    }
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
        position: 'relative',
        paddingLeft: currentContentLeft,
        height: rowHeight,
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        fontSize,
        fontFamily: 'var(--font-mono)',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <span className="tree-node-connectors" aria-hidden="true">
        {ancestorLast.map((last, level) => (
          !last && (
            <span
              key={level}
              className="tree-node-connector tree-node-connector-vertical"
              style={{ left: connectorX(level) }}
            />
          )
        ))}
        {depth > 0 && (
          <>
            <span
              className="tree-node-connector tree-node-connector-current"
              style={{
                left: parentConnectorX,
                top: 0,
                height: isLast ? rowHeight / 2 : rowHeight,
              }}
            />
            <span
              className="tree-node-connector tree-node-connector-elbow"
              style={{
                left: parentConnectorX,
                top: rowHeight / 2,
                width: Math.max(8, currentContentLeft - parentConnectorX),
              }}
            />
          </>
        )}
      </span>

      {/* 展开箭头 */}
      <span
        className="tree-node-arrow"
        style={{
          width: arrowSize,
          height: arrowSize,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: hasChildren ? 1 : 0,
          pointerEvents: hasChildren ? 'auto' : 'none',
        }}
        onClick={hasChildren ? handleToggle : undefined}
      >
        <span
          className="tree-node-toggle-box"
          style={{
            width: toggleBoxSize,
            height: toggleBoxSize,
            fontSize: Math.max(10, Math.round(fontSize * 0.85)),
          }}
        >
          {node.expanded ? '-' : '+'}
        </span>
      </span>

      {/* 类型图标 */}
      {getNodeIcon(node.nodeType, fontSize)}

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
