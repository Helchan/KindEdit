// Tree types
export interface TreeNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: TreeNode[];
  expanded?: boolean;
}
