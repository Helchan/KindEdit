import { useEffect, useState, useCallback, useRef } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';

import MonacoEditor from './components/Editor/MonacoEditor';
import MilkdownEditor, { type MilkdownEditorHandle } from './components/Editor/MilkdownEditor';
import TabBar from './components/Tabs/TabBar';
import Toolbar from './components/Toolbar/Toolbar';
import StatusBar from './components/StatusBar/StatusBar';
import TreeView from './components/TreeView/TreeView';
import Resizer from './components/TreeView/Resizer';
import MarkdownPreview from './components/Markdown/MarkdownPreview';
import SettingsDialog from './components/Settings/SettingsDialog';
import AboutDialog from './components/About/AboutDialog';
import ConfirmSaveDialog, { type ConfirmSaveChoice } from './components/ConfirmSave/ConfirmSaveDialog';
import ContextMenu, { MenuItem } from './components/ContextMenu/ContextMenu';

import { useTabStore } from './stores/tabStore';
import { useEditorStore } from './stores/editorStore';
import { useThemeStore } from './stores/themeStore';
import { useConfigStore } from './stores/configStore';
import { useTheme } from './hooks/useTheme';
import { useKeyboard } from './hooks/useKeyboard';
import { docTypeToMonacoLanguage } from './components/Editor/monacoConfig';

import { TreeNode } from './components/TreeView/types';
import { ParseResult, OpenFileResult } from './types/document';
import { TabState } from './stores/tabStore';

import './styles/variables.css';
import './styles/global.css';

interface ConfirmSaveState {
  subject: string;
  allowNoAll: boolean;
}

function getTabSaveSubject(tab: TabState): string {
  return tab.filePath || tab.title || 'Untitled';
}

