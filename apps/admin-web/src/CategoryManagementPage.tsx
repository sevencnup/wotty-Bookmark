import { ChevronDown, ChevronRight, Folder, FolderOpen, Folders, GripVertical, Home, Link2, LoaderCircle, RefreshCw, Search, Sparkles } from 'lucide-react'
import type { DragEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import { descendantFolderIds, flattenFolders as flattenBookmarkFolders, folderHasChildren, groupBookmarksByFolder, resolveDraggedBookmarkIds, type FlatBookmarkFolder } from './bookmark-tree'

type Props = {
  token: string
  onOpenFloccus: () => void
}

type DragState = {
  ids: string[]
  sourceFolderIds: Set<string>
} | null

export function CategoryManagementPage({ token, onOpenFloccus }: Props) {
  const [tree, setTree] = useState<api.BookmarkTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<DragState>(null)
  const [dropFolderId, setDropFolderId] = useState<string | null>(null)
  const [treeZoom, setTreeZoom] = useState(1)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const treeCanvasRef = useRef<HTMLDivElement>(null)
  const expandedInitializedRef = useRef(false)

  async function load(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true)
    setError('')
    try {
      const nextTree = await api.getBookmarks(token)
      setTree(nextTree)
      setSelectedIds((current) => new Set([...current].filter((id) => nextTree.bookmarks.some((bookmark) => bookmark.id === id))))
      if (!expandedInitializedRef.current && nextTree.folders.length > 0) {
        setExpandedIds(new Set(allFolderIds(nextTree.folders)))
        expandedInitializedRef.current = true
      }
    } catch (requestError) {
      setError(readableError(requestError, '书签分类读取失败'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void load() }, [token])

  const selectedFolder = useMemo(() => {
    if (!tree || selectedFolderId === 'all') return null
    return findFolder(tree.folders, selectedFolderId)
  }, [tree, selectedFolderId])
  const folderIds = selectedFolder ? new Set(descendantFolderIds(selectedFolder)) : null
  const normalizedQuery = query.trim().toLowerCase()
  const visibleBookmarks = (tree?.bookmarks ?? []).filter((bookmark) => {
    const inFolder = !folderIds || (bookmark.parentId ? folderIds.has(bookmark.parentId) : false)
    const searchable = `${bookmark.title} ${bookmark.url} ${bookmark.folderPath}`.toLowerCase()
    return inFolder && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
  const allFolders = tree?.folders ?? []
  const bookmarkGroups = groupBookmarksByFolder(visibleBookmarks, allFolders)
  const ready = tree?.status === 'ready'

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allSelected = visibleBookmarks.length > 0 && visibleBookmarks.every((bookmark) => next.has(bookmark.id))
      visibleBookmarks.forEach((bookmark) => allSelected ? next.delete(bookmark.id) : next.add(bookmark.id))
      return next
    })
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroupIds((current) => toggleSet(current, groupId))
  }

  function toggleGroupSelection(bookmarks: api.BookmarkItem[]) {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allSelected = bookmarks.length > 0 && bookmarks.every((bookmark) => next.has(bookmark.id))
      bookmarks.forEach((bookmark) => allSelected ? next.delete(bookmark.id) : next.add(bookmark.id))
      return next
    })
  }

  function expandBookmarkGroups() {
    setCollapsedGroupIds(new Set())
  }

  function collapseBookmarkGroups() {
    setCollapsedGroupIds(new Set(bookmarkGroups.map((group) => group.id)))
  }

  function selectFolder(folderId: string) {
    setSelectedFolderId(folderId)
    setCollapsedGroupIds((current) => {
      if (!current.has(folderId)) return current
      const next = new Set(current)
      next.delete(folderId)
      return next
    })
  }

  async function moveBookmarks(bookmarkIds: string[], parentId: string) {
    if (!tree || !ready || moving) return
    const firstId = bookmarkIds[0] ?? ''
    const ids = resolveDraggedBookmarkIds(tree.bookmarks, firstId, new Set(bookmarkIds))
    if (!ids.length) return
    if (ids.every((id) => tree.bookmarks.find((bookmark) => bookmark.id === id)?.parentId === parentId)) {
      setNotice('这些书签已经在目标文件夹中')
      return
    }
    setMoving(true)
    setError('')
    setNotice('')
    try {
      if (ids.length === 1) await api.moveBookmark(token, ids[0], parentId, tree.etag)
      else await api.moveBookmarks(token, ids, parentId, tree.etag)
      setNotice(`已将 ${ids.length} 个书签归入目标文件夹`)
      setSelectedIds(new Set())
      await load()
    } catch (requestError) {
      await load()
      setError(readableError(requestError, '书签归类失败，请刷新后重试'))
    } finally {
      setMoving(false)
      setDrag(null)
      setDropFolderId(null)
    }
  }

  function beginDrag(event: DragEvent<HTMLButtonElement>, bookmarkId: string) {
    if (!ready || moving) return
    const ids = resolveDraggedBookmarkIds(tree?.bookmarks ?? [], bookmarkId, selectedIds)
    if (!ids.length) return
    const sourceFolderIds = new Set(ids
      .map((id) => tree?.bookmarks.find((bookmark) => bookmark.id === id)?.parentId)
      .filter((id): id is string => Boolean(id)))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', ids.join(','))
    setDrag({ ids, sourceFolderIds })
  }

  function allowDrop(event: DragEvent<HTMLDivElement>, folderId: string) {
    if (!drag || moving) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropFolderId(folderId)
  }

  function dropOnFolder(event: DragEvent<HTMLDivElement>, folderId: string) {
    if (!drag || moving) return
    event.preventDefault()
    const ids = event.dataTransfer.getData('text/plain').split(',').filter(Boolean)
      if (ids.length > 0) {
        void moveBookmarks(ids, folderId)
      }
  }

  function endDrag() {
    setDrag(null)
    setDropFolderId(null)
  }

  function toggleFolder(folderId: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  function expandAll() {
    setExpandedIds(new Set(allFolderIds(allFolders)))
  }

  function collapseAll() {
    setExpandedIds(new Set())
  }

  function zoomTree(delta: number) {
    setTreeZoom((value) => Math.min(1.2, Math.max(0.65, Number((value + delta).toFixed(2)))))
  }

  function resetTreeView() {
    setTreeZoom(1)
    treeCanvasRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' })
  }

  return <div className="category-management-page">
    {error && <div aria-live="polite" className="bookmark-alert error"><strong>操作失败</strong><span>{error}</span></div>}
    {notice && <div aria-live="polite" className="bookmark-alert success"><strong>已完成</strong><span>{notice}</span></div>}
    {loading ? <section className="panel category-state"><LoaderCircle className="spin" size={30} /><strong>正在加载书签组织结构…</strong><p>正在读取最新的文件夹和书签索引。</p></section> : tree?.status === 'encrypted' ? <section className="panel category-state"><Sparkles size={30} /><strong>同步文件已加密，暂时无法建立分类树</strong><p>服务器无法读取加密文件中的文件夹和书签。请在 Floccus 或浏览器书签中完成整理。</p><button className="primary-button" onClick={onOpenFloccus} type="button">打开 Floccus 配置</button></section> : tree?.status !== 'ready' ? <section className="panel category-state"><FolderOpen size={30} /><strong>还没有可用的书签索引</strong><p>完成一次明文 XBEL 同步后，这里会显示从总目录衍生的文件夹组织树。</p><button className="primary-button" onClick={onOpenFloccus} type="button">前往同步配置</button></section> : <div className="category-workspace">
      <section className="panel category-bookmarks-panel category-layout-bookmarks">
        <div className="category-panel-title">
          <div><p className="eyebrow">BOOKMARKS TO ORGANIZE</p><h3>{selectedFolder ? selectedFolder.title : '全部书签'}</h3></div>
          <div className="category-result-summary"><span className="category-result-count">{visibleBookmarks.length} 个结果 · {bookmarkGroups.length} 个文件夹</span><div className="category-group-actions"><button disabled={bookmarkGroups.length === 0} onClick={expandBookmarkGroups} type="button">展开全部</button><button disabled={bookmarkGroups.length === 0} onClick={collapseBookmarkGroups} type="button">收起全部</button></div></div>
        </div>
        <div className="category-toolbar"><label className="bookmark-search"><Search size={15} /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索书签、网址或文件夹" type="search" value={query} /></label><button className="toolbar-button" disabled={refreshing || moving} onClick={() => void load(true)} type="button">{refreshing ? '刷新中…' : '刷新'}</button></div>
        {selectedIds.size > 0 && <div className="category-bulk-bar"><strong>已选择 {selectedIds.size} 个</strong><span>也可以拖动其中一个批量归类</span><select aria-label="将选中的书签移动到文件夹" onChange={(event) => { if (event.target.value) void moveBookmarks([...selectedIds], event.target.value) }} value=""><option value="">选择目标文件夹…</option>{flattenBookmarkFolders(allFolders).map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.title}</option>)}</select><button className="toolbar-button" onClick={() => setSelectedIds(new Set())} type="button">取消选择</button></div>}
        <div className="category-bookmark-list category-layout-bookmark-list">
          <div className="category-list-header"><label className="checkbox-wrap"><input checked={visibleBookmarks.length > 0 && visibleBookmarks.every((bookmark) => selectedIds.has(bookmark.id))} onChange={toggleAll} type="checkbox" /><span /></label><span className="category-list-title"><Folders size={14} />按文件夹分类</span><span>操作</span></div>
          {visibleBookmarks.length === 0 ? <div className="category-empty"><Search size={25} /><strong>没有匹配的书签</strong><p>换个搜索关键词，或先在右侧选择其他文件夹。</p></div> : bookmarkGroups.map((group) => {
            const groupSelectedCount = group.bookmarks.filter((bookmark) => selectedIds.has(bookmark.id)).length
            const groupAllSelected = groupSelectedCount === group.bookmarks.length
            const groupPartiallySelected = groupSelectedCount > 0 && !groupAllSelected
            const collapsed = !normalizedQuery && collapsedGroupIds.has(group.id)
            return <section className={`category-bookmark-group ${collapsed ? 'collapsed' : ''}`} key={group.id}>
              <div className="category-bookmark-group-header" style={{ paddingLeft: `${12 + Math.min(group.depth, 4) * 10}px` }}>
                <label className={`checkbox-wrap category-group-checkbox ${groupPartiallySelected ? 'partial' : ''}`}><input aria-label={`选择 ${group.path} 中的全部书签`} checked={groupAllSelected} onChange={() => toggleGroupSelection(group.bookmarks)} ref={(node) => { if (node) node.indeterminate = groupPartiallySelected }} type="checkbox" /><span /></label>
                <button aria-expanded={!collapsed} aria-label={`${collapsed ? '展开' : '收起'} ${group.path}`} className="category-group-toggle" onClick={() => toggleGroup(group.id)} type="button">{collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>
                <button className="category-group-summary" onClick={() => toggleGroup(group.id)} type="button"><span className="category-group-icon">{collapsed ? <Folder size={15} /> : <FolderOpen size={15} />}</span><span><strong>{group.title}</strong><small title={group.path}>{group.path}</small></span></button>
                <span className="category-group-count">{group.bookmarks.length}</span>
              </div>
              {!collapsed && <div className="category-group-items">{group.bookmarks.map((bookmark, index) => <div className={`category-bookmark-row ${selectedIds.has(bookmark.id) ? 'selected' : ''} ${drag?.ids.includes(bookmark.id) ? 'dragging' : ''}`} key={bookmark.id}><label className="checkbox-wrap"><input checked={selectedIds.has(bookmark.id)} onChange={() => toggleSelected(bookmark.id)} type="checkbox" /><span /></label><button aria-label={`拖动 ${bookmark.title || bookmark.url}`} className="category-drag-handle" draggable={!moving} onDragEnd={endDrag} onDragStart={(event) => beginDrag(event, bookmark.id)} title="拖动到右侧文件夹" type="button"><GripVertical size={16} /></button><div className="category-bookmark-info"><span className={`site-mark site-mark-${index % 4}`}>{(bookmark.title || '?').charAt(0).toUpperCase()}</span><div><strong title={bookmark.title}>{bookmark.title || '未命名书签'}</strong><small>{getHost(bookmark.url)}</small></div></div><a aria-label={`打开 ${bookmark.title || bookmark.url}`} className="bookmark-open-link" href={bookmark.url} rel="noreferrer" target="_blank"><ExternalLinkIcon /></a></div>)}</div>}
            </section>
          })}
        </div>
        <p className="category-keyboard-hint">书签已按当前文件夹分组；拖动书签右侧的手柄，可放入右侧组织树的任意文件夹。</p>
      </section>
      <aside className="panel category-tree-panel category-layout-tree"><div className="category-panel-title"><div><p className="eyebrow">ORGANIZATION TREE</p><h3>书签组织架构</h3></div><div className="category-tree-actions"><button className="tree-action-button" onClick={collapseAll} type="button">收起</button><button className="tree-action-button" onClick={expandAll} type="button">展开</button><button aria-label="重置组织树视图" className="tree-control-button" onClick={resetTreeView} type="button">⌖</button><button aria-label="刷新分类树" className="icon-button" disabled={refreshing || moving} onClick={() => void load(true)} type="button"><RefreshCw className={refreshing ? 'spin' : ''} size={16} /></button></div></div><p className="category-tree-description">从一个总目录向下衍生分支；每个文件夹节点都可以接收书签</p><div className="organization-tree category-layout-tree-canvas" ref={treeCanvasRef}><div className="organization-tree-canvas" style={{ transform: `scale(${treeZoom})`, transformOrigin: 'top left' }}><div className="organization-root-node"><button aria-current={selectedFolderId === 'all' ? 'page' : undefined} className={`organization-root-card ${selectedFolderId === 'all' ? 'active' : ''}`} onClick={() => selectFolder('all')} type="button"><span className="organization-root-symbol"><Home size={18} /></span><span><strong>全部书签</strong><small>{tree.bookmarks.length} 个书签 · 总目录</small></span></button>{allFolders.length > 0 && <div className="organization-root-rail"><div className="organization-root-rail-line" />{allFolders.map((folder) => <FolderTreeNode drag={drag} dropFolderId={dropFolderId} expandedIds={expandedIds} folder={folder} key={folder.id} moving={moving} onDragLeave={() => setDropFolderId(null)} onDragOver={allowDrop} onDrop={dropOnFolder} onSelect={selectFolder} onToggle={toggleFolder} selectedFolderId={selectedFolderId} />)}</div>}</div></div></div><div className="organization-tree-controls"><button aria-label="缩小组织树" disabled={treeZoom <= 0.65} onClick={() => zoomTree(-0.1)} type="button">−</button><span>{Math.round(treeZoom * 100)}%</span><button aria-label="放大组织树" disabled={treeZoom >= 1.2} onClick={() => zoomTree(0.1)} type="button">＋</button></div><div className="tree-drop-guide"><Link2 size={15} /><span>把左侧书签拖入任意分支文件夹</span></div></aside>
    </div>}
  </div>
}

