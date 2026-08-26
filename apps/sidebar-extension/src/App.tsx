import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  Globe,
  GripVertical,
  Link2,
  MoreHorizontal,
  Move,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react';
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
import { getSiteFaviconUrl } from './lib/site-favicon';
import type { FlatBookmarkNode, SearchResult } from './lib/bookmark-tree';
import {
  clearBackendConnection,
  connectWithPairingCode,
  getBackendBookmarks,
  loadBackendConnection,
} from './lib/backend';
import type { BackendBookmarkTree, BackendConnection } from './lib/backend';

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
  | 'settings'
  | 'sparkles'
  | 'trash'
  | 'warning';

function Icon({ name, size = 16, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  switch (name) {
    case 'arrow-up-right':
      return <ArrowUpRight size={size} strokeWidth={strokeWidth} />;
    case 'bookmark':
      return <Bookmark size={size} strokeWidth={strokeWidth} />;
    case 'check':
      return <Check size={size} strokeWidth={strokeWidth} />;
    case 'chevron-down':
      return <ChevronDown size={size} strokeWidth={strokeWidth} />;
    case 'chevron-right':
      return <ChevronRight size={size} strokeWidth={strokeWidth} />;
    case 'close':
      return <X size={size} strokeWidth={strokeWidth} />;
    case 'copy':
      return <Copy size={size} strokeWidth={strokeWidth} />;
    case 'external':
      return <ExternalLink size={size} strokeWidth={strokeWidth} />;
    case 'folder':
      return <Folder size={size} strokeWidth={strokeWidth} />;
    case 'globe':
      return <Globe size={size} strokeWidth={strokeWidth} />;
    case 'grip':
      return <GripVertical size={size} strokeWidth={strokeWidth} />;
    case 'link':
      return <Link2 size={size} strokeWidth={strokeWidth} />;
    case 'more':
      return <MoreHorizontal size={size} strokeWidth={strokeWidth} />;
    case 'move':
      return <Move size={size} strokeWidth={strokeWidth} />;
    case 'pencil':
      return <Pencil size={size} strokeWidth={strokeWidth} />;
    case 'plus':
      return <Plus size={size} strokeWidth={strokeWidth} />;
    case 'search':
      return <Search size={size} strokeWidth={strokeWidth} />;
    case 'settings':
      return <Settings size={size} strokeWidth={strokeWidth} />;
    case 'sparkles':
      return <Sparkles size={size} strokeWidth={strokeWidth} />;
    case 'trash':
      return <Trash2 size={size} strokeWidth={strokeWidth} />;
    case 'warning':
      return <AlertTriangle size={size} strokeWidth={strokeWidth} />;
    default:
      return <Bookmark size={size} strokeWidth={strokeWidth} />;
  }
}

function BrandLogo({ size = 20 }: { size?: number }) {
  return (
    <img
      alt="Wotty Bookmark Logo"
      className="brand-logo-img"
      height={size}
      src="/logo.png"
      width={size}
    />
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
  const [backendConnection, setBackendConnection] = useState<BackendConnection | null>(null);
  const [backendTree, setBackendTree] = useState<BackendBookmarkTree | null>(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
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

  const refreshBackend = useCallback(async (connection: BackendConnection) => {
    setBackendLoading(true);
    setBackendError(null);
    try {
      setBackendTree(await getBackendBookmarks(connection));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '读取后台书签失败';
      setBackendError(message);
      if (/登录|授权|token|unauthorized|401/i.test(message)) {
        await clearBackendConnection();
        setBackendConnection(null);
        setBackendTree(null);
      }
    } finally {
      setBackendLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackendConnection().then((connection) => {
      setBackendConnection(connection);
      if (connection) void refreshBackend(connection);
    });
  }, [refreshBackend]);

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
          <div className="brand-mark"><BrandLogo size={18} /></div>
          <div>
            <div className="brand-title">书签</div>
            <div className="brand-subtitle">WOTTY BOOKMARK</div>
          </div>
        </div>
        <button className={`sync-status ${backendConnection ? 'is-connected' : 'is-disconnected'}`} onClick={() => setConnectionOpen(true)} title="连接 WOTTY BOOKMARK 后台" type="button">
          <span className="status-dot" />
          <span>{backendConnection ? `后台已连接${backendTree ? ` · ${backendTree.bookmarks.length}` : ''}` : '连接后台'}</span>
          <Icon name="settings" size={12} />
        </button>
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
        {backendConnection && backendTree ? <p className="backend-sync-note">后台索引 {backendTree.bookmarks.length} 个书签 · Floccus 负责跨浏览器同步 · {backendLoading ? '刷新中…' : '已连接'}</p> : null}

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
        <span className="footer-version">v0.1.2</span>
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
      {connectionOpen ? (
        <ConnectionModal
          busy={backendLoading}
          connection={backendConnection}
          error={backendError}
          tree={backendTree}
          onClose={() => setConnectionOpen(false)}
          onConnect={async (code) => {
            setBackendLoading(true);
            setBackendError(null);
            try {
              const connection = await connectWithPairingCode(code);
              setBackendConnection(connection);
              setBackendTree(await getBackendBookmarks(connection));
            } catch (connectError) {
              setBackendError(connectError instanceof Error ? connectError.message : '侧边栏连接失败');
            } finally {
              setBackendLoading(false);
            }
          }}
          onDisconnect={async () => {
            await clearBackendConnection();
            setBackendConnection(null);
            setBackendTree(null);
            setBackendError(null);
          }}
          onRefresh={() => backendConnection ? refreshBackend(backendConnection) : Promise.resolve()}
        />
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

const faviconStatus = new Map<string, 'loaded' | 'failed'>();

function SiteFavicon({ url, size = 16 }: { url: string; size?: number }) {
  const faviconUrl = getSiteFaviconUrl(url);
  const [failed, setFailed] = useState(() => !faviconUrl || faviconStatus.get(faviconUrl) === 'failed');

  useEffect(() => {
    setFailed(!faviconUrl || faviconStatus.get(faviconUrl) === 'failed');
  }, [faviconUrl]);

  if (!faviconUrl || failed) {
    return <Icon name="bookmark" size={size} />;
  }

  return <img alt="" className="site-favicon" height={size} onError={() => { faviconStatus.set(faviconUrl, 'failed'); setFailed(true); }} onLoad={() => faviconStatus.set(faviconUrl, 'loaded')} src={faviconUrl} width={size} />;
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
          {folder ? <Icon name="folder" size={16} /> : <SiteFavicon size={16} url={node.url!} />}
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
            <span className="node-icon"><SiteFavicon size={16} url={node.url!} /></span>
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

function ConnectionModal({
  busy,
  connection,
  error,
  tree,
  onClose,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  busy: boolean;
  connection: BackendConnection | null;
  error: string | null;
  tree: BackendBookmarkTree | null;
  onClose: () => void;
  onConnect: (code: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  return (
    <ModalFrame eyebrow="BACKEND CONNECTION" onClose={onClose} title="连接 WOTTY BOOKMARK">
      {connection ? (
        <div className="connection-content">
          <div className="connection-status-card">
            <span className="connection-status-icon"><Icon name="check" size={19} /></span>
            <div><strong>后台已连接</strong><span>{tree ? `${tree.bookmarks.length} 个书签已读取` : '正在读取书签索引…'}</span></div>
          </div>
          <dl className="connection-details">
            <div><dt>账号</dt><dd>{connection.loginIdentifier}</dd></div>
            <div><dt>后台地址</dt><dd>{connection.serverUrl}</dd></div>
          </dl>
          {error ? <p className="connection-error" role="alert">{error}</p> : null}
          <p className="connection-help">侧边栏仍操作当前浏览器的原生书签；Floccus负责把这些书签同步到其他浏览器。后台连接用于确认服务器索引和登录状态。</p>
          <div className="modal-actions connection-actions">
            <button className="secondary-button" disabled={busy} onClick={() => void onRefresh()} type="button">{busy ? '刷新中…' : '刷新后台索引'}</button>
            <button className="danger-button" disabled={disconnecting} onClick={() => { setDisconnecting(true); void onDisconnect().finally(() => setDisconnecting(false)); }} type="button">{disconnecting ? '断开中…' : '断开连接'}</button>
          </div>
        </div>
      ) : (
        <form className="editor-form connection-form" onSubmit={(event) => { event.preventDefault(); void onConnect(code); }}>
          <div className="connection-intro"><span className="connection-status-icon"><Icon name="settings" size={18} /></span><div><strong>不用再填写 WebDAV 密码</strong><p>在管理后台的「Floccus 配置」页面生成一次性连接码，复制后粘贴到这里。</p></div></div>
          <label className="field-label">后台连接码<textarea autoFocus onChange={(event) => setCode(event.target.value)} placeholder="bvpair.v1...." required rows={4} value={code} /></label>
          {error ? <p className="connection-error" role="alert">{error}</p> : null}
          <p className="connection-help">连接码 10 分钟内有效，只能使用一次。连接后不会保存 WebDAV 应用密码或登录密码。</p>
          <div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="primary-button" disabled={busy || !code.trim()} type="submit">{busy ? '连接中…' : '连接后台'}</button></div>
        </form>
      )}
    </ModalFrame>
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
        <div className="move-preview"><span className={`node-icon ${isFolder(node) ? 'folder-color' : ''}`}>{isFolder(node) ? <Icon name="folder" size={18} /> : <SiteFavicon size={18} url={node.url!} />}</span><span><strong>{node.title || '未命名'}</strong><small>选择新的保存位置</small></span></div>
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
