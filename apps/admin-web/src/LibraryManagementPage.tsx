import { useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, CheckCircle2, ExternalLink, Folder, FolderInput, HardDriveUpload, LoaderCircle, Plus, RefreshCw, RotateCcw, Search, Server, Trash2, X } from 'lucide-react'
import * as api from './api'

type CreateKind = 'bookmark' | 'folder'

function flattenFolders(folders: api.LibraryFolder[], depth = 0): Array<api.LibraryFolder & { depth: number }> {
  return folders.flatMap((folder) => [{ ...folder, depth }, ...flattenFolders(folder.children, depth + 1)])
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
  const fileInput = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextLibrary, nextTrash] = await Promise.all([api.getLibrary(token), api.getLibraryTrash(token)])
      setLibrary(nextLibrary)
      setTrash(nextTrash)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取服务器书签库')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [token])
  const folders = useMemo(() => flattenFolders(library?.folders ?? []), [library])
  const visibleBookmarks = useMemo(() => (library?.bookmarks ?? []).filter((bookmark) => `${bookmark.title} ${bookmark.url} ${bookmark.folderPath}`.toLowerCase().includes(query.trim().toLowerCase())), [library, query])

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
    const replace = library !== null && (library.bookmarks.length > 0 || library.folders.length > 0) && window.confirm('导入会替换当前服务器书签库。确定继续吗？')
    if (!replace && library && (library.bookmarks.length > 0 || library.folders.length > 0)) return
    await run(async () => { const result = await api.importLibraryXbel(token, xbel, replace); setNotice(`已导入 ${result.count} 个节点到服务器书签库`) }, '导入完成')
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
      {loading ? <div className="feature-loading compact-loading"><LoaderCircle className="spin" size={25} /><strong>正在读取服务器书签库…</strong></div> : visibleBookmarks.length ? <div className="library-table" role="list">{visibleBookmarks.map((bookmark) => <article className="library-bookmark-row" key={bookmark.id} role="listitem"><LibrarySiteIcon title={bookmark.title} url={bookmark.url} /><div className="library-bookmark-copy"><a className="library-bookmark-title" href={bookmark.url} rel="noreferrer" target="_blank" title={bookmark.title}><strong>{bookmark.title || '未命名书签'}</strong><ExternalLink aria-hidden="true" size={12} /></a><div className="library-bookmark-meta"><span className="library-bookmark-host">{getLibraryHost(bookmark.url)}</span><span className="library-bookmark-url" title={bookmark.url}>{bookmark.url}</span></div></div><span className="category-pill library-bookmark-folder" title={bookmark.folderPath || '根目录'}>{bookmark.folderPath || '根目录'}</span><div className="library-row-actions"><a aria-label={`打开 ${bookmark.title || bookmark.url}`} className="library-open-button" href={bookmark.url} rel="noreferrer" target="_blank" title="打开书签"><ExternalLink size={14} /></a><button aria-label={`删除 ${bookmark.title || bookmark.url}`} className="library-delete-button row-action danger-action" disabled={busy} onClick={() => { if (window.confirm(`将“${bookmark.title}”移入服务器书签库回收站？`)) void run(() => api.deleteLibraryNode(token, bookmark.id), '已移入服务器书签库回收站') }} title="移入回收站" type="button"><Trash2 size={15} /></button></div></article>)}</div> : <div className="feature-empty compact-empty"><Bookmark size={25} /><h3>{query ? '没有匹配的书签' : '服务器书签库还是空的'}</h3><p>{query ? '请更换搜索关键词。' : '可在侧边栏收藏当前页，或从上方迁移 / 导入书签。'}</p></div>}
    </section>
    <section className="panel library-trash-panel"><div className="panel-heading"><div><p className="eyebrow">SERVER LIBRARY TRASH</p><h3>服务器书签库回收站</h3></div><span>{trash.length} 项</span></div>{trash.length ? <div className="library-trash-list">{trash.map((item) => <div className="library-trash-row" key={item.id}><span>{item.nodeType === 'folder' ? <Folder size={16} /> : <Bookmark size={16} />}</span><div><strong>{item.title}</strong><small>删除于 {prettyDate(item.deletedAt)}</small></div><button className="toolbar-button compact" disabled={busy} onClick={() => void run(() => api.restoreLibraryNode(token, item.id), '已从回收站恢复到服务器书签库')} type="button"><RotateCcw size={14} />恢复</button></div>)}</div> : <p className="form-hint">暂无已删除的服务器书签。这里与 Floccus 同步回收站完全独立。</p>}</section>
  </div>
}

function getLibraryHost(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value }
}

function getLibraryFaviconUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return new URL('/favicon.ico', parsed.origin).toString()
  } catch { return null }
}

function LibrarySiteIcon({ title, url }: { title: string; url: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  const favicon = getLibraryFaviconUrl(url)
  const host = getLibraryHost(url)
  const initial = (host || title || '?').trim().charAt(0).toUpperCase()
  return <span className={`library-site-icon ${failed || !favicon ? 'is-fallback' : ''}`} title={host || '网站图标'}>{favicon && !failed ? <img alt="" decoding="async" loading="lazy" onError={() => setFailed(true)} src={favicon} /> : <span aria-hidden="true">{initial}</span>}</span>
}
