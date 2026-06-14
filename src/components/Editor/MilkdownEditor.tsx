import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, commandsCtx, prosePluginsCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { prism } from '@milkdown/plugin-prism';
import { history } from '@milkdown/kit/plugin/history';
import { redo, undo } from '@milkdown/kit/prose/history';
import { nord } from '@milkdown/theme-nord';
import { $shortcut } from '@milkdown/kit/utils';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view';
import {
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  sinkListItemCommand,
  liftListItemCommand,
} from '@milkdown/kit/preset/commonmark';
import { toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';

import './milkdownTheme.css';

interface MilkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
  onFontSizeChange?: (fontSize: number) => void;
  tabId: string;
}

export interface MilkdownEditorHandle {
  undo: () => boolean;
  redo: () => boolean;
  focus: () => void;
}

interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

interface SearchMatch {
  from: number;
  to: number;
}

interface SearchDecorationsMeta extends SearchOptions {
  activeIndex: number;
}

const searchPluginKey = new PluginKey<DecorationSet>('milkdown-search');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchRegExp(options: SearchOptions): RegExp | null {
  if (!options.query) return null;

  const source = options.regex ? options.query : escapeRegExp(options.query);
  const pattern = options.wholeWord ? `\\b(?:${source})\\b` : source;
  const flags = options.caseSensitive ? 'g' : 'gi';

  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function collectSearchMatches(doc: ProseMirrorNode, options: SearchOptions): SearchMatch[] {
  const regexp = buildSearchRegExp(options);
  if (!regexp) return [];

  const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    regexp.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regexp.exec(node.text)) !== null) {
      const matchedText = match[0];
      if (!matchedText) {
        regexp.lastIndex += 1;
        continue;
      }

      matches.push({
        from: pos + match.index,
        to: pos + match.index + matchedText.length,
      });
    }
  });

  return matches;
}

function buildSearchDecorations(doc: ProseMirrorNode, meta: SearchDecorationsMeta): DecorationSet {
  const matches = collectSearchMatches(doc, meta);
  const decorations = matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class: index === meta.activeIndex
        ? 'milkdown-search-match milkdown-search-match-active'
        : 'milkdown-search-match',
    })
  );

  return DecorationSet.create(doc, decorations);
}

function createSearchPlugin(onViewReady: (view: EditorView | null) => void) {
  return new Plugin<DecorationSet>({
    key: searchPluginKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, previous) => {
        const meta = tr.getMeta(searchPluginKey) as SearchDecorationsMeta | undefined;
        if (meta) return buildSearchDecorations(tr.doc, meta);
        return previous.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return searchPluginKey.getState(state);
      },
    },
    view(view) {
      onViewReady(view);
      return {
        update(nextView) {
          onViewReady(nextView);
        },
        destroy() {
          onViewReady(null);
        },
      };
    },
  });
}

/**
 * Inner editor component that uses MilkdownProvider context.
 */
