import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from 'react';
import {
  getActiveTab,
  getBookmarkTree,
  getBookmarksApi,
  getTabsApi,
  openBookmark,
} from './lib/browser-api';
import type { BookmarkNode } from './lib/browser-api';
import {
  collectFolders,
  countBookmarks,
  countFolders,
  findNode,
  flattenVisibleNodes,
  getFolderOptions,
  isDescendant,
  isFolder,
  searchBookmarks,
} from './lib/bookmark-tree';
import type { FlatBookmarkNode, SearchResult } from './lib/bookmark-tree';

type IconName =
  | 'arrow-up-right'
  | 'bookmark'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'copy'
  | 'external'
  | 'folder'
  | 'globe'
  | 'grip'
  | 'link'
  | 'more'
  | 'move'
  | 'pencil'
  | 'plus'
  | 'search'
  | 'sparkles'
  | 'trash'
  | 'warning';

const ICON_PATHS: Record<IconName, string> = {
  'arrow-up-right': 'M7 17 17 7M8 7h9v9',
  bookmark: 'm6 3 6-1 6 1v18l-6-4-6 4V3Z',
  check: 'm5 12 4 4L19 6',
  'chevron-down': 'm5 8 7 7 7-7',
  'chevron-right': 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M18 6 6 18',
  copy: 'M8 8h10v10H8zM5 16H4V5h11v1',
  external: 'M14 4h6v6M20 4 11 13M18 13v6H4V5h6',
  folder: 'M3 6h7l2 2h9v10H3V6Z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.2 2.4 3.2 5.4 3.2 9S14.2 18.6 12 21c-2.2-2.4-3.2-5.4-3.2-9S9.8 5.4 12 3Z',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  link: 'M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7.1-7.1L10.2 5.8M14 11a5 5 0 0 0-7.1-.1l-1.4 1.4a5 5 0 0 0 7.1 7.1l1.2-1.2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  move: 'M5 9h14M15 5l4 4-4 4M19 15H5M9 11l-4 4 4 4',
  pencil: 'm4 16-.8 4.8L8 20l11.4-11.4-4-4L4 16ZM13.9 6.1l4 4',
  plus: 'M12 5v14M5 12h14',
  search: 'm20 20-4.3-4.3M10.8 18a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z',
  sparkles: 'm12 3 1.1 4.9L18 9l-4.9 1.1L12 15l-1.1-4.9L6 9l4.9-1.1L12 3ZM19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z',
  trash: 'M5 7h14M10 11v5M14 11v5M9 7V4h6v3m-9 0 1 14h10l1-14',
  warning: 'M12 3 2.7 20h18.6L12 3ZM12 9v5M12 17h.01',
};

