// 节点类型（与 Rust 后端 TreeNode 对应）
export type NodeType =
  | 'Object' | 'Array' | 'String' | 'Number'
  | 'Boolean' | 'Null' | 'Element' | 'Attribute' | 'Text';

export interface TreeNode {
  key: string;
  value: string | null;
  nodeType: NodeType;
  path: string;
  startOffset: number;
  endOffset: number;
  children: TreeNode[];
  expanded: boolean;
}

export interface TreeViewProps {
  nodes: TreeNode[];
  sourceContent?: string;
  onNodeClick?: (node: TreeNode) => void;
  onCopyNodeKey?: (node: TreeNode) => void;
  onCopyNodeValue?: (node: TreeNode) => void;
  onCopyNodePath?: (node: TreeNode) => void;
  highlightedPath?: string;
  highlightedSignal?: number;
  fontSize?: number;
  onFontSizeChange?: (fontSize: number) => void;
}

export interface TreeNodeComponentProps {
  node: TreeNode;
  depth: number;
  ancestorLast: boolean[];
  isLast: boolean;
  rowHeight: number;
  onToggle: (node: TreeNode) => void;
  onSelect: (node: TreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  onDoubleClick: (node: TreeNode) => void;
  isHighlighted: boolean;
  fontSize: number;
}