function FolderTreeNode({ folder, selectedFolderId, expandedIds, dropFolderId, drag, moving, onSelect, onToggle, onDragOver, onDragLeave, onDrop }: { folder: api.BookmarkFolder; selectedFolderId: string; expandedIds: Set<string>; dropFolderId: string | null; drag: DragState; moving: boolean; onSelect: (id: string) => void; onToggle: (id: string) => void; onDragOver: (event: DragEvent<HTMLDivElement>, id: string) => void; onDrop: (event: DragEvent<HTMLDivElement>, id: string) => void; onDragLeave: () => void }) {
  const expanded = expandedIds.has(folder.id)
  const hasChildren = folderHasChildren(folder)
  const isSource = drag?.sourceFolderIds.has(folder.id)
  return <div className="organization-node"><div className={`organization-folder-row ${selectedFolderId === folder.id ? 'active' : ''} ${dropFolderId === folder.id ? 'drop-target' : ''} ${isSource ? 'source-folder' : ''}`} onDragLeave={onDragLeave} onDragOver={(event) => onDragOver(event, folder.id)} onDrop={(event) => onDrop(event, folder.id)}><button aria-expanded={hasChildren ? expanded : undefined} aria-label={hasChildren ? `${expanded ? '折叠' : '展开'} ${folder.title}` : undefined} className={`organization-toggle ${hasChildren ? '' : 'empty'}`} disabled={!hasChildren} onClick={() => onToggle(folder.id)} type="button">{hasChildren ? expanded ? '⌄' : '›' : ''}</button><button aria-current={selectedFolderId === folder.id ? 'page' : undefined} className="organization-folder-button" disabled={moving} onClick={() => onSelect(folder.id)} type="button">{expanded ? <FolderOpen size={17} /> : <Folder size={17} />}<span>{folder.title}</span><small>{folder.bookmarkCount}</small></button>{dropFolderId === folder.id && drag && <span className="folder-drop-label">放入此处</span>}</div>{expanded && hasChildren && <div className="organization-children">{folder.children.map((child) => <FolderTreeNode drag={drag} dropFolderId={dropFolderId} expandedIds={expandedIds} folder={child} key={child.id} moving={moving} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop} onSelect={onSelect} onToggle={onToggle} selectedFolderId={selectedFolderId} />)}</div>}</div>
}

function toggleSet(current: Set<string>, id: string) { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }
function allFolderIds(folders: api.BookmarkFolder[]): string[] { return folders.flatMap((folder) => [folder.id, ...allFolderIds(folder.children)]) }
function findFolder(folders: api.BookmarkFolder[], id: string): api.BookmarkFolder | null { for (const folder of folders) { if (folder.id === id) return folder; const match = findFolder(folder.children, id); if (match) return match } return null }
function flattenFolders(folders: api.BookmarkFolder[], depth = 0): FlatBookmarkFolder[] { return flattenBookmarkFolders(folders, depth) }
function getHost(value: string) { try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value } }
function readableError(error: unknown, fallback: string) { if (error instanceof api.ApiRequestError) { if (error.status === 401) return '登录已过期，请重新登录。'; if (error.status === 409) return '同步文件已变化，请刷新后重试。'; if (error.status === 423) return 'Floccus 正在同步文件，请稍后再试。'; return error.message } return error instanceof Error ? error.message : fallback }
function ExternalLinkIcon() { return <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 24 24" width="13"><path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>}