function Icon({ name, size = 16, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={ICON_PATHS[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
    </svg>
  );
}

interface EditorValues {
  kind: 'bookmark' | 'folder';
  title: string;
  url: string;
  parentId: string;
}

type ModalState =
  | { type: 'create'; initial?: Partial<EditorValues> }
  | { type: 'edit'; nodeId: string }
  | { type: 'move'; nodeId: string }
  | { type: 'delete'; nodeId: string }
  | null;

interface DropTarget {
  id: string;
  position: 'before' | 'inside' | 'after';
}

function useBookmarkTree() {
  const [tree, setTree] = useState<BookmarkNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const versionRef = useRef(0);

  const reload = useCallback(async () => {
    const version = ++versionRef.current;
    try {
      const nextTree = await getBookmarkTree();
      if (version === versionRef.current) {
        setTree(nextTree);
        setError(null);
      }
    } catch (loadError) {
      if (version === versionRef.current) {
        setError(loadError instanceof Error ? loadError.message : '无法读取浏览器书签');
      }
    } finally {
      if (version === versionRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
    let api: ReturnType<typeof getBookmarksApi> | undefined;
    try {
      api = getBookmarksApi();
      const onChange = () => void reload();
      api.onCreated.addListener(onChange);
      api.onChanged.addListener(onChange);
      api.onMoved.addListener(onChange);
      api.onRemoved.addListener(onChange);
      return () => {
        api?.onCreated.removeListener(onChange);
        api?.onChanged.removeListener(onChange);
        api?.onMoved.removeListener(onChange);
        api?.onRemoved.removeListener(onChange);
      };
    } catch {
      return undefined;
    }
  }, [reload]);

  return { tree, loading, error, reload };
}

function useCurrentTab() {
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setActiveTab(await getActiveTab());
    } catch {
      setActiveTab(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const tabs = getTabsApi();
    const onActivated = () => void refresh();
    tabs?.onActivated?.addListener(onActivated);
    window.addEventListener('focus', onActivated);
    return () => {
      tabs?.onActivated?.removeListener(onActivated);
      window.removeEventListener('focus', onActivated);
    };
  }, [refresh]);

  return activeTab;
}

function getDisplayNodes(tree: BookmarkNode[]): BookmarkNode[] {
  if (tree.length === 1 && tree[0]?.children) {
    return tree[0].children;
  }
  return tree;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getInitialFolder(nodes: BookmarkNode[]): string {
  const preferred = nodes.find((node) => isFolder(node) && /书签栏|bookmark bar|bookmarks/i.test(node.title));
  return preferred?.id ?? getFolderOptions(nodes)[0]?.id ?? '';
}

function App() {
  const { tree, loading, error, reload } = useBookmarkTree();
  const activeTab = useCurrentTab();
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const displayNodes = useMemo(() => getDisplayNodes(tree), [tree]);
  const folders = useMemo(() => collectFolders(displayNodes), [displayNodes]);
  const visibleNodes = useMemo(() => flattenVisibleNodes(displayNodes, expanded), [displayNodes, expanded]);
  const searchResults = useMemo(() => searchBookmarks(displayNodes, searchQuery), [displayNodes, searchQuery]);
  const bookmarkCount = useMemo(() => countBookmarks(displayNodes), [displayNodes]);
  const folderCount = useMemo(() => countFolders(displayNodes), [displayNodes]);
  const activePageIsBookmarked = Boolean(activeTab && findBookmarkByUrl(displayNodes, activeTab.url));

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of folders) {
        next.add(id);
      }
      for (const id of next) {
        if (!folders.has(id)) {
          next.delete(id);
        }
      }
      return next;
    });
  }, [folders]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && modal) {
        setModal(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  useEffect(() => {
    if (!operationError) return;
    const timeout = window.setTimeout(() => setOperationError(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [operationError]);

  const runBookmarkAction = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setOperationError(null);
    try {
      await action();
      await reload();
      setModal(null);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '操作失败，请稍后重试';
      setOperationError(message);
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const handleEditorSubmit = useCallback(
    async (values: EditorValues) => {
      if (!values.title.trim() || (values.kind === 'bookmark' && !values.url.trim())) {
        return;
      }
      const api = getBookmarksApi();
      if (modal?.type === 'create') {
        await runBookmarkAction(() =>
          api.create({
            parentId: values.parentId || undefined,
            title: values.title.trim(),
            ...(values.kind === 'bookmark' ? { url: values.url.trim() } : {}),
          }),
        );
        return;
      }

      if (modal?.type === 'edit') {
        const node = findNode(tree, modal.nodeId);
        if (!node) return;
        await runBookmarkAction(async () => {
          await api.update(node.id, {
            title: values.title.trim(),
            ...(isFolder(node) ? {} : { url: values.url.trim() }),
          });
          if (values.parentId && values.parentId !== node.parentId) {
            await api.move(node.id, { parentId: values.parentId });
          }
        });
      }
    },
    [modal, runBookmarkAction, tree],
  );

  const handleMove = useCallback(
    async (parentId: string) => {
      if (modal?.type !== 'move') return;
      const node = findNode(tree, modal.nodeId);
      if (!node || !parentId || parentId === node.parentId) {
        setModal(null);
        return;
      }
      await runBookmarkAction(() => getBookmarksApi().move(node.id, { parentId }));
    },
    [modal, runBookmarkAction, tree],
  );

  const handleDelete = useCallback(async () => {
    if (modal?.type !== 'delete') return;
    const node = findNode(tree, modal.nodeId);
    if (!node) {
      setModal(null);
      return;
    }
    await runBookmarkAction(() => (isFolder(node) ? getBookmarksApi().removeTree(node.id) : getBookmarksApi().remove(node.id)));
  }, [modal, runBookmarkAction, tree]);

  const handleDrop = useCallback(
    async (sourceId: string, target: DropTarget) => {
      setDropTarget(null);
      setDraggedId(null);
      const source = findNode(tree, sourceId);
      const destination = findNode(tree, target.id);
      if (!source || !destination || source.id === destination.id) return;
      if (target.position === 'inside' && isDescendant(tree, source.id, destination.id)) return;

      let parentId: string | undefined;
      let index: number | undefined;
      if (target.position === 'inside') {
        parentId = destination.id;
        index = destination.children?.length ?? 0;
      } else {
        parentId = destination.parentId;
        const siblings = parentId ? findNode(tree, parentId)?.children ?? [] : displayNodes;
        const sourceIndex = source.index ?? siblings.findIndex((item) => item.id === source.id);
        const destinationIndex = destination.index ?? siblings.findIndex((item) => item.id === destination.id);
        index = destinationIndex + (target.position === 'after' ? 1 : 0);
        if (source.parentId === parentId && sourceIndex < index) {
          index -= 1;
        }
      }

      await runBookmarkAction(() => getBookmarksApi().move(source.id, { parentId, index }));
    },
    [displayNodes, runBookmarkAction, tree],
  );

  const handleCreateCurrentPage = () => {
    if (!activeTab || activePageIsBookmarked) return;
    setModal({ type: 'create', initial: { title: activeTab.title, url: activeTab.url, kind: 'bookmark' } });
  };

  const editorNode = modal?.type === 'edit' ? findNode(tree, modal.nodeId) : undefined;
  const movingNode = modal?.type === 'move' ? findNode(tree, modal.nodeId) : undefined;
  const deletingNode = modal?.type === 'delete' ? findNode(tree, modal.nodeId) : undefined;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Icon name="bookmark" size={18} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-title">书签</div>
            <div className="brand-subtitle">Bookmark Vault</div>
          </div>
        </div>
        <div className="sync-status" title="书签修改会由 Floccus 负责同步">
          <span className="status-dot" />
          <span>Floccus 同步</span>
        </div>
      </header>

      <section className="workspace">
        <div className="search-shell">
          <Icon name="search" size={17} />
          <input
            ref={searchRef}
            aria-label="搜索书签"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索书签或网址"
            type="search"
            value={searchQuery}
          />
          {searchQuery ? (
            <button aria-label="清除搜索" className="icon-button search-clear" onClick={() => setSearchQuery('')} type="button">
              <Icon name="close" size={14} />
            </button>
          ) : (
            <span className="keyboard-hint">⌘ K</span>
          )}
        </div>

        <section className={`quick-save-card ${!activeTab ? 'is-disabled' : ''}`}>
          <div className="quick-save-icon"><Icon name="sparkles" size={17} /></div>
          <div className="quick-save-copy">
            <span className="eyebrow">快速收藏</span>
            <strong>{activeTab?.title ?? '当前页面不可收藏'}</strong>
            <span>{activeTab ? getHostname(activeTab.url) : '请在普通网页中打开侧边栏'}</span>
          </div>
          <button
            className={`save-current-button ${activePageIsBookmarked ? 'is-saved' : ''}`}
            disabled={!activeTab || activePageIsBookmarked}
            onClick={handleCreateCurrentPage}
            type="button"
          >
            <Icon name={activePageIsBookmarked ? 'check' : 'plus'} size={15} />
            {activePageIsBookmarked ? '已收藏' : '收藏'}
          </button>
        </section>

        <div className="section-heading">
          <div>
            <span className="section-kicker">LIBRARY</span>
            <h1>我的书签</h1>
          </div>
          <button className="new-bookmark-button" onClick={() => setModal({ type: 'create' })} type="button">
            <Icon name="plus" size={16} />
            <span>新增</span>
          </button>
        </div>

        <div className="library-meta">
          <span>{bookmarkCount} 个书签</span>
          <span className="meta-separator">·</span>
          <span>{folderCount} 个文件夹</span>
          <span className="meta-spacer" />
          <button className="refresh-button" onClick={() => void reload()} type="button">
            <Icon name="arrow-up-right" size={13} />
            <span>原生书签</span>
          </button>
        </div>

        {error ? (
          <div className="error-state">
            <div className="state-icon warning"><Icon name="warning" size={20} /></div>
            <strong>无法读取书签</strong>
            <span>{error}</span>
            <button onClick={() => void reload()} type="button">重新读取</button>
          </div>
        ) : loading ? (
          <LoadingState />
        ) : searchQuery.trim() ? (
          <SearchResults
            results={searchResults}
            onEdit={(nodeId) => setModal({ type: 'edit', nodeId })}
            onMove={(nodeId) => setModal({ type: 'move', nodeId })}
            onOpen={(url) => void openBookmark(url)}
            onDelete={(nodeId) => setModal({ type: 'delete', nodeId })}
          />
        ) : visibleNodes.length ? (
          <div className="bookmark-list" onDragLeave={() => setDropTarget(null)}>
            {visibleNodes.map((node) => (
              <BookmarkRow
                key={node.id}
                draggedId={draggedId}
                dropTarget={dropTarget}
                isExpanded={expanded.has(node.id)}
                node={node}
                onDelete={(nodeId) => setModal({ type: 'delete', nodeId })}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDropTarget(null);
                }}
                onDragStart={setDraggedId}
                onDrop={(target) => void handleDrop(draggedId!, target)}
                onEdit={(nodeId) => setModal({ type: 'edit', nodeId })}
                onMove={(nodeId) => setModal({ type: 'move', nodeId })}
                onOpen={(url) => void openBookmark(url)}
                onToggle={(nodeId) => {
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(nodeId)) next.delete(nodeId);
                    else next.add(nodeId);
                    return next;
                  });
                }}
                onDragOver={setDropTarget}
              />
            ))}
            <div className="drag-help"><Icon name="grip" size={15} /> 拖动书签或文件夹即可重新排序</div>
          </div>
        ) : (
          <EmptyLibrary onCreate={() => setModal({ type: 'create' })} />
        )}
      </section>

      <footer className="app-footer">
        <span><span className="footer-dot" /> 仅使用浏览器原生书签</span>
        <span className="footer-version">v0.1</span>
      </footer>

      {operationError ? <div className="operation-toast" role="alert"><Icon name="warning" size={14} /> {operationError}</div> : null}

      {modal?.type === 'create' || modal?.type === 'edit' ? (
        <EditorModal
          busy={busy}
          initial={modal.type === 'create' ? modal.initial : undefined}
          node={editorNode}
          nodes={displayNodes}
          onClose={() => setModal(null)}
          onSubmit={handleEditorSubmit}
        />
      ) : null}
      {modal?.type === 'move' && movingNode ? (
        <MoveModal
          busy={busy}
          node={movingNode}
          nodes={displayNodes}
          onClose={() => setModal(null)}
          onSubmit={handleMove}
        />
      ) : null}
      {modal?.type === 'delete' && deletingNode ? (
        <DeleteModal busy={busy} node={deletingNode} onClose={() => setModal(null)} onConfirm={() => void handleDelete()} />
      ) : null}
    </main>
  );
}

