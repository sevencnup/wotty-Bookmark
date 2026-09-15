import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Bookmark, Check, ChevronDown, ChevronRight, Folder, FolderOpen, Globe, LoaderCircle, LogIn, Pencil, Plus, RefreshCw, Search, Server, Trash2, X } from 'lucide-react';
import { getActiveTab, getTabsApi, openBookmark } from './lib/browser-api';
import type { BookmarkNode } from './lib/browser-api';
import { collectFolders, countBookmarks, countFolders, findNode, flattenVisibleNodes, getFolderOptions, isFolder, searchBookmarks } from './lib/bookmark-tree';
import { clearBackendConnection, connectToBackend, loadBackendConnection } from './lib/backend';
import type { BackendConnection } from './lib/backend';
import { createLibraryBookmark, createLibraryFolder, deleteLibraryNode, getLibrary, moveLibraryNode, updateLibraryNode } from './lib/library';
import type { LibraryFolder, LibraryTree } from './lib/library';
import { loadSiteFavicon } from './lib/site-favicon';
import { loadSidebarLocale, refreshSidebarLocale } from './lib/preferences';
import type { SidebarLocale } from './lib/preferences';
import { getVirtualWindow } from './lib/virtual-list';
import { SidebarUiLocalization } from './sidebar-i18n';