const MilkdownEditorInner = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(({
  value,
  onChange,
  fontSize = 14,
  onFontSizeChange,
}, ref) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track whether this is the initial load to avoid echoing back the first content
  const isFirstRender = useRef(true);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  const getSearchOptions = useCallback((): SearchOptions => ({
    query,
    caseSensitive,
    wholeWord,
    regex,
  }), [caseSensitive, query, regex, wholeWord]);

  useImperativeHandle(ref, () => ({
    undo: () => {
      const view = editorViewRef.current;
      if (!view) return false;
      const handled = undo(view.state, view.dispatch, view);
      if (handled) view.focus();
      return handled;
    },
    redo: () => {
      const view = editorViewRef.current;
      if (!view) return false;
      const handled = redo(view.state, view.dispatch, view);
      if (handled) view.focus();
      return handled;
    },
    focus: () => {
      editorViewRef.current?.focus();
    },
  }), []);

  const updateSearchDecorations = useCallback((nextActiveIndex = activeIndex) => {
    const view = editorViewRef.current;
    if (!view) return;

    const options = getSearchOptions();
    const matches = collectSearchMatches(view.state.doc, options);
    const normalizedIndex = matches.length === 0 ? 0 : ((nextActiveIndex % matches.length) + matches.length) % matches.length;
    setMatchCount(matches.length);
    setActiveIndex(normalizedIndex);
    view.dispatch(view.state.tr.setMeta(searchPluginKey, {
      ...options,
      activeIndex: normalizedIndex,
    } satisfies SearchDecorationsMeta));
  }, [activeIndex, getSearchOptions]);

  const focusActiveMatch = useCallback((nextActiveIndex: number) => {
    const view = editorViewRef.current;
    if (!view) return;

    const matches = collectSearchMatches(view.state.doc, getSearchOptions());
    if (matches.length === 0) {
      updateSearchDecorations(0);
      return;
    }

    const normalizedIndex = ((nextActiveIndex % matches.length) + matches.length) % matches.length;
    const match = matches[normalizedIndex];
    const tr = view.state.tr
      .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
      .scrollIntoView()
      .setMeta(searchPluginKey, {
        ...getSearchOptions(),
        activeIndex: normalizedIndex,
      } satisfies SearchDecorationsMeta);

    view.dispatch(tr);
    view.focus();
    setActiveIndex(normalizedIndex);
    setMatchCount(matches.length);
  }, [getSearchOptions, updateSearchDecorations]);

  const openFind = useCallback((withReplace = false) => {
    setFindOpen(true);
    if (withReplace) setReplaceOpen(true);
    window.setTimeout(() => {
      wrapperRef.current?.querySelector<HTMLInputElement>('.milkdown-find-input')?.focus();
      wrapperRef.current?.querySelector<HTMLInputElement>('.milkdown-find-input')?.select();
    }, 0);
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setReplaceOpen(false);
    setQuery('');
    setMatchCount(0);
    setActiveIndex(0);
    const view = editorViewRef.current;
    if (view) {
      view.dispatch(view.state.tr.setMeta(searchPluginKey, {
        query: '',
        caseSensitive,
        wholeWord,
        regex,
        activeIndex: 0,
      } satisfies SearchDecorationsMeta));
      view.focus();
    }
  }, [caseSensitive, regex, wholeWord]);

  const replaceCurrent = useCallback(() => {
    const view = editorViewRef.current;
    if (!view || matchCount === 0) return;

    const matches = collectSearchMatches(view.state.doc, getSearchOptions());
    const match = matches[activeIndex];
    if (!match) return;

    view.dispatch(view.state.tr.insertText(replaceValue, match.from, match.to));
    const nextIndex = Math.min(activeIndex, Math.max(0, matches.length - 2));
    window.setTimeout(() => focusActiveMatch(nextIndex), 0);
  }, [activeIndex, focusActiveMatch, getSearchOptions, matchCount, replaceValue]);

  const replaceAll = useCallback(() => {
    const view = editorViewRef.current;
    if (!view || matchCount === 0) return;

    const matches = collectSearchMatches(view.state.doc, getSearchOptions());
    let tr = view.state.tr;
    for (const match of [...matches].reverse()) {
      tr = tr.insertText(replaceValue, match.from, match.to);
    }
    view.dispatch(tr);
    window.setTimeout(() => updateSearchDecorations(0), 0);
  }, [getSearchOptions, matchCount, replaceValue, updateSearchDecorations]);

  useEffect(() => {
    if (!findOpen) return;
    updateSearchDecorations(activeIndex);
  }, [activeIndex, findOpen, query, caseSensitive, wholeWord, regex, value, updateSearchDecorations]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`;
      const isMac = /mac|iphone|ipad|ipod/i.test(platform);
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const isFindShortcut = mod && !event.altKey && key === 'f';
      const isReplaceShortcut = isMac
        ? event.metaKey && event.altKey && key === 'f'
        : event.ctrlKey && key === 'h';

      if (isFindShortcut) {
        event.preventDefault();
        event.stopPropagation();
        openFind(false);
        return;
      }

      if (isReplaceShortcut) {
        event.preventDefault();
        event.stopPropagation();
        openFind(true);
        return;
      }

      if (findOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeFind();
      }
    };

    wrapper.addEventListener('keydown', handleKeyDown, true);
    return () => wrapper.removeEventListener('keydown', handleKeyDown, true);
  }, [closeFind, findOpen, openFind]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || !onFontSizeChange) return;

    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 1 : -1;
    onFontSizeChange(fontSize + delta);
  }, [fontSize, onFontSizeChange]);

  // Custom Typora-style keyboard shortcuts
  const typoraShortcuts = $shortcut((ctx) => {
    const commands = ctx.get(commandsCtx);

    const keymap: Record<string, () => boolean> = {
      // Heading shortcuts: Mod-1 ~ Mod-6
      'Mod-1': () => commands.call(wrapInHeadingCommand.key, 1),
      'Mod-2': () => commands.call(wrapInHeadingCommand.key, 2),
      'Mod-3': () => commands.call(wrapInHeadingCommand.key, 3),
      'Mod-4': () => commands.call(wrapInHeadingCommand.key, 4),
      'Mod-5': () => commands.call(wrapInHeadingCommand.key, 5),
      'Mod-6': () => commands.call(wrapInHeadingCommand.key, 6),

      // Mod-0: Turn into paragraph (cancel heading)
      'Mod-0': () => commands.call(turnIntoTextCommand.key),

      // Formatting (Mod-B and Mod-I are built-in via commonmark keymap,
      // but we ensure they're accessible)
      // Cmd+U → underline (not standard in Markdown, toggle via HTML-like mark or skip)
      // For now we implement what's available in GFM/Commonmark:

      // Cmd+Shift+` → inline code
      'Mod-Shift-`': () => commands.call(toggleInlineCodeCommand.key),

      // Cmd+Shift+X → strikethrough
      'Mod-Shift-x': () => commands.call(toggleStrikethroughCommand.key),
      'Mod-Shift-X': () => commands.call(toggleStrikethroughCommand.key),

      // Paragraph & list shortcuts
      // Cmd+Shift+K → code block
      'Mod-Shift-k': () => commands.call(createCodeBlockCommand.key),
      'Mod-Shift-K': () => commands.call(createCodeBlockCommand.key),

      // Cmd+Shift+O → ordered list
      'Mod-Shift-o': () => commands.call(wrapInOrderedListCommand.key),
      'Mod-Shift-O': () => commands.call(wrapInOrderedListCommand.key),

      // Cmd+Shift+U → unordered list
      'Mod-Shift-u': () => commands.call(wrapInBulletListCommand.key),
      'Mod-Shift-U': () => commands.call(wrapInBulletListCommand.key),

      // Cmd+Shift+. → blockquote
      'Mod-Shift-.': () => commands.call(wrapInBlockquoteCommand.key),

      // Cmd+Shift+] → increase indent (sink list item)
      'Mod-Shift-]': () => commands.call(sinkListItemCommand.key),

      // Cmd+Shift+[ → decrease indent (lift list item)
      'Mod-Shift-[': () => commands.call(liftListItemCommand.key),

      // Insert shortcuts
      // Cmd+K → insert link
      'Mod-k': () => commands.call(toggleLinkCommand.key, { href: '' }),
      'Mod-K': () => commands.call(toggleLinkCommand.key, { href: '' }),

      // Cmd+- → insert horizontal rule
      'Mod--': () => commands.call(insertHrCommand.key),
    };

    return keymap;
  });

  useEditor((root) => {
    const editor = Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);

        // Setup listener for content changes
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
          }
          if (markdown !== prevMarkdown) {
            onChangeRef.current(markdown);
          }
        });
      })
      .config((ctx) => {
        ctx.update(prosePluginsCtx, (plugins) => [
          ...plugins,
          createSearchPlugin((view) => {
            editorViewRef.current = view;
          }),
        ]);
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(prism)
      .use(typoraShortcuts);

    return editor;
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="milkdown-editor-wrapper"
      onWheel={handleWheel}
      style={{ fontSize: `${fontSize}px` }}
    >
      {findOpen && (
        <div className="milkdown-find-widget" role="search">
          <div className="milkdown-find-row">
            <input
              className="milkdown-find-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  focusActiveMatch(activeIndex + (event.shiftKey ? -1 : 1));
                }
              }}
              placeholder="Find"
            />
            <button
              className={caseSensitive ? 'active' : ''}
              type="button"
              title="Match case"
              onClick={() => setCaseSensitive((enabled) => !enabled)}
            >
              Aa
            </button>
            <button
              className={wholeWord ? 'active' : ''}
              type="button"
              title="Match whole word"
              onClick={() => setWholeWord((enabled) => !enabled)}
            >
              ab
            </button>
            <button
              className={regex ? 'active' : ''}
              type="button"
              title="Use regular expression"
              onClick={() => setRegex((enabled) => !enabled)}
            >
              .*
            </button>
            <span className="milkdown-find-count">
              {query ? `${matchCount === 0 ? 0 : activeIndex + 1}/${matchCount}` : 'No results'}
            </span>
            <button type="button" title="Previous match" onClick={() => focusActiveMatch(activeIndex - 1)}>
              ↑
            </button>
            <button type="button" title="Next match" onClick={() => focusActiveMatch(activeIndex + 1)}>
              ↓
            </button>
            <button type="button" title="Toggle replace" onClick={() => setReplaceOpen((open) => !open)}>
              =
            </button>
            <button type="button" title="Close" onClick={closeFind}>
              ×
            </button>
          </div>
          {replaceOpen && (
            <div className="milkdown-find-row milkdown-replace-row">
              <input
                value={replaceValue}
                onChange={(event) => setReplaceValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    replaceCurrent();
                  }
                }}
                placeholder="Replace"
              />
              <button type="button" onClick={replaceCurrent} disabled={matchCount === 0}>
                Replace
              </button>
              <button type="button" onClick={replaceAll} disabled={matchCount === 0}>
                All
              </button>
            </div>
          )}
        </div>
      )}
      <Milkdown />
    </div>
  );
});

/**
 * MilkdownEditor - A Typora-style WYSIWYG Markdown editor component.
 *
 * Uses key-based remounting when tabId changes to reinitialize
 * the editor with new content.
 */
const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>((props, ref) => {
  return (
    <MilkdownProvider key={props.tabId}>
      <MilkdownEditorInner {...props} ref={ref} />
    </MilkdownProvider>
  );
});

MilkdownEditorInner.displayName = 'MilkdownEditorInner';
MilkdownEditor.displayName = 'MilkdownEditor';

export default MilkdownEditor;