function findBookmarkByUrl(nodes: BookmarkNode[], url: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.url === url) return node;
    const found = findBookmarkByUrl(node.children ?? [], url);
    if (found) return found;
  }
  return undefined;
}

function LoadingState() {
  return (
    <div className="loading-state" aria-label="正在读取书签">
      {[1, 2, 3, 4, 5].map((item) => <div className="skeleton-row" key={item}><span /><i /><b /></div>)}
    </div>
  );
}

function EmptyLibrary({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-orbit"><Icon name="bookmark" size={24} /></div>
      <strong>从这里开始整理</strong>
      <span>新建一个书签，或者从当前页面快速收藏。</span>
      <button onClick={onCreate} type="button"><Icon name="plus" size={15} /> 新建书签</button>
    </div>
  );
}

interface BookmarkRowProps {
  node: FlatBookmarkNode;
  isExpanded: boolean;
  draggedId: string | null;
  dropTarget: DropTarget | null;
  onToggle: (nodeId: string) => void;
  onOpen: (url: string) => void;
  onEdit: (nodeId: string) => void;
  onMove: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onDragStart: (nodeId: string) => void;
  onDragEnd: () => void;
  onDragOver: (target: DropTarget) => void;
  onDrop: (target: DropTarget) => void;
}

function BookmarkRow({
  node,
  isExpanded,
  draggedId,
  dropTarget,
  onToggle,
  onOpen,
  onEdit,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: BookmarkRowProps) {
  const folder = isFolder(node);
  const protectedRoot = folder && node.depth === 0;
  const dropPosition = dropTarget?.id === node.id ? dropTarget.position : null;
  const rowStyle = { '--depth': node.depth } as CSSProperties;

  const calculatePosition = (event: DragEvent<HTMLDivElement>): DropTarget['position'] => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
    if (folder && ratio > 0.24 && ratio < 0.76) return 'inside';
    return ratio <= 0.5 ? 'before' : 'after';
  };

  return (
    <div
      className={`bookmark-row ${draggedId === node.id ? 'is-dragged' : ''} ${dropPosition ? `drop-${dropPosition}` : ''}`}
      draggable={!protectedRoot}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        onDragOver({ id: node.id, position: calculatePosition(event) });
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(node.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop({ id: node.id, position: calculatePosition(event) });
      }}
      style={rowStyle}
    >
      <div className="bookmark-row-main">
        <span className="drag-handle" aria-hidden="true"><Icon name="grip" size={15} /></span>
        {folder ? (
          <button aria-label={`${node.title || '文件夹'}展开/收起`} className="folder-toggle" onClick={() => onToggle(node.id)} type="button">
            <span className={isExpanded ? 'chevron-expanded' : 'chevron-collapsed'}><Icon name="chevron-down" size={14} /></span>
          </button>
        ) : <span className="folder-toggle-spacer" />}
        <span className={`node-icon ${folder ? 'folder-color' : ''}`}>
          <Icon name={folder ? 'folder' : 'bookmark'} size={16} />
        </span>
        <button className="bookmark-title" onClick={() => (folder ? onToggle(node.id) : onOpen(node.url!))} title={node.title || '未命名'} type="button">
          {node.title || '未命名'}
        </button>
        <span className="row-actions">
          {!folder ? <button aria-label="打开书签" className="row-action" onClick={() => onOpen(node.url!)} title="打开" type="button"><Icon name="external" size={14} /></button> : null}
          {!protectedRoot ? <button aria-label="编辑" className="row-action" onClick={() => onEdit(node.id)} title="编辑" type="button"><Icon name="pencil" size={14} /></button> : null}
          {!protectedRoot ? <button aria-label="移动" className="row-action" onClick={() => onMove(node.id)} title="移动" type="button"><Icon name="move" size={14} /></button> : null}
          {!protectedRoot ? <button aria-label="删除" className="row-action danger-action" onClick={() => onDelete(node.id)} title="删除" type="button"><Icon name="trash" size={14} /></button> : null}
        </span>
      </div>
      {!folder ? <span className="bookmark-url">{getHostname(node.url!)}</span> : null}
    </div>
  );
}

