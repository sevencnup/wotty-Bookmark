import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, CheckCircle2, Edit3, ExternalLink, Folder, FolderInput, HardDriveUpload, LoaderCircle, Plus, RefreshCw, RotateCcw, Search, Server, Trash2, X } from 'lucide-react'
import * as api from './api'
import { forgetLibraryFavicon, getCachedLibraryFavicon, getLibraryFaviconCandidates, rememberLibraryFavicon } from './library-favicon'
import { confirmDangerousAction } from './preferences'
import { getVirtualWindow } from './virtual-list'

type CreateKind = 'bookmark' | 'folder'
type EditTarget = { id: string; nodeType: 'bookmark' | 'folder'; title: string; url?: string; parentId: string | null; folderPath?: string }

type FlatLibraryFolder = api.LibraryFolder & { depth: number; parentId: string | null; folderPath: string }

function flattenFolders(folders: api.LibraryFolder[], depth = 0, parentId: string | null = null, parentPath = ''): FlatLibraryFolder[] {
  return folders.flatMap((folder) => {
    const folderPath = parentPath ? `${parentPath} / ${folder.title}` : folder.title
    const flatFolder = { ...folder, depth, parentId, folderPath }
    return [flatFolder, ...flattenFolders(folder.children, depth + 1, folder.id, folderPath)]
  })
}