function findPathForOffsetInTree(nodes: TreeNode[], offset: number): string | null {
  let bestPath: string | null = null;
  let bestLen = Infinity;

  function walk(node: TreeNode) {
    if (node.startOffset <= offset && offset < node.endOffset) {
      const len = node.endOffset - node.startOffset;
      if (len < bestLen) {
        bestPath = node.path;
        bestLen = len;
      }
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  for (const root of nodes) {
    walk(root);
  }

  return bestPath;
}

function buildUtf8ByteOffsetMap(text: string, byteOffsets: number[]): Map<number, number> {
  const targets = [...new Set(byteOffsets)].sort((a, b) => a - b);
  const result = new Map<number, number>();
  let bytes = 0;
  let targetIndex = 0;
  let index = 0;

  while (index < text.length && targetIndex < targets.length) {
    while (targetIndex < targets.length && targets[targetIndex] <= bytes) {
      result.set(targets[targetIndex], index);
      targetIndex += 1;
    }

    const codePoint = text.codePointAt(index) ?? 0;
    const byteLength = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;

    while (targetIndex < targets.length && targets[targetIndex] < bytes + byteLength) {
      result.set(targets[targetIndex], index);
      targetIndex += 1;
    }

    bytes += byteLength;
    index += codePoint > 0xffff ? 2 : 1;
  }

  while (targetIndex < targets.length) {
    result.set(targets[targetIndex], text.length);
    targetIndex += 1;
  }

  return result;
}

function normalizeTreeOffsets(content: string, nodes: TreeNode[] | null | undefined): TreeNode[] {
  if (!nodes?.length) return [];

  const offsets: number[] = [];
  function collectOffsets(node: TreeNode) {
    offsets.push(node.startOffset, node.endOffset);
    for (const child of node.children) {
      collectOffsets(child);
    }
  }
  for (const node of nodes) {
    collectOffsets(node);
  }
  const offsetMap = buildUtf8ByteOffsetMap(content, offsets);

  function normalize(node: TreeNode): TreeNode {
    return {
      ...node,
      startOffset: offsetMap.get(node.startOffset) ?? content.length,
      endOffset: offsetMap.get(node.endOffset) ?? content.length,
      children: node.children.map(normalize),
    };
  }

  return nodes.map(normalize);
}

function App() {
  const { resolved: theme } = useTheme();
  const { config, loadConfig, updateConfig, saveConfig } = useConfigStore();
  const tabs = useTabStore(s => s.tabs);
  const activeTabId = useTabStore(s => s.activeTabId);
  const addTab = useTabStore(s => s.addTab);
  const closeTab = useTabStore(s => s.closeTab);
  const setActiveTab = useTabStore(s => s.setActiveTab);
  const updateTab = useTabStore(s => s.updateTab);
  const getActiveTab = useTabStore(s => s.getActiveTab);
  const reorderTabs = useTabStore(s => s.reorderTabs);

  const restoreTabs = useTabStore(s => s.restoreTabs);

  const editorStore = useEditorStore();

  const handleAbout = useCallback(async () => {
    const version = await getVersion();
    setAboutVersion(version);
    setAboutOpen(true);
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutVersion, setAboutVersion] = useState('');
  const [sessionRestored, setSessionRestored] = useState(false);
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [splitRatio, setSplitRatio] = useState(0.3);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const [highlightedPath, setHighlightedPath] = useState<string | undefined>(undefined);
  const [highlightedSignal, setHighlightedSignal] = useState(0);
  const parseTimerRef = useRef<number | null>(null);
  const cursorSyncTimerRef = useRef<number | null>(null);
  const milkdownEditorRef = useRef<MilkdownEditorHandle | null>(null);
  const confirmSaveResolverRef = useRef<((choice: ConfirmSaveChoice) => void) | null>(null);
  const [confirmSaveState, setConfirmSaveState] = useState<ConfirmSaveState | null>(null);

  // 右键菜单状态
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuX, setContextMenuX] = useState(0);
  const [contextMenuY, setContextMenuY] = useState(0);

  const handleUndo = useCallback(() => {
    const tab = getActiveTab();
    if (!tab) return;

    if (getViewMode(tab.docType) === 'Milkdown') {
      milkdownEditorRef.current?.undo();
      return;
    }

    editorStore.editorInstance?.trigger('toolbar', 'undo', null);
    editorStore.editorInstance?.focus();
  }, [editorStore.editorInstance, getActiveTab]);

  const handleRedo = useCallback(() => {
    const tab = getActiveTab();
    if (!tab) return;

    if (getViewMode(tab.docType) === 'Milkdown') {
      milkdownEditorRef.current?.redo();
      return;
    }

    editorStore.editorInstance?.trigger('toolbar', 'redo', null);
    editorStore.editorInstance?.focus();
  }, [editorStore.editorInstance, getActiveTab]);

  // 初始化：加载配置 + 恢复会话
  useEffect(() => {
    async function restoreState() {
      // 1. 加载配置
      await loadConfig();

      // 1.5 加载配置后，将主题同步到 themeStore 并应用到 DOM
      const loadedTheme = useConfigStore.getState().config.theme;
      useThemeStore.getState().setSetting(loadedTheme);

      // 2. 加载会话
      try {
        const session = await invoke<{ tabs: Array<{
          id: string;
          title: string;
          filePath: string | null;
          documentType: string;
          dirty: boolean;
          content: string | null;
          autosaveFile: string | null;
        }>; activeTabId: string | null }>('get_session');

        if (session && session.tabs && session.tabs.length > 0) {
          const restoredTabs: TabState[] = [];

          for (const t of session.tabs) {
            let content = t.content || '';
            let docType = t.documentType || 'text';

            // 如果有 filePath，尝试重新读取文件内容
            if (t.filePath) {
              try {
                const result = await invoke<OpenFileResult>('open_file', { path: t.filePath });
                content = result.content;
                docType = result.doc_type;
              } catch {
                // 文件读取失败，使用保存的 content
              }
            } else if (content.trim().length > 0) {
              try {
                const detectedType = await invoke<string>('detect_type', {
                  path: '',
                  content,
                });
                if (detectedType && detectedType !== 'text') {
                  docType = detectedType;
                }
              } catch {
                // 检测失败时保留 session 中保存的类型
              }
            }

            const isScratchDraft = !t.filePath;

            restoredTabs.push({
              id: t.id,
              title: t.title,
              filePath: t.filePath,
              docType,
              dirty: isScratchDraft ? (t.dirty || content.length > 0) : false,
              content,
              isLarge: false,
              userSetType: !!t.filePath, // 有文件路径的 tab 视为已确定类型
            });
          }

          if (restoredTabs.length > 0) {
            restoreTabs(restoredTabs, session.activeTabId);
          }
        }
      } catch {
        // 会话加载失败，使用默认空白 tab
      }

      setSessionRestored(true);
    }
    restoreState();
  }, []);

  // 获取当前活动 Tab
  const activeTab = getActiveTab();
  const viewMode = getViewMode(activeTab?.docType);

  // 保存会话数据函数
  const saveSessionNow = useCallback(async () => {
    try {
      const currentTabs = useTabStore.getState().tabs;
      const currentActiveTabId = useTabStore.getState().activeTabId;
      const sessionData = {
        tabs: currentTabs.map(tab => ({
          id: tab.id,
          title: tab.title,
          filePath: tab.filePath || null,
          documentType: tab.docType,
          dirty: tab.dirty,
          content: tab.content || '',
          autosaveFile: null,
        })),
        activeTabId: currentActiveTabId,
      };
      await invoke('save_session', { session: sessionData });
    } catch {
      // 保存失败静默处理
    }
  }, []);

  // 防抖保存会话
  const saveSessionTimer = useRef<number | null>(null);
  const saveSessionDebounced = useCallback(() => {
    if (saveSessionTimer.current) {
      clearTimeout(saveSessionTimer.current);
    }
    saveSessionTimer.current = window.setTimeout(() => {
      saveSessionNow();
    }, 3000);
  }, [saveSessionNow]);

  // 监听 tabs/activeTabId 变化，触发防抖保存
  useEffect(() => {
    if (!sessionRestored) return;
    saveSessionDebounced();
  }, [tabs, activeTabId, sessionRestored, saveSessionDebounced]);

  // 打开文件
  const handleOpenFile = useCallback(async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'XML', extensions: ['xml', 'svg', 'xhtml'] },
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: 'SQL', extensions: ['sql'] },
          { name: 'Code', extensions: ['java', 'py', 'js', 'ts', 'jsx', 'tsx'] },
        ],
      });
      if (!filePath) return;

      const result = await invoke<OpenFileResult>('open_file', { path: filePath });
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'Untitled';
      const tabId = addTab({
        title: fileName,
        filePath: filePath as string,
        docType: result.doc_type,
        content: result.content,
        isLarge: result.is_large,
        userSetType: true,
      });
      setActiveTab(tabId);
      setTreeNodes(normalizeTreeOffsets(result.content, result.tree));
      setStatusMessage('');
      setStatusIsError(false);
    } catch (err) {
      console.error('[handleOpenFile]', err);
      setStatusMessage(String(err));
      setStatusIsError(true);
    }
  }, [addTab, setActiveTab]);

  // 保存文件
  const handleSaveFile = useCallback(async () => {
    const tab = getActiveTab();
    if (!tab) return;

    try {
      let filePath = tab.filePath;
      if (!filePath) {
        const result = await save({
          filters: [{ name: 'All Files', extensions: ['*'] }],
        });
        if (!result) return;
        filePath = result;
      }

      const content = editorStore.getValue() || tab.content || '';
      await invoke('save_file', { path: filePath, content });
      updateTab(tab.id, { filePath, dirty: false, title: filePath!.split('/').pop() || 'Untitled' });
      setStatusMessage('File saved');
      setStatusIsError(false);
      // 文件保存后立即保存会话
      saveSessionNow();
    } catch (err) {
      console.error('[handleSaveFile]', err);
      setStatusMessage(String(err));
      setStatusIsError(true);
    }
  }, [getActiveTab, editorStore, updateTab, saveSessionNow]);

  const saveTabBeforeClose = useCallback(async (tab: TabState): Promise<boolean> => {
    try {
      let filePath = tab.filePath;
      if (!filePath) {
        const result = await save({
          filters: [{ name: 'All Files', extensions: ['*'] }],
        });
        if (!result) return false;
        filePath = result;
      }

      const activeId = useTabStore.getState().activeTabId;
      const content = activeId === tab.id ? (editorStore.getValue() || tab.content || '') : (tab.content || '');
      await invoke('save_file', { path: filePath, content });
      updateTab(tab.id, {
        filePath,
        content,
        dirty: false,
        title: filePath!.split('/').pop() || filePath!.split('\\').pop() || 'Untitled',
      });
      setStatusMessage('File saved');
      setStatusIsError(false);
      await saveSessionNow();
      return true;
    } catch (err) {
      console.error('[saveTabBeforeClose]', err);
      setStatusMessage(String(err));
      setStatusIsError(true);
      return false;
    }
  }, [editorStore, updateTab, saveSessionNow]);

  const discardTabChanges = useCallback(async (tab: TabState) => {
    if (!tab.filePath) {
      updateTab(tab.id, { content: '', dirty: false });
      return;
    }

    try {
      const result = await invoke<OpenFileResult>('open_file', { path: tab.filePath });
      updateTab(tab.id, {
        content: result.content,
        docType: result.doc_type,
        isLarge: result.is_large,
        dirty: false,
        title: tab.filePath.split('/').pop() || tab.filePath.split('\\').pop() || 'Untitled',
      });

      if (useTabStore.getState().activeTabId === tab.id) {
        setTreeNodes(result.tree || []);
      }
    } catch {
      updateTab(tab.id, { dirty: false });
    }
  }, [updateTab]);

  const requestSaveConfirmation = useCallback((tab: TabState, allowNoAll: boolean) => {
    if (confirmSaveResolverRef.current) {
      confirmSaveResolverRef.current('cancel');
    }

    return new Promise<ConfirmSaveChoice>((resolve) => {
      confirmSaveResolverRef.current = resolve;
      setConfirmSaveState({
        subject: getTabSaveSubject(tab),
        allowNoAll,
      });
    });
  }, []);

  const handleConfirmSaveChoice = useCallback((choice: ConfirmSaveChoice) => {
    const resolve = confirmSaveResolverRef.current;
    confirmSaveResolverRef.current = null;
    setConfirmSaveState(null);
    resolve?.(choice);
  }, []);

  // 带确认保存的关闭 tab
  const handleCloseTab = useCallback(async (id: string) => {
    const tab = useTabStore.getState().tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.dirty) {
      const choice = await requestSaveConfirmation(tab, false);
      if (choice === 'cancel') return;
      if (choice === 'yes') {
        const saved = await saveTabBeforeClose(tab);
        if (!saved) return;
      }
    }

    closeTab(id);
    await saveSessionNow();
  }, [closeTab, requestSaveConfirmation, saveSessionNow, saveTabBeforeClose]);

  // 窗口关闭前：保存会话 + 未保存提示
  useEffect(() => {
    let destroying = false;
    const forceDestroy = () => {
      if (destroying) return;
      destroying = true;
      getCurrentWindow().destroy().catch(() => {});
    };

    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();

      try {
        const dirtyTabs = useTabStore.getState().tabs.filter(t => t.filePath && t.dirty);

        if (dirtyTabs.length > 0) {
          const allowNoAll = dirtyTabs.length > 1;
          let discardRemaining = false;

          for (const dirtyTab of dirtyTabs) {
            if (discardRemaining) {
              await discardTabChanges(dirtyTab);
              continue;
            }

            const currentTab = useTabStore.getState().tabs.find(t => t.id === dirtyTab.id);
            if (!currentTab?.dirty) continue;

            const choice = await requestSaveConfirmation(currentTab, allowNoAll);
            if (choice === 'cancel') return;
            if (choice === 'yes') {
              const saved = await saveTabBeforeClose(currentTab);
              if (!saved) return;
              continue;
            }

            if (choice === 'noAll') {
              discardRemaining = true;
            }

            await discardTabChanges(currentTab);
          }
        }

        // 尝试保存，最多等 1.5 秒
        try {
          await Promise.race([
            saveSessionNow(),
            new Promise(resolve => setTimeout(resolve, 1500))
          ]);
        } catch {}
      } catch {}

      // 无论如何都销毁窗口
      forceDestroy();
    });

    return () => { unlisten.then(fn => fn()); };
  }, [discardTabChanges, requestSaveConfirmation, saveSessionNow, saveTabBeforeClose]);

  // 编辑器内容变更 — 防抖解析
  const handleEditorChange = useCallback((value: string) => {
    const tab = getActiveTab();
    if (!tab) return;

    updateTab(tab.id, { content: value, dirty: true });

    if (parseTimerRef.current) {
      clearTimeout(parseTimerRef.current);
    }
    parseTimerRef.current = window.setTimeout(async () => {
      // 自动类型检测：当 tab 是新建的（无文件路径）、类型为 text、用户未手动切换过类型
      // 且内容从空/极少变为有实质内容时触发
      if (!tab.filePath && !tab.userSetType && value.trim().length >= 5) {
        try {
          const detectedType = await invoke<string>('detect_type', {
            path: '',
            content: value,
          });
          if (detectedType && detectedType !== 'text' && detectedType !== tab.docType) {
            updateTab(tab.id, { docType: detectedType });
            const monacoLang = docTypeToMonacoLanguage[detectedType] || 'plaintext';
            editorStore.setLanguage(monacoLang);
            // 如果检测到的类型需要树视图，构建树
            if (getViewMode(detectedType) === 'SplitTree') {
              try {
                const tree = await invoke<TreeNode[] | null>('build_tree', {
                  content: value,
                  docType: detectedType,
                });
                setTreeNodes(normalizeTreeOffsets(value, tree));
              } catch {
                setTreeNodes([]);
              }
            }
            setStatusMessage('');
            setStatusIsError(false);
            return;
          }
        } catch {
          // 检测失败不影响正常流程
        }
      }

      // 正常解析流程
      try {
        // 获取最新的 tab 状态（可能已被自动检测更新）
        const currentTab = getActiveTab();
        const docType = currentTab?.docType || tab.docType;

        const parseResult = await invoke<ParseResult>('parse_document', {
          content: value,
          docType: docType,
        });
        if (parseResult.valid) {
          setStatusMessage('');
          setStatusIsError(false);
          // 构建树
          const currentViewMode = getViewMode(docType);
          if (currentViewMode === 'SplitTree') {
            const tree = await invoke<TreeNode[] | null>('build_tree', {
              content: value,
              docType: docType,
            });
            setTreeNodes(normalizeTreeOffsets(value, tree));
          }
        } else {
          const msg = parseResult.error_message || 'Parse error';
          const pos = parseResult.error_line ? ` (Line ${parseResult.error_line})` : '';
          setStatusMessage(msg + pos);
          setStatusIsError(true);
        }
      } catch (err) {
        setStatusMessage(String(err));
        setStatusIsError(true);
      }
    }, 140);
  }, [getActiveTab, updateTab, editorStore]);

  // 树节点点击 — 同步编辑器光标
  const handleTreeNodeClick = useCallback((node: TreeNode) => {
    if (!config.syncDisplay) return;
    const editor = editorStore.editorInstance;
    if (editor && node.startOffset !== undefined) {
      const model = editor.getModel();
      if (model) {
        const pos = model.getPositionAt(node.startOffset);
        editor.setPosition(pos);
        editor.revealPositionInCenter(pos);
        editor.focus();
      }
    }
  }, [editorStore.editorInstance, config.syncDisplay]);

  // 反向同步：根据 offset 查找最内层包含该位置的树节点
  const findPathForOffset = useCallback((nodes: TreeNode[], offset: number): string | null => {
    return findPathForOffsetInTree(nodes, offset);
  }, []);

  // 编辑器光标偏移变化 — 防抖反向同步到树
  const handleCursorOffsetChange = useCallback((offset: number) => {
    if (!config.syncDisplay || !treeNodes.length) return;
    if (cursorSyncTimerRef.current) {
      clearTimeout(cursorSyncTimerRef.current);
    }
    cursorSyncTimerRef.current = window.setTimeout(() => {
      const path = findPathForOffset(treeNodes, offset);
      setHighlightedPath(path || undefined);
      if (path) {
        setHighlightedSignal((signal) => signal + 1);
      }
    }, 100);
  }, [config.syncDisplay, treeNodes, findPathForOffset]);

  // 右键菜单
  const handleEditorContextMenu = useCallback((position: { x: number; y: number }) => {
    setContextMenuX(position.x);
    setContextMenuY(position.y);
    setContextMenuVisible(true);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuVisible(false);
  }, []);

  // 支持格式化/压缩的类型
  const formatableTypes = ['json', 'xml', 'sql', 'yaml', 'properties'];
  const compactableTypes = ['json', 'xml'];

  // 文档类型与扩展名映射
  const docTypeExtMap: { ext: string; docType: string }[] = [
    { ext: '.json', docType: 'json' },
    { ext: '.xml', docType: 'xml' },
    { ext: '.yaml', docType: 'yaml' },
    { ext: '.md', docType: 'markdown' },
    { ext: '.sql', docType: 'sql' },
    { ext: '.java', docType: 'java' },
    { ext: '.py', docType: 'python' },
    { ext: '.js', docType: 'javascript' },
    { ext: '.txt', docType: 'text' },
    { ext: '.log', docType: 'log' },
    { ext: '.properties', docType: 'properties' },
  ];

  // 格式化
  const handleFormat = useCallback(async () => {
    const tab = getActiveTab();
    if (!tab) return;
    try {
      const content = editorStore.getValue() || tab.content || '';
      const formatted = await invoke<string>('format_text', { content, docType: tab.docType });
      editorStore.setValue(formatted);
      updateTab(tab.id, { content: formatted, dirty: true });
      setStatusMessage('');
      setStatusIsError(false);
    } catch (err) {
      setStatusMessage(String(err));
      setStatusIsError(true);
    }
  }, [getActiveTab, editorStore, updateTab]);

  // 压缩
  const handleCompact = useCallback(async () => {
    const tab = getActiveTab();
    if (!tab) return;
    try {
      const content = editorStore.getValue() || tab.content || '';
      const compacted = await invoke<string>('compact_text', { content, docType: tab.docType });
      editorStore.setValue(compacted);
      updateTab(tab.id, { content: compacted, dirty: true });
      setStatusMessage('');
      setStatusIsError(false);
    } catch (err) {
      setStatusMessage(String(err));
      setStatusIsError(true);
    }
  }, [getActiveTab, editorStore, updateTab]);

  // 切换文档类型
  const handleSwitchDocType = useCallback(async (newDocType: string) => {
    const tab = getActiveTab();
    if (!tab) return;
    updateTab(tab.id, { docType: newDocType, userSetType: true });
    const monacoLang = docTypeToMonacoLanguage[newDocType] || 'plaintext';
    editorStore.setLanguage(monacoLang);

    // 根据新类型更新视图
    const newViewMode = getViewMode(newDocType);
    if (newViewMode === 'SplitTree' && tab.content) {
      try {
        const tree = await invoke<TreeNode[] | null>('build_tree', {
          content: tab.content,
          docType: newDocType,
        });
        setTreeNodes(normalizeTreeOffsets(tab.content, tree));
      } catch {
        setTreeNodes([]);
      }
    } else {
      setTreeNodes([]);
    }
  }, [getActiveTab, updateTab, editorStore]);

  // 切换同步
  const handleToggleSync = useCallback(() => {
    const newSync = !config.syncDisplay;
    updateConfig({ syncDisplay: newSync });
    saveConfig();
  }, [config.syncDisplay, updateConfig, saveConfig]);

  // 复制
  const handleCopy = useCallback(() => {
    const editor = editorStore.editorInstance;
    if (editor) {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (selection && model) {
        const text = model.getValueInRange(selection);
        if (text) {
          navigator.clipboard.writeText(text);
          return;
        }
      }
      // 无选区时复制全部
      navigator.clipboard.writeText(editorStore.getValue());
    }
  }, [editorStore]);

  // 粘贴
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const editor = editorStore.editorInstance;
      if (editor && text) {
        editor.trigger('contextMenu', 'type', { text });
        editor.focus();
      }
    } catch {
      // clipboard permission denied
    }
  }, [editorStore]);

  // 清空
  const handleClear = useCallback(() => {
    const tab = getActiveTab();
    if (!tab) return;
    editorStore.setValue('');
    updateTab(tab.id, { content: '', dirty: true });
  }, [getActiveTab, editorStore, updateTab]);

  // 构建右键菜单项
  const buildContextMenuItems = useCallback((): MenuItem[] => {
    const tab = getActiveTab();
    const currentDocType = tab?.docType || 'text';

    const typeSubmenu: MenuItem[] = docTypeExtMap.map(({ ext, docType }) => ({
      label: ext,
      checked: currentDocType === docType,
      action: () => handleSwitchDocType(docType),
    }));

    return [
      {
        label: '格式化',
        disabled: !formatableTypes.includes(currentDocType),
        action: handleFormat,
      },
      {
        label: '压缩',
        disabled: !compactableTypes.includes(currentDocType),
        action: handleCompact,
      },
      { label: '', separator: true },
      {
        label: '类型',
        submenu: typeSubmenu,
      },
      {
        label: '同步',
        checked: config.syncDisplay,
        action: handleToggleSync,
      },
      { label: '', separator: true },
      {
        label: '复制',
        action: handleCopy,
      },
      {
        label: '粘贴',
        action: handlePaste,
      },
      { label: '', separator: true },
      {
        label: '清空',
        action: handleClear,
      },
    ];
  }, [getActiveTab, config.syncDisplay, handleFormat, handleCompact, handleSwitchDocType, handleToggleSync, handleCopy, handlePaste, handleClear]);

  // 快捷键
  useKeyboard({
    onSave: handleSaveFile,
    onOpen: handleOpenFile,
    onNewTab: () => { addTab(); },
    onCloseTab: () => { if (activeTabId) handleCloseTab(activeTabId); },
  });

  // Tab 切换时更新树
  useEffect(() => {
    const tab = getActiveTab();
    if (tab && getViewMode(tab.docType) === 'SplitTree' && tab.content) {
      invoke<TreeNode[] | null>('build_tree', {
        content: tab.content,
        docType: tab.docType,
      }).then(tree => setTreeNodes(normalizeTreeOffsets(tab.content || '', tree))).catch(() => setTreeNodes([]));
    } else {
      setTreeNodes([]);
    }
  }, [activeTabId]);

  // 分栏拖拽
  const handleResize = useCallback((deltaX: number) => {
    setSplitRatio(prev => {
      const containerWidth = window.innerWidth;
      const newRatio = prev + deltaX / containerWidth;
      return Math.max(0.15, Math.min(0.6, newRatio));
    });
  }, []);

  const renderEditorArea = () => {
    if (!sessionRestored || !activeTab) {
      return <div className="startup-placeholder" />;
    }

    return (
      <>
        {viewMode === 'SplitTree' && (
          <>
            <div style={{ width: `${splitRatio * 100}%`, overflow: 'auto', borderRight: '1px solid var(--border)' }}>
              <TreeView
                nodes={treeNodes}
                sourceContent={activeTab.content || ''}
                onNodeClick={handleTreeNodeClick}
                highlightedPath={highlightedPath}
                highlightedSignal={highlightedSignal}
                fontSize={config.treeFontSize || 13}
              />
            </div>
            <Resizer onResize={handleResize} />
          </>
        )}
        {viewMode === 'Milkdown' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <MilkdownEditor
              ref={milkdownEditorRef}
              key={activeTab.id}
              tabId={activeTab.id}
              value={activeTab.content || ''}
              onChange={handleEditorChange}
              fontSize={config.textFontSize || 14}
            />
          </div>
        )}
        {viewMode !== 'Milkdown' && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MonacoEditor
              key={activeTab.id}
              tabId={activeTab.id}
              value={activeTab.content || ''}
              language={docTypeToMonacoLanguage[activeTab.docType || 'text'] || 'plaintext'}
              onChange={handleEditorChange}
              onCursorPositionChange={(line, col) => editorStore.setCursorPosition(line, col)}
              onCursorOffsetChange={handleCursorOffsetChange}
              onContextMenu={handleEditorContextMenu}
              fontSize={config.textFontSize || 14}
              theme={theme === 'dark' ? 'kindedit-dark' : 'kindedit-light'}
              readOnly={false}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <div className="app">
      <Toolbar
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSettings={() => setSettingsOpen(true)}
        onAbout={handleAbout}
      />
      {sessionRestored && (
        <TabBar
          tabs={tabs.map(t => ({ id: t.id, title: t.title, dirty: t.dirty, docType: t.docType }))}
          activeTabId={activeTabId}
          onSelectTab={setActiveTab}
          onCloseTab={handleCloseTab}
          onNewTab={() => addTab()}
          onReorderTabs={reorderTabs}
        />
      )}
      <div className="main-content" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {renderEditorArea()}
      </div>
      <StatusBar
        message={statusMessage}
        isError={statusIsError}
        docType={activeTab?.docType}
        cursorLine={viewMode !== 'Milkdown' ? editorStore.cursorLine : undefined}
        cursorColumn={viewMode !== 'Milkdown' ? editorStore.cursorColumn : undefined}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        onConfigChange={(partial) => {
          updateConfig(partial);
          if (partial.theme !== undefined && partial.theme !== config.theme) {
            useThemeStore.getState().setSetting(partial.theme);
          }
          saveConfig();
        }}
      />
      <AboutDialog
        open={aboutOpen}
        version={aboutVersion}
        onClose={() => setAboutOpen(false)}
      />
      <ConfirmSaveDialog
        open={!!confirmSaveState}
        subject={confirmSaveState?.subject || ''}
        allowNoAll={!!confirmSaveState?.allowNoAll}
        onChoice={handleConfirmSaveChoice}
      />
      <ContextMenu
        visible={contextMenuVisible}
        x={contextMenuX}
        y={contextMenuY}
        items={buildContextMenuItems()}
        onClose={closeContextMenu}
      />
    </div>
  );
}

// 辅助函数：根据文档类型获取视图模式
function getViewMode(docType?: string): 'Single' | 'SplitTree' | 'Milkdown' {
  switch (docType) {
    case 'json':
    case 'xml':
    case 'yaml':
      return 'SplitTree';
    case 'markdown':
      return 'Milkdown';
    default:
      return 'Single';
  }
}

export default App;