type Modal = { type: 'connect' } | { type: 'create'; kind: 'bookmark' | 'folder'; parentId?: string } | { type: 'edit' | 'move' | 'delete'; nodeId: string } | null;
type Editor = { kind: 'bookmark' | 'folder'; title: string; url: string; parentId: string };
type RefreshOptions = { silent?: boolean };
const AUTO_REFRESH_INTERVAL_MS = 10_000;
const LANGUAGE_REFRESH_INTERVAL_MS = 10 * 60_000;
const BOOKMARK_ROW_HEIGHT = 38;
const SEARCH_ROW_HEIGHT = 50;

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
  const [tree, setTree] = useState<LibraryTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);
  const [quickSaveFolder, setQuickSaveFolder] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
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

  const refresh = useCallback(async (current = connection, { silent = false }: RefreshOptions = {}) => {
    if (!current) { setTree(null); setLoading(false); setLastSyncedAt(null); return; }
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setTree(await getLibrary(current));
      setLastSyncedAt(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取服务器书签库');
    } finally {
      refreshInFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [connection]);

  const refreshTab = useCallback(() => { void getActiveTab().then(setActiveTab).catch(() => setActiveTab(null)); }, []);
  useEffect(() => {
    void (async () => {
      // Read the local fallback before the remote value so an older storage
      // operation can never overwrite a freshly fetched account preference.
      setLocale(await loadSidebarLocale().catch(() => 'zh-CN' as SidebarLocale));
      const value = await loadBackendConnection();
      setConnection(value);
      void refresh(value);
      if (value) void refreshSidebarLocale(value).then(setLocale).catch(() => undefined);
    })();
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => { refreshTab(); const tabs = getTabsApi(); tabs?.onActivated?.addListener(refreshTab); window.addEventListener('focus', refreshTab); return () => { tabs?.onActivated?.removeListener(refreshTab); window.removeEventListener('focus', refreshTab); }; }, [refreshTab]);
  useEffect(() => {
    if (!connection) return;
    const syncIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void refresh(connection, { silent: true });
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
  }, [connection, refresh]);
  useEffect(() => {
    if (!connection) return;
    const syncLanguageIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      void refreshSidebarLocale(connection).then(setLocale).catch(() => undefined);
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
  }, [connection]);

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

  const perform = useCallback(async (operation: (active: BackendConnection) => Promise<unknown>) => {
    if (!connection) { setModal({ type: 'connect' }); return; }
    setBusy(true); setError(null);
    try { await operation(connection); await refresh(connection); setModal(null); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败，请重试'); } finally { setBusy(false); }
  }, [connection, refresh]);

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
  });

  return <SidebarUiLocalization locale={locale}><main className="app-shell self-hosted-library">
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark"><img alt="WOTTY BOOKMARK" className="brand-logo-img" src="/logo.png" /></div><div><div className="brand-title">书签库</div><div className="brand-subtitle">WOTTY · SERVER LIBRARY</div></div></div><button className={`sync-status ${connection ? 'is-connected' : 'is-disconnected'}`} onClick={() => setModal({ type: 'connect' })} type="button"><span className="status-dot" />{connection ? '服务器已连接' : '连接服务器'}<Server size={13} /></button></header>
    <section className="workspace" ref={workspaceRef}>
      <div className="server-library-banner"><Server size={15} /><span><strong>只保存到服务器</strong> · 不读取或写入浏览器原生书签</span></div>
      <div className="search-shell"><Search size={16} /><input aria-label="搜索服务器书签" disabled={!connection} onChange={(event) => setQuery(event.target.value)} placeholder="搜索服务器书签或网址" type="search" value={query} />{query && <button className="icon-button" onClick={() => setQuery('')} type="button"><X size={14} /></button>}</div>
      <section className={`quick-save-card ${!activeTab || !connection ? 'is-disabled' : ''}`}><div className="quick-save-icon"><Globe size={17} /></div><div className="quick-save-copy"><span className="eyebrow">收藏当前页 · SERVER</span><strong {...(!activeTab ? { 'data-i18n-force': '' } : {})}>{activeTab?.title ?? '当前页面不可收藏'}</strong><span>{activeTab ? hostname(activeTab.url) : '请在普通网页中打开侧边栏'}</span></div><label className="quick-save-folder"><Folder size={13} /><span className="sr-only">保存到文件夹</span><select aria-label="收藏到文件夹" disabled={!activeTab || !connection || currentSaved || busy} onChange={(event) => setQuickSaveFolder(event.target.value)} value={quickSaveFolder}><option data-i18n-force value="">根目录</option>{folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.title}</option>)}</select></label><button className={`save-current-button ${currentSaved ? 'is-saved' : ''}`} disabled={!activeTab || !connection || currentSaved || busy} onClick={() => activeTab && void perform((active) => createLibraryBookmark(active, { title: activeTab.title, url: activeTab.url, parentId: quickSaveFolder || null }))} type="button">{currentSaved ? <Check size={15} /> : '收藏'}</button></section>
      <div className="section-heading"><div><span className="section-kicker">PRIVATE LIBRARY</span><h1>我的服务器书签</h1></div><div className="heading-actions"><button className="new-bookmark-button" disabled={!connection} onClick={() => setModal({ type: 'create', kind: 'folder' })} type="button"><Folder size={15} />文件夹</button><button className="new-bookmark-button primary" disabled={!connection} onClick={() => setModal({ type: 'create', kind: 'bookmark' })} type="button"><Plus size={15} />新增</button></div></div>
      <div className="library-meta"><span>{countBookmarks(nodes)} 个书签</span><span className="meta-separator">·</span><span>{countFolders(nodes)} 个文件夹</span><span className="sync-time" title="侧边栏每 10 秒自动同步一次，重新聚焦时会立即同步">{formatSyncTime(lastSyncedAt)}</span><span className="meta-spacer" /><button className="refresh-button" disabled={!connection || loading} onClick={() => void refresh()} type="button"><RefreshCw className={loading ? 'spin' : ''} size={13} />刷新</button></div>
      {!connection ? <Disconnected onConnect={() => setModal({ type: 'connect' })} /> : error && !tree ? <Failure message={error} onRetry={() => void refresh()} /> : loading ? <Loading /> : query.trim() ? <VirtualSearchList onDelete={(nodeId) => setModal({ type: 'edit', nodeId })} onEdit={(nodeId) => setModal({ type: 'edit', nodeId })} onMove={(nodeId) => setModal({ type: 'move', nodeId })} results={results} scrollTop={scrollTop} viewportHeight={viewportHeight} /> : visible.length ? <VirtualBookmarkList expanded={expanded} onDelete={(nodeId) => setModal({ type: 'delete', nodeId })} onEdit={(nodeId) => setModal({ type: 'edit', nodeId })} onMove={(nodeId) => setModal({ type: 'move', nodeId })} onToggle={(nodeId) => setExpanded((current) => { const next = new Set(current); if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId); return next; })} scrollTop={scrollTop} viewportHeight={viewportHeight} visible={visible} /> : <Empty onCreate={() => setModal({ type: 'create', kind: 'bookmark' })} />}{error && tree && <p className="inline-error">{error}</p>}
    </section>
    <button aria-label="回到顶部" className="back-to-top-button" onClick={() => scrollToTop(workspaceRef.current)} title="回到顶部" type="button"><ArrowUp size={16} /></button>
    <footer className="app-footer"><span><span className="footer-dot" /> 服务器是唯一数据源</span><span className="footer-version">v0.1.15</span></footer>
    {modal?.type === 'connect' && <ConnectionModal busy={busy} connection={connection} onClose={() => setModal(null)} onConnect={(serverUrl, code) => { setBusy(true); setError(null); void connectToBackend(serverUrl, code).then(async (next) => { setConnection(next); await refresh(next); void refreshSidebarLocale(next).then(setLocale).catch(() => undefined); setModal(null); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '连接失败')).finally(() => setBusy(false)); }} onDisconnect={() => { setBusy(true); void clearBackendConnection().then(() => { setConnection(null); setTree(null); setModal(null); }).finally(() => setBusy(false)); }} />}
    {modal?.type === 'create' && <EditorModal busy={busy} initial={{ kind: modal.kind, parentId: modal.parentId ?? '' }} nodes={nodes} onClose={() => setModal(null)} onSubmit={submitEditor} />}
    {modal?.type === 'edit' && <EditorModal busy={busy} node={findNode(nodes, modal.nodeId)} nodes={nodes} onClose={() => setModal(null)} onSubmit={submitEditor} />}
    {modal?.type === 'move' && <MoveModal busy={busy} node={findNode(nodes, modal.nodeId)} nodes={nodes} onClose={() => setModal(null)} onSubmit={(parentId) => perform((active) => moveLibraryNode(active, modal.nodeId, parentId || null))} />}
    {modal?.type === 'delete' && <DeleteModal busy={busy} node={findNode(nodes, modal.nodeId)} onClose={() => setModal(null)} onConfirm={() => perform((active) => deleteLibraryNode(active, modal.nodeId))} />}
  </main></SidebarUiLocalization>;
}