function prettyDate(value: string) {
  const date = new Date(value.endsWith('Z') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export function LibraryManagementPage({ token }: { token: string }) {
  const [library, setLibrary] = useState<api.LibraryTree | null>(null)
  const [trash, setTrash] = useState<api.LibraryTrashItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [kind, setKind] = useState<CreateKind>('bookmark')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [parentId, setParentId] = useState('')
  const [favicons, setFavicons] = useState<Record<string, string>>({})
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const [nextLibrary, nextTrash] = await Promise.all([api.getLibrary(token), api.getLibraryTrash(token)])
      setLibrary(nextLibrary)
      setTrash(nextTrash)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取服务器书签库')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const refreshSilently = () => {
      if (document.visibilityState === 'visible') void load({ silent: true })
    }
    window.addEventListener('focus', refreshSilently)
    document.addEventListener('visibilitychange', refreshSilently)
    const interval = window.setInterval(refreshSilently, 10_000)
    return () => {
      window.removeEventListener('focus', refreshSilently)
      document.removeEventListener('visibilitychange', refreshSilently)
      window.clearInterval(interval)
    }
  }, [load])
  const folders = useMemo(() => flattenFolders(library?.folders ?? []), [library])
  const visibleBookmarks = useMemo(() => (library?.bookmarks ?? []).filter((bookmark) => `${bookmark.title} ${bookmark.url} ${bookmark.folderPath}`.toLowerCase().includes(query.trim().toLowerCase())), [library, query])
  useEffect(() => {
    let active = true
    if (!library?.bookmarks.length) { setFavicons({}); return () => { active = false } }
    void api.resolveLibraryFavicons(token, library.bookmarks.map((bookmark) => bookmark.url)).then((next) => {
      if (active) setFavicons((current) => ({ ...current, ...next }))
    }).catch(() => {
      // The browser-side favicon fallback still works when the API cannot reach a site.
    })
    return () => { active = false }
  }, [token, library])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action(); setNotice(success); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败，请重试') } finally { setBusy(false) }
  }

  const create = () => {
    if (!title.trim() || (kind === 'bookmark' && !url.trim())) return
    void run(async () => {
      if (kind === 'folder') await api.createLibraryFolder(token, { title: title.trim(), parentId: parentId || null })
      else await api.createLibraryBookmark(token, { title: title.trim(), url: url.trim(), parentId: parentId || null })
      setTitle(''); setUrl(''); setParentId('')
    }, kind === 'folder' ? '文件夹已保存到服务器书签库' : '书签已保存到服务器书签库')
  }

  const uploadXbel = async (file: File) => {
    const xbel = await file.text()
    const hasContent = library !== null && (library.bookmarks.length > 0 || library.folders.length > 0)
    const replace = hasContent && confirmDangerousAction('导入会替换当前服务器书签库。确定继续吗？')
    if (!replace && library && (library.bookmarks.length > 0 || library.folders.length > 0)) return
    await run(async () => { const result = await api.importLibraryXbel(token, xbel, replace); setNotice(`已导入 ${result.count} 个节点到服务器书签库`) }, '导入完成')
  }

  const openEdit = (target: EditTarget) => {
    if (target.nodeType === 'folder' && !target.folderPath) {
      const folder = folders.find((item) => item.id === target.id)
      setEditTarget(folder ? { ...target, folderPath: folder.folderPath } : target)
      return
    }
    setEditTarget(target)
  }

  const saveEdit = async (target: EditTarget, nextTitle: string, nextUrl: string, nextParentId: string) => {
    const titleValue = nextTitle.trim()
    const urlValue = nextUrl.trim()
    if (!titleValue || (target.nodeType === 'bookmark' && !urlValue)) return
    await run(async () => {
      await api.updateLibraryNode(token, target.id, target.nodeType === 'bookmark' ? { title: titleValue, url: urlValue } : { title: titleValue })
      if (nextParentId !== (target.parentId ?? '')) await api.moveLibraryNode(token, target.id, nextParentId || null)
      setEditTarget(null)
    }, target.nodeType === 'bookmark' ? '书签已更新' : '文件夹已更新')
  }

  const deleteNode = (target: EditTarget) => {
    const kindLabel = target.nodeType === 'folder' ? '文件夹及其内容' : '书签'
    const message = target.nodeType === 'folder'
      ? `将“${target.title}”及其子内容移入服务器书签库回收站？`
      : `将“${target.title}”移入服务器书签库回收站？`
    if (confirmDangerousAction(message)) {
      void run(() => api.deleteLibraryNode(token, target.id), `${kindLabel}已移入服务器书签库回收站`)
    }
  }

  const permanentlyDeleteTrash = (item: api.LibraryTrashItem) => {
    if (!confirmDangerousAction(`将“${item.title}”及其子内容永久删除？此操作无法恢复。`)) return
    void run(() => api.permanentlyDeleteLibraryTrashNode(token, item.id), '已永久删除回收站内容')
  }

  const emptyLibraryTrash = () => {
    if (!confirmDangerousAction('清空服务器书签库回收站？所有已删除内容都将永久删除，无法恢复。')) return
    void run(() => api.emptyLibraryTrash(token), '服务器书签库回收站已清空')
  }

  return <div className="feature-page library-page">
    <section className="panel library-hero">
      <div className="library-hero-icon"><Server size={26} /></div>
      <div><p className="eyebrow">SERVER IS THE SOURCE OF TRUTH</p><h3>我的服务器书签库</h3><p>这一份书签独立于 Floccus 和浏览器原生书签。WOTTY 侧边栏的“收藏当前页”只写入此处，不会读取或改动浏览器的书签栏。</p></div>
      <span className="service-status online"><i />独立书签库</span>
    </section>
    {error && <div className="page-alert">{error}</div>}
    {notice && <div className="page-alert success"><CheckCircle2 size={16} />{notice}</div>}
    <section className="panel library-create-panel">
      <div className="panel-heading"><div><p className="eyebrow">DIRECT TO SERVER</p><h3>新建内容</h3></div></div>
      <div className="library-kind-switch"><button className={kind === 'bookmark' ? 'active' : ''} onClick={() => setKind('bookmark')} type="button"><Bookmark size={15} />书签</button><button className={kind === 'folder' ? 'active' : ''} onClick={() => setKind('folder')} type="button"><Folder size={15} />文件夹</button></div>
      <div className="library-create-grid"><label>名称<input onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'folder' ? '例如：稍后阅读' : '书签名称'} value={title} /></label>{kind === 'bookmark' && <label>网址<input onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" type="url" value={url} /></label>}<label>保存到<select onChange={(event) => setParentId(event.target.value)} value={parentId}><option value="">根目录</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.title}</option>)}</select></label><button className="primary-button" disabled={busy || !title.trim() || (kind === 'bookmark' && !url.trim())} onClick={create} type="button"><Plus size={15} />保存到服务器</button></div>
    </section>
    <section className="library-transfer-grid">
      <article className="panel library-transfer-card"><FolderInput size={22} /><div><h3>从 Floccus 同步库迁移</h3><p>复制当前 XBEL 同步索引到服务器书签库。它不会删除或改写 Floccus 数据。</p></div><button className="toolbar-button" disabled={busy} onClick={() => void run(async () => { const result = await api.importLibraryFromSync(token); setNotice(`已迁移 ${result.count} 个节点`) }, '迁移完成')} type="button">{busy ? '处理中…' : '复制现有同步书签'}</button></article>
      <article className="panel library-transfer-card"><HardDriveUpload size={22} /><div><h3>导入 XBEL 备份</h3><p>适用于导出旧浏览器书签后开始自有库模式。当前支持 XBEL 文件。</p></div><input accept=".xbel,application/xml,text/xml" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadXbel(file); event.target.value = '' }} ref={fileInput} type="file" /><button className="toolbar-button" disabled={busy} onClick={() => fileInput.current?.click()} type="button">选择 XBEL 文件</button></article>
    </section>
    <section className="panel library-list-panel">
      <div className="panel-heading library-list-heading"><div><p className="eyebrow">SERVER LIBRARY</p><h3>{library?.bookmarks.length ?? 0} 条书签 <span>·</span> {folders.length} 个文件夹</h3></div><div className="library-heading-actions"><span className="library-result-count">显示 {visibleBookmarks.length} 条</span><button className="toolbar-button" disabled={loading || busy} onClick={() => void load()} type="button"><RefreshCw className={loading ? 'spin' : ''} size={15} />刷新</button></div></div>
      <div className="library-list-toolbar"><label className="bookmark-search library-search"><Search size={15} /><input aria-label="搜索服务器书签" onChange={(event) => setQuery(event.target.value)} placeholder="搜索书签名称、网址或文件夹" type="search" value={query} />{query && <button aria-label="清除搜索" className="library-search-clear" onClick={() => setQuery('')} type="button"><X size={14} /></button>}</label>{query && <span className="library-search-hint">当前筛选：{visibleBookmarks.length} 条</span>}</div>
      {loading ? <div className="feature-loading compact-loading"><LoaderCircle className="spin" size={25} /><strong>正在读取服务器书签库…</strong></div> : visibleBookmarks.length ? <VirtualBookmarkList bookmarks={visibleBookmarks} favicons={favicons} busy={busy} onEdit={(bookmark) => openEdit({ id: bookmark.id, nodeType: 'bookmark', title: bookmark.title, url: bookmark.url, parentId: bookmark.parentId })} onDelete={(bookmark) => deleteNode({ id: bookmark.id, nodeType: 'bookmark', title: bookmark.title, url: bookmark.url, parentId: bookmark.parentId })} /> : <div className="feature-empty compact-empty"><Bookmark size={25} /><h3>{query ? '没有匹配的书签' : '服务器书签库还是空的'}</h3><p>{query ? '请更换搜索关键词。' : '可在侧边栏收藏当前页，或从上方迁移 / 导入书签。'}</p></div>}
    </section>
    <section className="panel library-folders-panel"><div className="panel-heading"><div><p className="eyebrow">SERVER FOLDERS</p><h3>文件夹管理</h3></div><span>{folders.length} 个</span></div>{folders.length ? <div className="library-folder-list">{folders.map((folder) => <div className="library-folder-row" key={folder.id}><span className="library-folder-icon"><Folder size={16} /></span><div className="library-folder-copy"><strong>{folder.title}</strong><small>{folder.folderPath ?? ''}{folder.bookmarkCount ? ` · ${folder.bookmarkCount} 条书签` : ''}</small></div><span className="library-folder-depth">{folder.depth === 0 ? '根目录下' : `${folder.depth} 级`}</span><div className="library-row-actions"><button aria-label={`编辑文件夹 ${folder.title}`} className="library-edit-button" disabled={busy} onClick={() => openEdit({ id: folder.id, nodeType: 'folder', title: folder.title, parentId: folder.parentId })} title="编辑文件夹" type="button"><Edit3 size={14} /></button><button aria-label={`删除文件夹 ${folder.title}`} className="library-delete-button row-action danger-action" disabled={busy} onClick={() => deleteNode({ id: folder.id, nodeType: 'folder', title: folder.title, parentId: folder.parentId })} title="移入回收站" type="button"><Trash2 size={15} /></button></div></div>)}</div> : <p className="form-hint">暂无文件夹，可在上方新建文件夹。</p>}</section>
    <section className="panel library-trash-panel"><div className="panel-heading"><div><p className="eyebrow">SERVER LIBRARY TRASH</p><h3>服务器书签库回收站</h3></div><div className="inline-actions"><span>{trash.length} 项</span>{trash.length > 0 && <button className="danger-button compact" disabled={busy} onClick={emptyLibraryTrash} type="button"><Trash2 size={14} />清空</button>}</div></div>{trash.length ? <div className="library-trash-list">{trash.map((item) => <div className="library-trash-row" key={item.id}><span>{item.nodeType === 'folder' ? <Folder size={16} /> : <Bookmark size={16} />}</span><div><strong>{item.title}</strong><small>删除于 {prettyDate(item.deletedAt)}</small></div><div className="library-row-actions"><button className="toolbar-button compact" disabled={busy} onClick={() => void run(() => api.restoreLibraryNode(token, item.id), '已从回收站恢复到服务器书签库')} type="button"><RotateCcw size={14} />恢复</button><button aria-label={`永久删除 ${item.title}`} className="danger-button compact" disabled={busy} onClick={() => permanentlyDeleteTrash(item)} title="永久删除" type="button"><Trash2 size={14} /></button></div></div>)}</div> : <p className="form-hint">暂无已删除的服务器书签。这里与 Floccus 同步回收站完全独立。</p>}</section>
    {editTarget && <LibraryEditDialog folders={folders} target={editTarget} busy={busy} onCancel={() => setEditTarget(null)} onSave={(nextTitle, nextUrl, nextParentId) => void saveEdit(editTarget, nextTitle, nextUrl, nextParentId)} />}
  </div>
}