function SearchResults({
  results,
  onOpen,
  onEdit,
  onMove,
  onDelete,
}: {
  results: SearchResult[];
  onOpen: (url: string) => void;
  onEdit: (nodeId: string) => void;
  onMove: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}) {
  if (!results.length) {
    return (
      <div className="no-results">
        <div className="state-icon"><Icon name="search" size={20} /></div>
        <strong>没有找到匹配的书签</strong>
        <span>试试标题中的其他关键词，或直接搜索网址。</span>
      </div>
    );
  }

  return (
    <div className="search-results">
      <div className="results-count">找到 {results.length} 个结果</div>
      {results.map(({ node, breadcrumb }) => (
        <div className="search-result" key={node.id}>
          <button className="result-main" onClick={() => onOpen(node.url!)} type="button">
            <span className="node-icon"><Icon name="bookmark" size={16} /></span>
            <span className="result-copy">
              <strong>{node.title || '未命名'}</strong>
              <span>{breadcrumb.join(' / ') || '我的书签'}</span>
              <em>{node.url}</em>
            </span>
          </button>
          <span className="result-actions">
            <button aria-label="编辑" className="row-action" onClick={() => onEdit(node.id)} type="button"><Icon name="pencil" size={14} /></button>
            <button aria-label="移动" className="row-action" onClick={() => onMove(node.id)} type="button"><Icon name="move" size={14} /></button>
            <button aria-label="删除" className="row-action danger-action" onClick={() => onDelete(node.id)} type="button"><Icon name="trash" size={14} /></button>
          </span>
        </div>
      ))}
    </div>
  );
}

