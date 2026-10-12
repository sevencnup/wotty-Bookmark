import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bookmark, Check, ChevronDown, ChevronRight, Folder, FolderOpen, Globe, LayoutPanelTop, LoaderCircle, LogIn, PanelTopOpen, Pencil, Plus, RefreshCw, Search, Server, Trash2, X } from 'lucide-react';
import { getActiveTab, getTabsApi, openBookmark } from './lib/browser-api';
import type { BookmarkNode } from './lib/browser-api';
import { createBrowserBookmark, createBrowserFolder, deleteBrowserNode, getBrowserLibrary, moveBrowserNode, updateBrowserNode } from './lib/browser-library';
import { collectFolders, countBookmarks, countFolders, findNode, flattenVisibleNodes, getFolderOptions, isFolder, searchBookmarks } from './lib/bookmark-tree';
import type { FlatBookmarkNode } from './lib/bookmark-tree';
import { clearBackendConnection, connectToBackend, loadBackendConnection } from './lib/backend';
import type { BackendConnection } from './lib/backend';
import { createLibraryBookmark, createLibraryFolder, deleteLibraryNode, getLibrary, moveLibraryNode, updateLibraryNode } from './lib/library';
import type { LibraryFolder, LibraryTree } from './lib/library';
import { loadSiteFavicon } from './lib/site-favicon';
import { loadSidebarLocale, loadSidebarSourceMode, refreshSidebarPreferences } from './lib/preferences';
import type { SidebarLocale, SidebarSourceMode } from './lib/preferences';
import { loadCompactToolbar, saveCompactToolbar } from './lib/layout-preferences';
import { getVariableVirtualWindow, getVirtualWindow } from './lib/virtual-list';
import { FolderPickerDropdown } from './components/FolderPickerDropdown';
import type { FolderOption } from './components/FolderPickerDropdown';
import { SidebarUiLocalization } from './sidebar-i18n';

type Modal = { type: 'connect' } | { type: 'create'; kind: 'bookmark' | 'folder'; parentId?: string } | { type: 'edit' | 'move' | 'delete'; nodeId: string } | null;
type Editor = { kind: 'bookmark' | 'folder'; title: string; url: string; parentId: string };
type RefreshOptions = { silent?: boolean };
const AUTO_REFRESH_INTERVAL_MS = 10_000;
const LANGUAGE_REFRESH_INTERVAL_MS = 10 * 60_000;
const FOLDER_ROW_HEIGHT = 34;
const BOOKMARK_ROW_HEIGHT = 34;
const SEARCH_ROW_HEIGHT = 44;

function toNodes(tree: LibraryTree): BookmarkNode[] {
  const build = (folder: LibraryFolder): BookmarkNode => ({ id: folder.id, title: folder.title, children: folder.children.map(build) });
  const roots = tree.folders.map(build);
  const folders = new Map<string, BookmarkNode>();
  const collect = (items: BookmarkNode[]) => items.forEach((item) => { if (item.children) { folders.set(item.id, item); collect(item.children); } });
  collect(roots);
  for (const bookmark of tree.bookmarks) {
    const node: BookmarkNode = { id: bookmark.id, title: bookmark.title, url: bookmark.url, parentId: bookmark.parentId ?? undefined };
    const parent = bookmark.parentId ? folders.get(bookmark.parentId) : undefined;
    if (parent?.children) parent.children.push(node); else roots.push(node);
  }
  return roots;
}

function hostname(value: string) { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; } }

function scrollToTop(workspace: HTMLElement | null) {
  if (workspace) {
    workspace.scrollTop = 0;
    try { workspace.scrollTo({ top: 0, behavior: 'auto' }); } catch { workspace.scrollTop = 0; }
  }
  if (typeof document !== 'undefined') {
    const root = document.scrollingElement;
    if (root && root !== workspace) {
      root.scrollTop = 0;
      try { root.scrollTo({ top: 0, behavior: 'auto' }); } catch { root.scrollTop = 0; }
    }
  }
  if (typeof window !== 'undefined') {
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch { try { window.scrollTo(0, 0); } catch { /* 某些扩展环境禁用窗口滚动时，工作区和文档根节点仍已回顶 */ } }
  }
}

