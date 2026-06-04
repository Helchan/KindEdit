import { useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { registerThemes } from '../components/Editor/themes';
import { registerCustomLanguages } from '../components/Editor/languages';

/**
 * Monaco 实例管理 Hook
 * 在 Monaco 首次加载时注册主题和自定义语言
 */
export function useMonaco() {
  const handleBeforeMount = useCallback((monaco: typeof import('monaco-editor')) => {
    registerThemes(monaco);
    registerCustomLanguages(monaco);
    useEditorStore.getState().setMonacoInstance(monaco);
  }, []);

  return { handleBeforeMount };
}
