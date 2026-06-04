import { TreeNode } from '../components/TreeView/types';

// Document types
export interface DocumentInfo {
  id: string;
  path: string;
  filename: string;
  language: string;
  content: string;
  modified: boolean;
  encoding: string;
  lineEnding: 'lf' | 'crlf';
}

export interface DocumentMetadata {
  lineCount: number;
  charCount: number;
  encoding: string;
  language: string;
}

export type ViewMode = 'Single' | 'SplitTree' | 'SplitPreview';

export interface ParseResult {
  valid: boolean;
  error_message: string | null;
  error_line: number | null;
  error_column: number | null;
}

export interface OpenFileResult {
  content: string;
  doc_type: string;
  tree: TreeNode[] | null;
  is_large: boolean;
}