function getLibraryHost(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value }
}

function getFaviconSource(url: string, favicons: Record<string, string>) {
  try { return favicons[new URL(url).origin] ?? null } catch { return null }
}

const LIBRARY_ROW_HEIGHT = 76

function VirtualBookmarkList({ bookmarks, favicons, busy, onEdit, onDelete }: { bookmarks: api.LibraryBookmark[]; favicons: Record<string, string>; busy: boolean; onEdit: (bookmark: api.LibraryBookmark) => void; onDelete: (bookmark: api.LibraryBookmark) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(520)
  const virtualWindow = useMemo(() => getVirtualWindow(bookmarks.length, scrollTop, viewportHeight, LIBRARY_ROW_HEIGHT, 5), [bookmarks.length, scrollTop, viewportHeight])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateHeight = () => setViewportHeight(viewport.clientHeight || 520)
    updateHeight()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateHeight)
    observer?.observe(viewport)
    return () => observer?.disconnect()
  }, [])

  useEffect(() => {
    setScrollTop(0)
    if (viewportRef.current) viewportRef.current.scrollTop = 0
  }, [bookmarks])

  return <div className="library-virtual-viewport" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} ref={viewportRef} role="list" aria-label="服务器书签列表"><div className="library-virtual-spacer" style={{ height: virtualWindow.totalSize }}><div className="library-virtual-items" style={{ transform: `translateY(${virtualWindow.offset}px)` }}>{bookmarks.slice(virtualWindow.start, virtualWindow.end).map((bookmark) => <article className="library-bookmark-row library-virtual-row" key={bookmark.id} role="listitem"><LibrarySiteIcon title={bookmark.title} url={bookmark.url} source={getFaviconSource(bookmark.url, favicons)} /><div className="library-bookmark-copy"><a className="library-bookmark-title" href={bookmark.url} rel="noreferrer" target="_blank" title={bookmark.title}><strong>{bookmark.title || '未命名书签'}</strong><ExternalLink aria-hidden="true" size={12} /></a><div className="library-bookmark-meta"><span className="library-bookmark-host">{getLibraryHost(bookmark.url)}</span><span className="library-bookmark-url" title={bookmark.url}>{bookmark.url}</span></div></div><span className="category-pill library-bookmark-folder" title={bookmark.folderPath || '根目录'}>{bookmark.folderPath || '根目录'}</span><div className="library-row-actions"><a aria-label={`打开 ${bookmark.title || bookmark.url}`} className="library-open-button" href={bookmark.url} rel="noreferrer" target="_blank" title="打开书签"><ExternalLink size={14} /></a><button aria-label={`编辑 ${bookmark.title || bookmark.url}`} className="library-edit-button" disabled={busy} onClick={() => onEdit(bookmark)} title="编辑书签" type="button"><Edit3 size={14} /></button><button aria-label={`删除 ${bookmark.title || bookmark.url}`} className="library-delete-button row-action danger-action" disabled={busy} onClick={() => onDelete(bookmark)} title="移入回收站" type="button"><Trash2 size={15} /></button></div></article>)}</div></div></div>
}

