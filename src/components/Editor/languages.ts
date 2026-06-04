import type { languages } from 'monaco-editor';

// Monaco 已内置 json, xml, markdown, sql, java, python, javascript
// 此文件注册 Monaco 未内置的自定义语言（如 .log 文件高亮）

export const supportedLanguages = [
  'json',
  'xml',
  'markdown',
  'sql',
  'java',
  'python',
  'javascript',
  'typescript',
  'plaintext',
  'log',
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

// Log 语言的 Monarch tokenizer 定义
const logLanguageDefinition: languages.IMonarchLanguage = {
  tokenizer: {
    root: [
      // 日期时间格式
      [/\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(\.\d+)?/, 'number'],
      // 日志级别
      [/\b(ERROR|FATAL|CRITICAL)\b/, 'keyword.error'],
      [/\b(WARN|WARNING)\b/, 'keyword.warning'],
      [/\b(INFO)\b/, 'keyword.info'],
      [/\b(DEBUG|TRACE)\b/, 'comment'],
      // 字符串
      [/"[^"]*"/, 'string'],
      [/'[^']*'/, 'string'],
      // URL
      [/https?:\/\/[^\s]+/, 'string.link'],
      // 数字
      [/\b\d+\b/, 'number'],
      // 方括号内容（常见日志格式如 [main] [Thread-1]）
      [/\[[^\]]*\]/, 'type'],
    ],
  },
};

export function registerCustomLanguages(monaco: typeof import('monaco-editor')) {
  // 注册 log 语言
  monaco.languages.register({ id: 'log', extensions: ['.log'] });
  monaco.languages.setMonarchTokensProvider('log', logLanguageDefinition);
}
