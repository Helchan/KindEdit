import { useCallback, useEffect, useRef } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { useEditorStore } from '../../stores/editorStore';
import { useMonaco } from '../../hooks/useMonaco';
import { defaultEditorOptions, largeFileOptions } from './monacoConfig';
import { AdditiveSelectionHighlighter } from './additiveSelectionHighlighter';

interface MonacoEditorProps {
  tabId: string;
  value: string;
  language: string;
  onChange?: (value: string) => void;
  onCursorPositionChange?: (line: number, column: number) => void;
  onCursorOffsetChange?: (offset: number) => void;
  onContextMenu?: (position: { x: number; y: number }) => void;
  readOnly?: boolean;
  fontSize?: number;
  theme?: 'kindedit-light' | 'kindedit-dark';
}

export default function MonacoEditor({
  tabId,
  value,
  language,
  onChange,
  onCursorPositionChange,
  onCursorOffsetChange,
  onContextMenu,
  readOnly = false,
  fontSize,
  theme = 'kindedit-light',
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const suppressChangeRef = useRef(false);
  const additiveHighlighterRef = useRef<AdditiveSelectionHighlighter | null>(null);
  const additiveMouseSelectionRef = useRef(false);
  const onCursorPositionChangeRef = useRef(onCursorPositionChange);
  const onCursorOffsetChangeRef = useRef(onCursorOffsetChange);
  const onContextMenuRef = useRef(onContextMenu);
  const { handleBeforeMount } = useMonaco();
  const { setEditorInstance, setCursorPosition, setCurrentLanguage, isLargeFile } =
    useEditorStore();

  // 选择编辑器选项（普通模式 / 大文件保护模式）
  const editorOptions: editor.IStandaloneEditorConstructionOptions = {
    ...(isLargeFile ? largeFileOptions : defaultEditorOptions),
    readOnly,
    ...(fontSize ? { fontSize } : {}),
  };

  const syncModelValue = useCallback((editorInstance: editor.IStandaloneCodeEditor, nextValue: string) => {
    const model = editorInstance.getModel();
    if (!model || model.getValue() === nextValue) return;

    suppressChangeRef.current = true;
    model.setValue(nextValue);
    window.setTimeout(() => {
      suppressChangeRef.current = false;
    }, 0);
  }, []);

  const isAdditiveSelectionModifier = useCallback((event: MouseEvent | { metaKey?: boolean; ctrlKey?: boolean }) => {
    const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`;
    const isMac = /mac|iphone|ipad|ipod/i.test(platform);
    return isMac ? !!event.metaKey : !!event.ctrlKey;
  }, []);

  const addCurrentSelectionHighlights = useCallback(() => {
    const editorInstance = editorRef.current;
    const highlighter = additiveHighlighterRef.current;
    const model = editorInstance?.getModel();
    if (!editorInstance || !highlighter || !model) return;

    for (const selection of editorInstance.getSelections() ?? []) {
      if (selection.isEmpty()) continue;
      const selectedText = model.getValueInRange(selection);
      highlighter.addQuery(selectedText);
    }
  }, []);

  const queueCurrentSelectionHighlights = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(addCurrentSelectionHighlights);
    });
  }, [addCurrentSelectionHighlights]);

  const emitCursorPosition = useCallback((editorInstance: editor.IStandaloneCodeEditor, position: { lineNumber: number; column: number } | null) => {
    if (!position) return;

    const { lineNumber, column } = position;
    setCursorPosition(lineNumber, column);
    onCursorPositionChangeRef.current?.(lineNumber, column);

    const model = editorInstance.getModel();
    if (model) {
      onCursorOffsetChangeRef.current?.(model.getOffsetAt(position));
    }
  }, [setCursorPosition]);

  const handleEditorMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance;
      additiveHighlighterRef.current?.dispose();
      additiveHighlighterRef.current = new AdditiveSelectionHighlighter(editorInstance);
      setEditorInstance(editorInstance);
      setCurrentLanguage(language);
      syncModelValue(editorInstance, value);

      // 监听光标位置变化
      editorInstance.onDidChangeCursorPosition((e) => {
        emitCursorPosition(editorInstance, e.position);
      });

      const domNode = editorInstance.getDomNode();
      if (domNode) {
        domNode.addEventListener('dblclick', (e: MouseEvent) => {
          if (!isAdditiveSelectionModifier(e)) return;
          additiveMouseSelectionRef.current = true;
          queueCurrentSelectionHighlights();
        }, true);

        // 拦截 Ctrl+Click 产生的 contextmenu 事件（macOS 上 Ctrl+Click = 右键）
        domNode.addEventListener('contextmenu', (e: MouseEvent) => {
          if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
          }
        });
      }

      editorInstance.onMouseDown((e) => {
        if (isAdditiveSelectionModifier(e.event.browserEvent)) {
          additiveMouseSelectionRef.current = true;
        } else {
          additiveMouseSelectionRef.current = false;
          additiveHighlighterRef.current?.clear();
        }
      });

      editorInstance.onMouseUp((e) => {
        if (additiveMouseSelectionRef.current || isAdditiveSelectionModifier(e.event.browserEvent)) {
          additiveMouseSelectionRef.current = false;
          queueCurrentSelectionHighlights();
          return;
        }

        emitCursorPosition(editorInstance, editorInstance.getPosition());
      });

      // 自定义右键菜单（忽略 Ctrl+Click 触发的 contextmenu）
      editorInstance.onContextMenu((e) => {
        if (e.event.ctrlKey) return; // macOS Ctrl+Click 不弹菜单
        e.event.preventDefault();
        e.event.stopPropagation();
        onContextMenuRef.current?.({ x: e.event.posx, y: e.event.posy });
      });
    },
    [language, value, setCurrentLanguage, setEditorInstance, syncModelValue, isAdditiveSelectionModifier, queueCurrentSelectionHighlights, emitCursorPosition]
  );

  const handleBeforeMountCallback: BeforeMount = useCallback(
    (monaco) => {
      handleBeforeMount(monaco);
    },
    [handleBeforeMount]
  );

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      if (suppressChangeRef.current) return;
      if (newValue !== undefined) {
        onChange?.(newValue);
      }
    },
    [onChange]
  );

  useEffect(() => {
    onCursorPositionChangeRef.current = onCursorPositionChange;
  }, [onCursorPositionChange]);

  useEffect(() => {
    onCursorOffsetChangeRef.current = onCursorOffsetChange;
  }, [onCursorOffsetChange]);

  useEffect(() => {
    onContextMenuRef.current = onContextMenu;
  }, [onContextMenu]);

  // Monaco 是独立模型系统，这里把外部 tab 内容同步到当前模型。
  useEffect(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;
    syncModelValue(editorInstance, value);
  }, [value, syncModelValue]);

  // 清理编辑器实例引用
  useEffect(() => {
    return () => {
      additiveHighlighterRef.current?.dispose();
      additiveHighlighterRef.current = null;
      setEditorInstance(null);
      editorRef.current = null;
    };
  }, [setEditorInstance]);

  return (
    <div className="monaco-editor-container" style={{ width: '100%', height: '100%' }}>
      <Editor
        value={value}
        language={language}
        path={tabId}
        theme={theme}
        options={editorOptions}
        onChange={handleChange}
        onMount={handleEditorMount}
        beforeMount={handleBeforeMountCallback}
        loading={<div className="editor-loading">Loading editor...</div>}
      />
    </div>
  );
}