function VirtualBookmarkList({ visible, expanded, scrollTop, viewportHeight, onToggle, onEdit, onMove, onDelete }: { visible: Array<BookmarkNode & { depth: number }>; expanded: Set<string>; scrollTop: number; viewportHeight: number; onToggle: (nodeId: string) => void; onEdit: (nodeId: string) => void; onMove: (nodeId: string) => void; onDelete: (nodeId: string) => void }) {
  const win = getVirtualWindow(visible.length, scrollTop, viewportHeight, BOOKMARK_ROW_HEIGHT, 8);
  const slice = visible.slice(win.start, win.end);
  const bottomPadding = Math.max(0, win.totalSize - win.offset - (slice.length * BOOKMARK_ROW_HEIGHT));

  return (
    <div className="bookmark-list" style={{ paddingTop: `${win.offset}px`, paddingBottom: `${bottomPadding}px` }}>
      {slice.map((node) => (
        <NodeRow
          expanded={expanded.has(node.id)}
          key={node.id}
          node={node}
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

function VirtualSearchList({ results, scrollTop, viewportHeight, onEdit, onMove, onDelete }: { results: ReturnType<typeof searchBookmarks>; scrollTop: number; viewportHeight: number; onEdit: (id: string) => void; onMove: (id: string) => void; onDelete: (id: string) => void }) {
  if (!results.length) {
    return <div className="no-results"><strong>没有匹配的服务器书签</strong><span>换一个关键词试试。</span></div>;
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
            <button className="row-action" onClick={() => onMove(node.id)} type="button">↗</button>
            <button className="row-action danger-action" onClick={() => onDelete(node.id)} type="button"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function NodeRow({ node, expanded, onToggle, onOpen, onEdit, onMove, onDelete }: { node: BookmarkNode & { depth: number }; expanded: boolean; onToggle: () => void; onOpen: () => void; onEdit: () => void; onMove: () => void; onDelete: () => void }) { const folder = isFolder(node); const depth = node.depth; const bookmarkCount = folder ? countBookmarks(node.children ?? []) : 0; return <div className={`bookmark-row ${folder ? 'bookmark-folder-row' : ''}`} style={{ '--depth': depth } as React.CSSProperties}><div className="bookmark-row-main">{folder ? <button className="folder-toggle" onClick={onToggle} type="button">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="folder-toggle-spacer" />}<span className={`node-icon ${folder ? 'folder-color' : ''}`}>{folder ? <span className="folder-icon-card">{expanded ? <FolderOpen size={15} /> : <Folder size={15} />}</span> : <Favicon url={node.url!} />}</span><button className="bookmark-title" onClick={folder ? onToggle : onOpen} type="button">{node.title || '未命名'}</button>{folder && <span aria-label={`${bookmarkCount} 个书签`} className="folder-count-badge">{bookmarkCount}</span>}<div className="row-actions"><button aria-label="编辑" className="row-action" onClick={onEdit} type="button"><Pencil size={14} /></button><button aria-label="移动" className="row-action" onClick={onMove} type="button">↗</button><button aria-label="删除" className="row-action danger-action" onClick={onDelete} type="button"><Trash2 size={14} /></button></div></div>{node.url && <span className="bookmark-url">{hostname(node.url)}</span>}</div>; }
const faviconMemoryCache = new Map<string, Awaited<ReturnType<typeof loadSiteFavicon>>>();
function Favicon({ url }: { url: string }) { const cached = faviconMemoryCache.get(url); const [asset, setAsset] = useState<Awaited<ReturnType<typeof loadSiteFavicon>>>(cached ?? null); useEffect(() => { if (cached !== undefined) return; void loadSiteFavicon(url).then((next) => { faviconMemoryCache.set(url, next); setAsset(next); }); }, [url, cached]); if (asset?.kind === 'image') return <img alt="" className="site-favicon" height={16} src={asset.source} width={16} />; if (asset?.kind === 'svg') return <span aria-hidden="true" className="site-favicon-svg" dangerouslySetInnerHTML={{ __html: asset.source }} />; return <Bookmark size={15} />; }
function Loading() { return <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>正在读取服务器书签库…</span></div>; }
function Disconnected({ onConnect }: { onConnect: () => void }) { return <div className="empty-state"><div className="empty-orbit"><Server size={23} /></div><strong>连接你的服务器书签库</strong><span>连接后，这里只显示服务器中的书签，不会访问浏览器原生书签。</span><button onClick={onConnect} type="button"><LogIn size={14} /> 连接服务器</button></div>; }
function Failure({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="error-state"><strong>书签库暂时不可用</strong><span>{message}</span><button onClick={onRetry} type="button">重新连接</button></div>; }
function Empty({ onCreate }: { onCreate: () => void }) { return <div className="empty-state"><div className="empty-orbit"><Bookmark size={23} /></div><strong>书签库还是空的</strong><span>在当前页点击“收藏”，或手动添加第一条服务器书签。</span><button onClick={onCreate} type="button"><Plus size={14} /> 新增书签</button></div>; }
function Frame({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop"><section className="modal-card"><header className="modal-header"><div><p className="section-kicker">SERVER LIBRARY</p><h2>{title}</h2></div><button className="modal-close" onClick={onClose} type="button"><X size={16} /></button></header>{children}</section></div>; }
function ConnectionModal({ busy, connection, onClose, onConnect, onDisconnect }: { busy: boolean; connection: BackendConnection | null; onClose: () => void; onConnect: (serverUrl: string, code: string) => void; onDisconnect: () => void }) { const [serverUrl, setServerUrl] = useState(''); const [code, setCode] = useState(''); return <Frame onClose={onClose} title={connection ? '服务器已连接' : '连接服务器'}>{connection ? <div className="connection-content"><div className="connection-status-card"><Server size={20} /><div><strong>服务器书签库已启用</strong><span>{connection.loginIdentifier}</span></div></div><p className="connection-help">侧边栏收藏会直接保存到服务器；不会读取或写入浏览器原生书签。</p><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">关闭</button><button className="danger-button" disabled={busy} onClick={onDisconnect} type="button">断开连接</button></div></div> : <form className="editor-form" onSubmit={(event) => { event.preventDefault(); onConnect(serverUrl, code); }}><p className="connection-help">从管理后台生成一次性设备码。这里只建立服务器书签库连接，不需要 WebDAV 密码。</p><label className="field-label">API 地址<input autoFocus onChange={(event) => setServerUrl(event.target.value)} placeholder="https://bookmark.example.com" required type="url" value={serverUrl} /></label><label className="field-label">一次性设备码<input onChange={(event) => setCode(event.target.value)} placeholder="bv_..." required value={code} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="primary-button" disabled={busy} type="submit">{busy ? '连接中…' : '连接服务器'}</button></div></form>}</Frame>; }
function EditorModal({ busy, node, initial, nodes, onClose, onSubmit }: { busy: boolean; node?: BookmarkNode; initial?: Partial<Editor>; nodes: BookmarkNode[]; onClose: () => void; onSubmit: (value: Editor) => void }) { const [value, setValue] = useState<Editor>({ kind: node ? (node.url ? 'bookmark' : 'folder') : initial?.kind ?? 'bookmark', title: node?.title ?? '', url: node?.url ?? '', parentId: node?.parentId ?? initial?.parentId ?? '' }); const choices = getFolderOptions(nodes, node && isFolder(node) ? node.id : undefined); return <Frame onClose={onClose} title={node ? '编辑服务器书签' : value.kind === 'folder' ? '新建文件夹' : '新建服务器书签'}><form className="editor-form" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}><label className="field-label">名称<input autoFocus onChange={(event) => setValue({ ...value, title: event.target.value })} required value={value.title} /></label>{value.kind === 'bookmark' && <label className="field-label">网址<input onChange={(event) => setValue({ ...value, url: event.target.value })} placeholder="https://example.com" required type="url" value={value.url} /></label>}<label className="field-label">保存到<select onChange={(event) => setValue({ ...value, parentId: event.target.value })} value={value.parentId}><option data-i18n-force value="">根目录</option>{choices.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="primary-button" disabled={busy || !value.title.trim() || (value.kind === 'bookmark' && !value.url.trim())} type="submit">{busy ? '保存中…' : '保存到服务器'}</button></div></form></Frame>; }
function MoveModal({ busy, node, nodes, onClose, onSubmit }: { busy: boolean; node?: BookmarkNode; nodes: BookmarkNode[]; onClose: () => void; onSubmit: (parent: string) => void }) { if (!node) return null; const choices = getFolderOptions(nodes, isFolder(node) ? node.id : undefined); const [parent, setParent] = useState(node.parentId ?? ''); return <Frame onClose={onClose} title="移动服务器书签"><form className="editor-form" onSubmit={(event) => { event.preventDefault(); onSubmit(parent); }}><label className="field-label">目标文件夹<select onChange={(event) => setParent(event.target.value)} value={parent}><option data-i18n-force value="">根目录</option>{choices.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></label><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="primary-button" disabled={busy} type="submit">{busy ? '移动中…' : '移动'}</button></div></form></Frame>; }
function DeleteModal({ busy, node, onClose, onConfirm }: { busy: boolean; node?: BookmarkNode; onClose: () => void; onConfirm: () => void }) { if (!node) return null; return <Frame onClose={onClose} title={node.url ? '删除书签？' : '删除文件夹？'}><div className="delete-content"><Trash2 size={20} /><p>将 <strong>{node.title}</strong> 移入服务器书签库回收站。{node.url ? '' : '文件夹中的内容也会一并移入。'}</p></div><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">取消</button><button className="danger-button" disabled={busy} onClick={onConfirm} type="button">{busy ? '删除中…' : '移入回收站'}</button></div></Frame>; }
export default App;
