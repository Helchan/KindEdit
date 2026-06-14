import { editor } from 'monaco-editor';

export const defaultEditorOptions: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
  lineNumbers: 'on',
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  tabSize: 2,
  insertSpaces: true,
  automaticLayout: true,
  renderWhitespace: 'selection',
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true },
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  padding: { top: 8, bottom: 8 },
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  smoothScrolling: true,
  mouseWheelZoom: false,
  columnSelection: true,
  multiCursorModifier: 'ctrlCmd',
  selectionHighlight: true,
  occurrencesHighlight: 'off',
  contextmenu: false,
  lineNumbersMinChars: 1,
};

// 大文本保护模式配置
export const largeFileOptions: editor.IStandaloneEditorConstructionOptions = {
  ...defaultEditorOptions,
  minimap: { enabled: false },
  wordWrap: 'off',
  folding: false,
  renderWhitespace: 'none',
  selectionHighlight: true,
  occurrencesHighlight: 'off',
  largeFileOptimizations: true,
};

// 文档类型 → Monaco 语言 ID 映射
export const docTypeToMonacoLanguage: Record<string, string> = {
  json: 'json',
  xml: 'xml',
  markdown: 'markdown',
  yaml: 'yaml',
  properties: 'ini',
  sql: 'sql',
  java: 'java',
  python: 'python',
  javascript: 'javascript',
  text: 'plaintext',
  log: 'log',
};
