import { editor } from 'monaco-editor';

// 明亮主题
export const kindeditLightTheme: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '0000FF', fontStyle: 'bold' },
    { token: 'string', foreground: '008000' },
    { token: 'number', foreground: '098658' },
    { token: 'comment', foreground: '808080', fontStyle: 'italic' },
    { token: 'type', foreground: '267f99' },
    { token: 'variable', foreground: '001080' },
    { token: 'operator', foreground: '000000' },
    { token: 'delimiter', foreground: '333333' },
    { token: 'tag', foreground: '800000' },
    { token: 'attribute.name', foreground: 'FF0000' },
    { token: 'attribute.value', foreground: '0451A5' },
    { token: 'keyword.error', foreground: 'FF0000', fontStyle: 'bold' },
    { token: 'keyword.warning', foreground: 'FF8800', fontStyle: 'bold' },
    { token: 'keyword.info', foreground: '0000FF', fontStyle: 'bold' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#1A1A1A',
    'editor.lineHighlightBackground': '#F5F5F5',
    'editor.selectionBackground': '#ADD6FF',
    'editor.inactiveSelectionBackground': '#E5EBF1',
    'editorLineNumber.foreground': '#999999',
    'editorLineNumber.activeForeground': '#333333',
    'editorCursor.foreground': '#333333',
    'editor.findMatchBackground': '#FFFF00',
    'editor.findMatchHighlightBackground': '#FFFF0066',
    'editorBracketMatch.background': '#E0E0E0',
    'editorBracketMatch.border': '#CCCCCC',
    'scrollbarSlider.background': '#00000020',
    'scrollbarSlider.hoverBackground': '#00000040',
    'scrollbarSlider.activeBackground': '#00000060',
  },
};

// 暗色主题
export const kindeditDarkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'operator', foreground: 'D4D4D4' },
    { token: 'delimiter', foreground: 'D4D4D4' },
    { token: 'tag', foreground: '569CD6' },
    { token: 'attribute.name', foreground: '9CDCFE' },
    { token: 'attribute.value', foreground: 'CE9178' },
    { token: 'keyword.error', foreground: 'F44747', fontStyle: 'bold' },
    { token: 'keyword.warning', foreground: 'FF8800', fontStyle: 'bold' },
    { token: 'keyword.info', foreground: '569CD6', fontStyle: 'bold' },
  ],
  colors: {
    'editor.background': '#1E1E1E',
    'editor.foreground': '#D4D4D4',
    'editor.lineHighlightBackground': '#2A2A2A',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#3A3D41',
    'editorLineNumber.foreground': '#5A5A5A',
    'editorLineNumber.activeForeground': '#CCCCCC',
    'editorCursor.foreground': '#AEAFAD',
    'editor.findMatchBackground': '#515C6A',
    'editor.findMatchHighlightBackground': '#EA5C0055',
    'editorBracketMatch.background': '#3A3A3A',
    'editorBracketMatch.border': '#888888',
    'scrollbarSlider.background': '#FFFFFF20',
    'scrollbarSlider.hoverBackground': '#FFFFFF40',
    'scrollbarSlider.activeBackground': '#FFFFFF60',
  },
};

// 注册主题函数（在 Monaco mount 时调用）
export function registerThemes(monaco: typeof import('monaco-editor')) {
  monaco.editor.defineTheme('kindedit-light', kindeditLightTheme);
  monaco.editor.defineTheme('kindedit-dark', kindeditDarkTheme);
}