function flattenLibraryFolders(folders: LibraryFolder[], depth = 0): Array<LibraryFolder & { depth: number }> {
  return folders.flatMap((folder) => [{ ...folder, depth }, ...flattenLibraryFolders(folder.children, depth + 1)]);
}

function formatSyncTime(value: Date | null) {
  if (!value) return '尚未同步';
  const elapsed = Math.max(0, Date.now() - value.getTime());
  if (elapsed < 60_000) return '刚刚同步';
  return `同步于 ${value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function App() {
  const [connection, setConnection] = useState<BackendConnection | null>(null);
  const [locale, setLocale] = useState<SidebarLocale>('zh-CN');
  const [sourceMode, setSourceMode] = useState<SidebarSourceMode>('server');
  const [tree, setTree] = useState<LibraryTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);
  const [quickSaveFolder, setQuickSaveFolder] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [compactToolbar, setCompactToolbar] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const refreshInFlightRef = useRef(false);
  const workspaceRef = useRef<HTMLElement>(null);

  const handleScroll = useCallback(() => {
    const el = workspaceRef.current;
    if (el) {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight || 600);
    }
  }, []);
  useEffect(() => { void loadCompactToolbar().then(setCompactToolbar).catch(() => undefined); }, []);

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight || 600);
    el.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [handleScroll]);

  const refresh = useCallback(async (current = connection, { silent = false }: RefreshOptions = {}, requestedMode = sourceMode) => {
    if (requestedMode === 'server' && !current) { setTree(null); setLoading(false); setLastSyncedAt(null); return; }
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setTree(requestedMode === 'browser' ? await getBrowserLibrary() : await getLibrary(current!));
      setLastSyncedAt(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : requestedMode === 'browser' ? '无法读取浏览器书签' : '无法读取服务器书签库');
    } finally {
      refreshInFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [connection, sourceMode]);

  const refreshTab = useCallback(() => { void getActiveTab().then(setActiveTab).catch(() => setActiveTab(null)); }, []);
  useEffect(() => {
    void (async () => {
      // Restore cached state and start the first library request before the
      // account preference check returns. In the normal case both sources
      // match, so the library becomes usable without waiting on a second API call.
      const [localLocale, localSourceMode, value] = await Promise.all([
        loadSidebarLocale().catch(() => 'zh-CN' as SidebarLocale),
        loadSidebarSourceMode().catch(() => 'server' as SidebarSourceMode),
        loadBackendConnection(),
      ]);
      setLocale(localLocale);
      setSourceMode(localSourceMode);
      setConnection(value);
      const initialLoad = refresh(value, {}, localSourceMode);
      let activeSourceMode = localSourceMode;
      if (value) {
        try {
          const preferences = await refreshSidebarPreferences(value);
          setLocale(preferences.language);
          setSourceMode(preferences.sourceMode);
          activeSourceMode = preferences.sourceMode;
        } catch {
          // Keep the cached preference when the API is temporarily unavailable.
        }
      }
      await initialLoad;
      if (activeSourceMode !== localSourceMode) await refresh(value, {}, activeSourceMode);
    })();
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => { refreshTab(); const tabs = getTabsApi(); tabs?.onActivated?.addListener(refreshTab); window.addEventListener('focus', refreshTab); return () => { tabs?.onActivated?.removeListener(refreshTab); window.removeEventListener('focus', refreshTab); }; }, [refreshTab]);
  useEffect(() => {
    if (sourceMode === 'server' && !connection) return;
    const syncIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void refresh(connection, { silent: true }, sourceMode);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncIfVisible();
    };
    const interval = window.setInterval(syncIfVisible, AUTO_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', syncIfVisible);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncIfVisible);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connection, refresh, sourceMode]);
  useEffect(() => {
    if (!connection) return;
    const syncLanguageIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshSidebarPreferences(connection).then(async (preferences) => {
        setLocale(preferences.language);
        setSourceMode(preferences.sourceMode);
        await refresh(connection, { silent: true }, preferences.sourceMode);
      }).catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncLanguageIfVisible();
    };
    const interval = window.setInterval(syncLanguageIfVisible, LANGUAGE_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', syncLanguageIfVisible);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncLanguageIfVisible);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connection, refresh]);

  const nodes = useMemo(() => tree ? toNodes(tree) : [], [tree]);
  const folders = useMemo(() => collectFolders(nodes), [nodes]);
  const folderOptions = useMemo(() => flattenLibraryFolders(tree?.folders ?? []), [tree]);
  const visible = useMemo(() => flattenVisibleNodes(nodes, expanded), [nodes, expanded]);
  const results = useMemo(() => searchBookmarks(nodes, query), [nodes, query]);
  const currentSaved = Boolean(activeTab && tree?.bookmarks.some((item) => item.url === activeTab.url));
  useEffect(() => { setExpanded((value) => new Set([...value, ...folders])); }, [folders]);
  useEffect(() => {
    if (quickSaveFolder && !folderOptions.some((folder) => folder.id === quickSaveFolder)) setQuickSaveFolder('');
  }, [folderOptions, quickSaveFolder]);

  const perform = useCallback(async (serverOperation: (active: BackendConnection) => Promise<unknown>, browserOperation: () => Promise<unknown>) => {
    if (sourceMode === 'server' && !connection) { setModal({ type: 'connect' }); return; }
    setBusy(true); setError(null);
    try {
      if (sourceMode === 'browser') await browserOperation();
      else await serverOperation(connection!);
      await refresh(connection, {}, sourceMode);
      setModal(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败，请重试'); } finally { setBusy(false); }
  }, [connection, refresh, sourceMode]);

  const submitEditor = (value: Editor) => perform(async (active) => {
    const node = modal && 'nodeId' in modal ? findNode(nodes, modal.nodeId) : undefined;
    const parentId = value.parentId || null;
    if (modal?.type === 'create') {
      if (value.kind === 'folder') await createLibraryFolder(active, { title: value.title.trim(), parentId });
      else await createLibraryBookmark(active, { title: value.title.trim(), url: value.url.trim(), parentId });
    } else if (modal?.type === 'edit' && node) {
      await updateLibraryNode(active, node.id, { title: value.title.trim(), ...(node.url ? { url: value.url.trim() } : {}) });
      if ((node.parentId ?? '') !== (parentId ?? '')) await moveLibraryNode(active, node.id, parentId);
    }
  }, async () => {
    const node = modal && 'nodeId' in modal ? findNode(nodes, modal.nodeId) : undefined;
    const parentId = value.parentId || null;
    if (modal?.type === 'create') {
      if (value.kind === 'folder') await createBrowserFolder({ title: value.title.trim(), parentId });
      else await createBrowserBookmark({ title: value.title.trim(), url: value.url.trim(), parentId });
    } else if (modal?.type === 'edit' && node) {
      await updateBrowserNode(node.id, { title: value.title.trim(), ...(node.url ? { url: value.url.trim() } : {}) });
      if ((node.parentId ?? '') !== (parentId ?? '')) await moveBrowserNode(node.id, parentId);
    }
  });

  const toggleCompactToolbar = () => {
    setCompactToolbar((current) => {
      const next = !current;
      void saveCompactToolbar(next);
      return next;
    });
  };

  const isBrowserSource = sourceMode === 'browser';
  const needsServerConnection = !isBrowserSource && !connection;
  const sourceLabel = isBrowserSource ? '浏览器' : '服务器';

  return <SidebarUiLocalization locale={locale}><main className={`app-shell self-hosted-library ${compactToolbar ? 'is-compact-toolbar' : ''}`}>
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark"><img alt="WOTTY BOOKMARK" className="brand-logo-img" src="/logo.webp" /></div><div><div className="brand-title">书签库</div><div className="brand-subtitle">wotty · server library</div></div></div><div className="topbar-actions"><button aria-label={compactToolbar ? '展开工具区' : '收起工具区'} aria-pressed={compactToolbar} className="compact-toolbar-button" onClick={toggleCompactToolbar} title={compactToolbar ? '展开工具区' : '收起工具区'} type="button">{compactToolbar ? <PanelTopOpen size={15} /> : <LayoutPanelTop size={15} />}</button><button aria-label={isBrowserSource ? '浏览器模式' : connection ? '服务器已连接' : '连接服务器'} className={`sync-status ${isBrowserSource || connection ? 'is-connected' : 'is-disconnected'}`} disabled={isBrowserSource} onClick={() => setModal({ type: 'connect' })} type="button"><span className="status-dot" />{isBrowserSource ? '浏览器模式' : connection ? '服务器已连接' : '连接服务器'}{isBrowserSource ? <Globe size={13} /> : <Server size={13} />}</button></div></header>
    <section className="workspace" ref={workspaceRef}>
      <div className="auxiliary-toolbar">
      <div className="search-shell"><Search size={16} /><input aria-label={`搜索${sourceLabel}书签`} disabled={needsServerConnection} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${sourceLabel}书签或网址`} type="search" value={query} />{query && <button className="icon-button" onClick={() => setQuery('')} type="button"><X size={14} /></button>}</div>
      <section className={`quick-save-card ${!activeTab || needsServerConnection ? 'is-disabled' : ''}`}>
        <div className="quick-save-summary">
          <div className="quick-save-icon"><Globe size={17} /></div>
          <div className="quick-save-copy">
            <div className="quick-save-heading"><span>收藏</span><strong title={activeTab?.title} {...(!activeTab ? { 'data-i18n-force': '' } : {})}>{activeTab?.title ?? '当前页面不可收藏'}</strong></div>
            <span>{activeTab ? hostname(activeTab.url) : '请在普通网页中打开侧边栏'}</span>
          </div>
        </div>
        <div className="quick-save-actions">
          <FolderPickerDropdown
            ariaLabel="收藏到文件夹"
            compact
            disabled={!activeTab || needsServerConnection || currentSaved || busy}
            onChange={setQuickSaveFolder}
            options={folderOptions}
            value={quickSaveFolder}
          />
          <button className={`save-current-button ${currentSaved ? 'is-saved' : ''}`} disabled={!activeTab || needsServerConnection || currentSaved || busy} onClick={() => activeTab && void perform((active) => createLibraryBookmark(active, { title: activeTab.title, url: activeTab.url, parentId: quickSaveFolder || null }), () => createBrowserBookmark({ title: activeTab.title, url: activeTab.url, parentId: quickSaveFolder || null }))} type="button">{currentSaved ? <Check size={15} /> : '收藏'}</button>
        </div>
      </section>
      </div>
      <div className="section-heading"><div><h1>我的{sourceLabel}书签</h1></div><div className="heading-actions"><button className="new-bookmark-button" disabled={needsServerConnection} onClick={() => setModal({ type: 'create', kind: 'folder' })} type="button"><Folder size={15} />文件夹</button><button className="new-bookmark-button primary" disabled={needsServerConnection} onClick={() => setModal({ type: 'create', kind: 'bookmark' })} type="button"><Plus size={15} />新增</button></div></div>
      <div className={`library-meta ${compactToolbar ? 'is-compact-meta' : ''}`}><span>{countBookmarks(nodes)} 个书签</span><span className="meta-separator">·</span><span>{countFolders(nodes)} 个文件夹</span><span className="sync-time" title={isBrowserSource ? '当前读取浏览器原生书签' : '侧边栏每 10 秒自动同步一次，重新聚焦时会立即同步'}>{isBrowserSource ? '浏览器书签' : formatSyncTime(lastSyncedAt)}</span><span className="meta-spacer" /><button className="refresh-button" disabled={needsServerConnection || loading} onClick={() => void refresh()} type="button"><RefreshCw className={loading ? 'spin' : ''} size={13} />刷新</button></div>
      {needsServerConnection ? <Disconnected onConnect={() => setModal({ type: 'connect' })} /> : error && !tree ? <Failure message={error} onRetry={() => void refresh()} /> : loading ? <Loading sourceMode={sourceMode} /> : query.trim() ? <VirtualSearchList onDelete={(nodeId) => setModal({ type: 'delete', nodeId })} onEdit={(nodeId) => setModal({ type: 'edit', nodeId })} results={results} scrollTop={scrollTop} sourceMode={sourceMode} viewportHeight={viewportHeight} /> : visible.length ? <VirtualBookmarkList expanded={expanded} onDelete={(nodeId) => setModal({ type: 'delete', nodeId })} onEdit={(nodeId) => setModal({ type: 'edit', nodeId })} onMove={(nodeId) => setModal({ type: 'move', nodeId })} onSelect={setSelectedNodeId} onToggle={(nodeId) => setExpanded((current) => { const next = new Set(current); if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId); return next; })} scrollTop={scrollTop} selectedNodeId={selectedNodeId} viewportHeight={viewportHeight} visible={visible} /> : <Empty onCreate={() => setModal({ type: 'create', kind: 'bookmark' })} sourceMode={sourceMode} />}{error && tree && <p className="inline-error">{error}</p>}
    </section>
    <button aria-label="回到顶部" className="back-to-top-button" onClick={() => scrollToTop(workspaceRef.current)} title="回到顶部" type="button"><ArrowUp size={16} /></button>
    <footer className="app-footer" />
    {modal?.type === 'connect' && <ConnectionModal busy={busy} connection={connection} onClose={() => setModal(null)} onConnect={(serverUrl, code) => { setBusy(true); setError(null); void connectToBackend(serverUrl, code).then(async (next) => { setConnection(next); let nextMode = sourceMode; try { const preferences = await refreshSidebarPreferences(next); setLocale(preferences.language); setSourceMode(preferences.sourceMode); nextMode = preferences.sourceMode; } catch { /* 使用当前缓存模式，连接仍可继续 */ } await refresh(next, {}, nextMode); setModal(null); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '连接失败')).finally(() => setBusy(false)); }} onDisconnect={() => { setBusy(true); void clearBackendConnection().then(() => { setConnection(null); setTree(null); setModal(null); }).finally(() => setBusy(false)); }} />}
    {modal?.type === 'create' && <EditorModal busy={busy} initial={{ kind: modal.kind, parentId: modal.parentId ?? '' }} nodes={nodes} onClose={() => setModal(null)} onSubmit={submitEditor} sourceMode={sourceMode} />}
    {modal?.type === 'edit' && <EditorModal busy={busy} node={findNode(nodes, modal.nodeId)} nodes={nodes} onClose={() => setModal(null)} onSubmit={submitEditor} sourceMode={sourceMode} />}
    {modal?.type === 'move' && <MoveModal busy={busy} node={findNode(nodes, modal.nodeId)} nodes={nodes} onClose={() => setModal(null)} onSubmit={(parentId) => perform((active) => moveLibraryNode(active, modal.nodeId, parentId || null), () => moveBrowserNode(modal.nodeId, parentId || null))} sourceMode={sourceMode} />}
    {modal?.type === 'delete' && <DeleteModal busy={busy} node={findNode(nodes, modal.nodeId)} onClose={() => setModal(null)} onConfirm={() => perform((active) => deleteLibraryNode(active, modal.nodeId), () => deleteBrowserNode(modal.nodeId))} sourceMode={sourceMode} />}
  </main></SidebarUiLocalization>;
}