function ModalFrame({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section aria-modal="true" className={`modal-card ${wide ? 'modal-wide' : ''}`} onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-header">
          <div><span className="section-kicker">{eyebrow}</span><h2>{title}</h2></div>
          <button aria-label="关闭" className="icon-button modal-close" onClick={onClose} type="button"><Icon name="close" size={17} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function EditorModal({
  busy,
  initial,
  node,
  nodes,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  initial?: Partial<EditorValues>;
  node?: BookmarkNode;
  nodes: BookmarkNode[];
  onClose: () => void;
  onSubmit: (values: EditorValues) => Promise<void>;
}) {
  const editing = Boolean(node);
  const folderOptions = getFolderOptions(nodes, node && isFolder(node) ? node.id : undefined);
  const [values, setValues] = useState<EditorValues>(() => ({
    kind: node ? (isFolder(node) ? 'folder' : 'bookmark') : initial?.kind ?? 'bookmark',
    title: node?.title ?? initial?.title ?? '',
    url: node?.url ?? initial?.url ?? '',
    parentId: node?.parentId ?? initial?.parentId ?? getInitialFolder(nodes),
  }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <ModalFrame eyebrow={editing ? 'EDIT BOOKMARK' : 'NEW BOOKMARK'} onClose={onClose} title={editing ? '编辑书签' : '新增内容'}>
      <form className="editor-form" onSubmit={(event) => void submit(event)}>
        {!editing ? (
          <div className="type-switch" role="group" aria-label="内容类型">
            <button className={values.kind === 'bookmark' ? 'selected' : ''} onClick={() => setValues((current) => ({ ...current, kind: 'bookmark' }))} type="button"><Icon name="bookmark" size={15} />书签</button>
            <button className={values.kind === 'folder' ? 'selected' : ''} onClick={() => setValues((current) => ({ ...current, kind: 'folder' }))} type="button"><Icon name="folder" size={15} />文件夹</button>
          </div>
        ) : null}
        <label className="field-label">名称<input autoFocus onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} placeholder={values.kind === 'folder' ? '例如：待读文章' : '给这个书签起个名字'} required type="text" value={values.title} /></label>
        {values.kind === 'bookmark' ? (
          <label className="field-label">网址<div className="input-with-icon"><Icon name="link" size={15} /><input onChange={(event) => setValues((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.com" required type="url" value={values.url} /></div></label>
        ) : null}
        <label className="field-label">保存到<select onChange={(event) => setValues((current) => ({ ...current, parentId: event.target.value }))} value={values.parentId}>
          {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.title || '未命名文件夹'}</option>)}
        </select></label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={busy || !values.title.trim() || (values.kind === 'bookmark' && !values.url.trim())} type="submit">
            {busy ? '保存中…' : editing ? '保存修改' : '创建'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function MoveModal({
  busy,
  node,
  nodes,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  node: BookmarkNode;
  nodes: BookmarkNode[];
  onClose: () => void;
  onSubmit: (parentId: string) => Promise<void>;
}) {
  const folderOptions = getFolderOptions(nodes, isFolder(node) ? node.id : undefined);
  const [parentId, setParentId] = useState(node.parentId ?? folderOptions[0]?.id ?? '');
  return (
    <ModalFrame eyebrow="MOVE ITEM" onClose={onClose} title="移动到文件夹">
      <form className="editor-form" onSubmit={(event) => { event.preventDefault(); void onSubmit(parentId); }}>
        <div className="move-preview"><span className={`node-icon ${isFolder(node) ? 'folder-color' : ''}`}><Icon name={isFolder(node) ? 'folder' : 'bookmark'} size={18} /></span><span><strong>{node.title || '未命名'}</strong><small>选择新的保存位置</small></span></div>
        <label className="field-label">目标文件夹<select onChange={(event) => setParentId(event.target.value)} value={parentId}>{folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.title || '未命名文件夹'}</option>)}</select></label>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="primary-button" disabled={busy || !parentId} type="submit">{busy ? '移动中…' : '移动'}</button></div>
      </form>
    </ModalFrame>
  );
}

function DeleteModal({ busy, node, onClose, onConfirm }: { busy: boolean; node: BookmarkNode; onClose: () => void; onConfirm: () => void }) {
  const folder = isFolder(node);
  return (
    <ModalFrame eyebrow="DELETE ITEM" onClose={onClose} title={folder ? '删除文件夹？' : '删除书签？'}>
      <div className="delete-content"><div className="delete-icon"><Icon name="trash" size={20} /></div><p>确定要删除 <strong>{node.title || '未命名'}</strong> 吗？{folder ? '文件夹中的内容也会一并删除。' : ''}</p></div>
      <div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="danger-button" disabled={busy} onClick={onConfirm} type="button">{busy ? '删除中…' : '确认删除'}</button></div>
    </ModalFrame>
  );
}

export default App;