function LibraryEditDialog({ folders, target, busy, onCancel, onSave }: { folders: FlatLibraryFolder[]; target: EditTarget; busy: boolean; onCancel: () => void; onSave: (title: string, url: string, parentId: string) => void }) {
  const [nextTitle, setNextTitle] = useState(target.title)
  const [nextUrl, setNextUrl] = useState(target.url ?? '')
  const [nextParentId, setNextParentId] = useState(target.parentId ?? '')
  const canSave = Boolean(nextTitle.trim() && (target.nodeType === 'folder' || nextUrl.trim()))
  const excludedFolderIds = useMemo(() => {
    const excluded = new Set<string>()
    if (target.nodeType !== 'folder') return excluded
    excluded.add(target.id)
    let changed = true
    while (changed) {
      changed = false
      folders.forEach((folder) => {
        if (folder.parentId && excluded.has(folder.parentId) && !excluded.has(folder.id)) {
          excluded.add(folder.id)
          changed = true
        }
      })
    }
    return excluded
  }, [folders, target.id, target.nodeType])
  const availableFolders = folders.filter((folder) => !excludedFolderIds.has(folder.id))
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }} role="presentation"><section aria-labelledby="library-edit-title" aria-modal="true" className="admin-modal library-edit-modal" role="dialog"><div className="modal-heading"><h2 id="library-edit-title">{target.nodeType === 'folder' ? '编辑文件夹' : '编辑书签'}</h2><button aria-label="关闭" className="modal-close" onClick={onCancel} type="button">×</button></div><label>名称<input autoFocus onChange={(event) => setNextTitle(event.target.value)} value={nextTitle} /></label>{target.nodeType === 'bookmark' && <label>网址<input onChange={(event) => setNextUrl(event.target.value)} type="url" value={nextUrl} /></label>}<label>所在文件夹<select onChange={(event) => setNextParentId(event.target.value)} value={nextParentId}><option value="">根目录</option>{availableFolders.map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.title}</option>)}</select></label><p className="modal-description">{target.nodeType === 'folder' ? '移动文件夹会保留其中的书签和子文件夹。' : '修改后会立即同步到服务器书签库。'}</p><div className="modal-actions"><button className="ghost-button" disabled={busy} onClick={onCancel} type="button">取消</button><button className="primary-button" disabled={busy || !canSave} onClick={() => onSave(nextTitle, nextUrl, nextParentId)} type="button">{busy ? '保存中…' : '保存修改'}</button></div></section></div>
}