function VirtualBookmarkList({ visible, expanded, selectedNodeId, scrollTop, viewportHeight, onToggle, onSelect, onEdit, onMove, onDelete }: { visible: FlatBookmarkNode[]; expanded: Set<string>; selectedNodeId: string | null; scrollTop: number; viewportHeight: number; onToggle: (nodeId: string) => void; onSelect: (nodeId: string) => void; onEdit: (nodeId: string) => void; onMove: (nodeId: string) => void; onDelete: (nodeId: string) => void }) {
  const itemHeights = useMemo(() => visible.map((node) => (isFolder(node) ? FOLDER_ROW_HEIGHT : BOOKMARK_ROW_HEIGHT)), [visible]);
  const win = getVariableVirtualWindow(itemHeights, scrollTop, viewportHeight, 8);
  const slice = visible.slice(win.start, win.end);
  const sliceHeights = itemHeights.slice(win.start, win.end).reduce((sum, h) => sum + h, 0);
  const bottomPadding = Math.max(0, win.totalSize - win.offset - sliceHeights);

  return (
    <div className="bookmark-list" style={{ paddingTop: `${win.offset}px`, paddingBottom: `${bottomPadding}px` }}>
      {slice.map((node) => (
        <NodeRow
          expanded={expanded.has(node.id)}
          key={node.id}
          node={node}
          onSelect={() => onSelect(node.id)}
          selected={selectedNodeId === node.id}
          onDelete={() => onDelete(node.id)}
          onEdit={() => onEdit(node.id)}
          onMove={() => onMove(node.id)}
          onOpen={() => node.url && void openBookmark(node.url)}
          onToggle={() => onToggle(node.id)}
        />
      ))}
    </div>
  );
}

