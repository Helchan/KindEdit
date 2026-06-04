import { create } from 'zustand';
import { editor } from 'monaco-editor';

interface EditorState {
  // 当前 Monaco 编辑器实例
  editorInstance: editor.IStandaloneCodeEditor | null;
  monacoInstance: typeof import('monaco-editor') | null;

  // 当前状态
  currentLanguage: string;
  cursorLine: number;
  cursorColumn: number;
  isLargeFile: boolean;
  isDirty: boolean;

  // Actions
  setEditorInstance: (instance: editor.IStandaloneCodeEditor | null) => void;
  setMonacoInstance: (monaco: typeof import('monaco-editor') | null) => void;
  setCurrentLanguage: (lang: string) => void;
  setCursorPosition: (line: number, column: number) => void;
  setIsLargeFile: (isLarge: boolean) => void;
  setIsDirty: (dirty: boolean) => void;

  // 编辑器操作
  setValue: (value: string) => void;
  getValue: () => string;
  setLanguage: (language: string) => void;
  focus: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  editorInstance: null,
  monacoInstance: null,
  currentLanguage: 'plaintext',
  cursorLine: 1,
  cursorColumn: 1,
  isLargeFile: false,
  isDirty: false,

  setEditorInstance: (instance) => set({ editorInstance: instance }),
  setMonacoInstance: (monaco) => set({ monacoInstance: monaco }),
  setCurrentLanguage: (lang) => set({ currentLanguage: lang }),
  setCursorPosition: (line, column) => set({ cursorLine: line, cursorColumn: column }),
  setIsLargeFile: (isLarge) => set({ isLargeFile: isLarge }),
  setIsDirty: (dirty) => set({ isDirty: dirty }),

  setValue: (value) => {
    const { editorInstance } = get();
    if (editorInstance) {
      const model = editorInstance.getModel();
      if (model) {
        model.setValue(value);
      }
    }
  },

  getValue: () => {
    const { editorInstance } = get();
    if (editorInstance) {
      const model = editorInstance.getModel();
      if (model) {
        return model.getValue();
      }
    }
    return '';
  },

  setLanguage: (language) => {
    const { editorInstance, monacoInstance } = get();
    if (editorInstance && monacoInstance) {
      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelLanguage(model, language);
      }
    }
    set({ currentLanguage: language });
  },

  focus: () => {
    const { editorInstance } = get();
    if (editorInstance) {
      editorInstance.focus();
    }
  },
}));