function LibrarySiteIcon({ title, url, source }: { title: string; url: string; source: string | null }) {
  const host = getLibraryHost(url)
  const initial = (host || title || '?').trim().charAt(0).toUpperCase()
  const candidates = useMemo(() => getLibraryFaviconCandidates(url), [url])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const [cachedFallback, setCachedFallback] = useState<string | null>(() => getCachedLibraryFavicon(url))
  const [resolvedSource, setResolvedSource] = useState<string | null>(() => source?.startsWith('data:') ? source : null)
  const [resolvedUrl, setResolvedUrl] = useState(url)
  const preferredSource = source && failedSource !== source
    ? source
    : cachedFallback && cachedFallback !== failedSource
      ? cachedFallback
      : candidates[candidateIndex] ?? null
  const visibleSource = resolvedUrl === url ? resolvedSource : null

  useEffect(() => {
    setCandidateIndex(0)
    setFailedSource(null)
    setCachedFallback(getCachedLibraryFavicon(url))
    setResolvedSource(source?.startsWith('data:') ? source : null)
    setResolvedUrl(url)
  }, [url])

  useEffect(() => {
    if (!preferredSource || preferredSource === visibleSource) return
    let active = true
    let settled = false
    const image = new Image()
    const timeout = window.setTimeout(() => finish(false), 3500)
    const finish = (loaded: boolean) => {
      if (!active || settled) return
      settled = true
      window.clearTimeout(timeout)
      if (loaded) {
        setResolvedSource(preferredSource)
        setResolvedUrl(url)
        if (preferredSource !== source) {
          rememberLibraryFavicon(url, preferredSource)
          setCachedFallback(preferredSource)
        }
        return
      }
      if (preferredSource === source) {
        setFailedSource(preferredSource)
        setResolvedSource(null)
      } else if (preferredSource === cachedFallback) {
        forgetLibraryFavicon(url, preferredSource)
        setCachedFallback(null)
        setResolvedSource(null)
        setCandidateIndex(0)
      } else {
        setCandidateIndex((index) => index + 1)
      }
    }
    image.onload = () => finish(true)
    image.onerror = () => finish(false)
    image.src = preferredSource
    return () => {
      active = false
      window.clearTimeout(timeout)
      image.onload = null
      image.onerror = null
    }
  }, [cachedFallback, preferredSource, source, url, visibleSource])

  return <span className={'library-site-icon ' + (!visibleSource ? 'is-fallback' : '')} title={host || '网站图标'}>{visibleSource ? <img alt="" decoding="async" height={20} loading="eager" referrerPolicy="no-referrer" src={visibleSource} width={20} /> : <span aria-hidden="true">{initial}</span>}</span>
}