function VirtualSearchList({ results, scrollTop, viewportHeight, onEdit, onDelete, sourceMode }: { results: ReturnType<typeof searchBookmarks>; scrollTop: number; viewportHeight: number; onEdit: (id: string) => void; onDelete: (id: string) => void; sourceMode: SidebarSourceMode }) {
  if (!results.length) {
    return <div className="no-results"><strong>没有匹配的{sourceMode === 'browser' ? '浏览器' : '服务器'}书签</strong><span>换一个关键词试试。</span></div>;
  }
  const win = getVirtualWindow(results.length, scrollTop, viewportHeight, SEARCH_ROW_HEIGHT, 8);
  const slice = results.slice(win.start, win.end);
  const bottomPadding = Math.max(0, win.totalSize - win.offset - (slice.length * SEARCH_ROW_HEIGHT));

  return (
    <div className="search-results" style={{ paddingTop: `${win.offset}px`, paddingBottom: `${bottomPadding}px` }}>
      {slice.map(({ node, breadcrumb }) => (
        <div className="search-result" key={node.id}>
          <button className="result-main" onClick={() => node.url && void openBookmark(node.url)} type="button">
            <Favicon url={node.url!} />
            <span className="result-copy">
              <strong>{node.title}</strong>
              <span>{hostname(node.url!)}</span>
              <em>{breadcrumb.join(' / ') || '根目录'}</em>
            </span>
          </button>
          <div className="result-actions">
            <button className="row-action" onClick={() => onEdit(node.id)} type="button"><Pencil size={14} /></button>
            <button className="row-action danger-action" onClick={() => onDelete(node.id)} type="button"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function NodeRow({ node, expanded, selected, onSelect, onToggle, onOpen, onEdit, onMove, onDelete }: { node: FlatBookmarkNode; expanded: boolean; selected: boolean; onSelect: () => void; onToggle: () => void; onOpen: () => void; onEdit: () => void; onMove: () => void; onDelete: () => void }) {
  const folder = isFolder(node);
  const depth = node.depth;
  const bookmarkCount = folder ? countBookmarks(node.children ?? []) : 0;
  const tooltip = folder ? (node.title || '未命名') : `${node.title || '未命名'}\n${node.url || ''}`;

  return (
    <div
      className={`bookmark-row ${folder ? 'bookmark-folder-row' : 'bookmark-item-row'} ${selected ? 'is-selected' : ''}`}
      style={{ '--depth': depth } as React.CSSProperties}
    >
      <div className="bookmark-row-main" title={tooltip}>
        {folder ? (
          <button aria-expanded={expanded} aria-label={`${expanded ? '收起' : '展开'}文件夹 ${node.title}`} className="folder-toggle" onClick={() => { onSelect(); onToggle(); }} type="button">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="folder-toggle-spacer" />
        )}
        <span className={`node-icon ${folder ? 'folder-color' : ''}`}>
          {folder ? (
            <span className="folder-icon-card">
              {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
            </span>
          ) : (
            <Favicon url={node.url!} />
          )}
        </span>
        <button
          className="bookmark-title"
          onClick={() => { onSelect(); if (folder) onToggle(); else onOpen(); }}
          type="button"
        >
          {node.title || '未命名'}
        </button>
        {folder && (
          <span aria-label={`${bookmarkCount} 个书签`} className="folder-count-badge">
            {bookmarkCount}
          </span>
        )}
        <div className={`row-actions ${folder ? '' : 'bookmark-row-actions'}`}>
          <button aria-label="编辑" className="row-action" onClick={onEdit} type="button">
            <Pencil size={13} />
          </button>
          {folder && <button aria-label="移动" className="row-action" onClick={onMove} type="button">↗</button>}
          <button aria-label="删除" className="row-action danger-action" onClick={onDelete} type="button">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
const faviconMemoryCache = new Map<string, Awaited<ReturnType<typeof loadSiteFavicon>>>();
function Favicon({ url }: { url: string }) { const cached = faviconMemoryCache.get(url); const [asset, setAsset] = useState<Awaited<ReturnType<typeof loadSiteFavicon>>>(cached ?? null); useEffect(() => { if (cached !== undefined) return; void loadSiteFavicon(url).then((next) => { faviconMemoryCache.set(url, next); setAsset(next); }); }, [url, cached]); if (asset?.kind === 'image') return <img alt="" className="site-favicon" height={16} src={asset.source} width={16} />; if (asset?.kind === 'svg') return <span aria-hidden="true" className="site-favicon-svg" dangerouslySetInnerHTML={{ __html: asset.source }} />; return <Bookmark size={15} />; }
function Loading({ sourceMode }: { sourceMode: SidebarSourceMode }) { return <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>正在读取{sourceMode === 'browser' ? '浏览器书签' : '服务器书签库'}…</span></div>; }
function Disconnected({ onConnect }: { onConnect: () => void }) { return <div className="empty-state"><div className="empty-orbit"><Server size={23} /></div><strong>连接你的服务器书签库</strong><span>连接后，这里只显示服务器中的书签，不会访问浏览器原生书签。</span><button onClick={onConnect} type="button"><LogIn size={14} /> 连接服务器</button></div>; }
function Failure({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="error-state"><strong>书签库暂时不可用</strong><span>{message}</span><button onClick={onRetry} type="button">重新连接</button></div>; }
function Empty({ onCreate, sourceMode }: { onCreate: () => void; sourceMode: SidebarSourceMode }) { return <div className="empty-state"><div className="empty-orbit"><Bookmark size={23} /></div><strong>书签库还是空的</strong><span>在当前页点击“收藏”，或手动添加第一条{sourceMode === 'browser' ? '浏览器' : '服务器'}书签。</span><button onClick={onCreate} type="button"><Plus size={14} /> 新增书签</button></div>; }
function Frame({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop"><section className="modal-card"><header className="modal-header"><div><p className="section-kicker">SERVER LIBRARY</p><h2>{title}</h2></div><button className="modal-close" onClick={onClose} type="button"><X size={16} /></button></header>{children}</section></div>; }
function ConnectionModal({ busy, connection, onClose, onConnect, onDisconnect }: { busy: boolean; connection: BackendConnection | null; onClose: () => void; onConnect: (serverUrl: string, code: string) => void; onDisconnect: () => void }) { const [serverUrl, setServerUrl] = useState(''); const [code, setCode] = useState(''); return <Frame onClose={onClose} title={connection ? '服务器已连接' : '连接服务器'}>{connection ? <div className="connection-content"><div className="connection-status-card"><Server size={20} /><div><strong>服务器书签库已启用</strong><span>{connection.loginIdentifier}</span></div></div><p className="connection-help">侧边栏收藏会直接保存到服务器；不会读取或写入浏览器原生书签。</p><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">关闭</button><button className="danger-button" disabled={busy} onClick={onDisconnect} type="button">断开连接</button></div></div> : <form className="editor-form" onSubmit={(event) => { event.preventDefault(); onConnect(serverUrl, code); }}><p className="connection-help">从管理后台生成一次性设备码。这里只建立服务器书签库连接，不需要 WebDAV 密码。</p><label className="field-label">API 地址<input autoFocus onChange={(event) => setServerUrl(event.target.value)} placeholder="https://bookmark.example.com" required type="url" value={serverUrl} /></label><label className="field-label">一次性设备码<input onChange={(event) => setCode(event.target.value)} placeholder="bv_..." required value={code} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="primary-button" disabled={busy} type="submit">{busy ? '连接中…' : '连接服务器'}</button></div></form>}</Frame>; }
function EditorModal({ busy, node, initial, nodes, onClose, onSubmit, sourceMode }: { busy: boolean; node?: BookmarkNode; initial?: Partial<Editor>; nodes: BookmarkNode[]; onClose: () => void; onSubmit: (value: Editor) => void; sourceMode: SidebarSourceMode }) {
  const [value, setValue] = useState<Editor>({
    kind: node ? (node.url ? 'bookmark' : 'folder') : initial?.kind ?? 'bookmark',
    title: node?.title ?? '',
    url: node?.url ?? '',
    parentId: node?.parentId ?? initial?.parentId ?? '',
  });
  const choices = getFolderOptions(nodes, node && isFolder(node) ? node.id : undefined);
  return (
    <Frame onClose={onClose} title={node ? `编辑${sourceMode === 'browser' ? '浏览器' : '服务器'}书签` : value.kind === 'folder' ? '新建文件夹' : `新建${sourceMode === 'browser' ? '浏览器' : '服务器'}书签`}>
      <form className="editor-form" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
        <label className="field-label">
          名称
          <input autoFocus onChange={(event) => setValue({ ...value, title: event.target.value })} required value={value.title} />
        </label>
        {value.kind === 'bookmark' && (
          <label className="field-label">
            网址
            <input onChange={(event) => setValue({ ...value, url: event.target.value })} placeholder="https://example.com" required type="url" value={value.url} />
          </label>
        )}
        <label className="field-label">
          保存到
          <FolderPickerDropdown
            onChange={(parentId) => setValue({ ...value, parentId })}
            options={choices}
            value={value.parentId}
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={busy || !value.title.trim() || (value.kind === 'bookmark' && !value.url.trim())} type="submit">{busy ? '保存中…' : `保存到${sourceMode === 'browser' ? '浏览器' : '服务器'}`}</button>
        </div>
      </form>
    </Frame>
  );
}

function MoveModal({ busy, node, nodes, onClose, onSubmit, sourceMode }: { busy: boolean; node?: BookmarkNode; nodes: BookmarkNode[]; onClose: () => void; onSubmit: (parent: string) => void; sourceMode: SidebarSourceMode }) {
  if (!node) return null;
  const choices = getFolderOptions(nodes, isFolder(node) ? node.id : undefined);
  const [parent, setParent] = useState(node.parentId ?? '');
  return (
    <Frame onClose={onClose} title={`移动${sourceMode === 'browser' ? '浏览器' : '服务器'}书签`}>
      <form className="editor-form" onSubmit={(event) => { event.preventDefault(); onSubmit(parent); }}>
        <label className="field-label">
          目标文件夹
          <FolderPickerDropdown
            onChange={setParent}
            options={choices}
            value={parent}
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">取消</button>
          <button className="primary-button" disabled={busy} type="submit">{busy ? '移动中…' : '移动'}</button>
        </div>
      </form>
    </Frame>
  );
}
function DeleteModal({ busy, node, onClose, onConfirm, sourceMode }: { busy: boolean; node?: BookmarkNode; onClose: () => void; onConfirm: () => void; sourceMode: SidebarSourceMode }) { if (!node) return null; return <Frame onClose={onClose} title={node.url ? '删除书签？' : '删除文件夹？'}><div className="delete-content"><Trash2 size={20} /><p>{sourceMode === 'browser' ? <>将 <strong>{node.title}</strong> 从浏览器书签中删除。{node.url ? '' : '文件夹中的内容也会一并删除。'}</> : <>将 <strong>{node.title}</strong> 移入服务器书签库回收站。{node.url ? '' : '文件夹中的内容也会一并移入。'}</>}</p></div><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="danger-button" disabled={busy} onClick={onConfirm} type="button">{busy ? '删除中…' : sourceMode === 'browser' ? '删除' : '移入回收站'}</button></div></Frame>; }
export default App;
