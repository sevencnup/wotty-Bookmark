import { ChevronDown, ChevronRight, Folder, FolderOpen, Folders, GripVertical, Home, Link2, LoaderCircle, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import { descendantFolderIds, findFolderParentId, flattenFolders as flattenBookmarkFolders, folderHasChildren, groupBookmarksByFolder, resolveDraggedBookmarkIds, type FlatBookmarkFolder } from './bookmark-tree'
import { toCategoryTree } from './category-library'
import { LibrarySiteIcon } from './LibraryManagementPage'
import { confirmDangerousAction } from './preferences'
import { getVariableVirtualWindow } from './virtual-list'

type Props = {
  token: string
}

type DragState = {
  kind: 'bookmarks'
  ids: string[]
  sourceFolderIds: Set<string>
} | {
  kind: 'folder'
  folderId: string
  title: string
  sourceParentId: string | null
  invalidTargetIds: Set<string>
} | null

type SelectionPaintState = {
  selected: boolean
  visitedIds: Set<string>
} | null

type TreeConnection = {
  id: string
  parentId: string
  childId: string
  path: string
}

type TreeConnectionLayerState = {
  width: number
  height: number
  connections: TreeConnection[]
}

const EMPTY_FOLDERS: api.BookmarkFolder[] = []
const EMPTY_BOOKMARK_IDS: string[] = []
const ROOT_FOLDER_DROP_ID = '__tree_root__'

export function CategoryManagementPage({ token }: Props) {
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
  const [treeConnectionLayer, setTreeConnectionLayer] = useState<TreeConnectionLayerState>({ width: 0, height: 0, connections: [] })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const treeCanvasRef = useRef<HTMLDivElement>(null)
  const treeContentRef = useRef<HTMLDivElement>(null)
  const folderExpandTimerRef = useRef<number | null>(null)
  const folderExpandTargetRef = useRef<string | null>(null)
  const expandedInitializedRef = useRef(false)
  const selectionPaintRef = useRef<SelectionPaintState>(null)

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true)
    setError('')
    try {
      const library = await api.getLibrary(token)
      const nextTree = toCategoryTree(library)
      setTree(nextTree)
      setSelectedIds((current) => new Set([...current].filter((id) => nextTree.bookmarks.some((bookmark) => bookmark.id === id))))
      if (!expandedInitializedRef.current && nextTree.folders.length > 0) {
        setExpandedIds(new Set(allFolderIds(nextTree.folders)))
        expandedInitializedRef.current = true
      }
    } catch (requestError) {
      setError(readableError(requestError, '服务器书签库读取失败'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const refreshSilently = () => {
      if (document.visibilityState === 'visible') void load()
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

  useEffect(() => {
    const stopSelectionPaint = () => {
      const paint = selectionPaintRef.current
      selectionPaintRef.current = null
      if (!paint) return
      setSelectedIds((current) => {
        const next = new Set(current)
        paint.visitedIds.forEach((id) => paint.selected ? next.add(id) : next.delete(id))
        return next
      })
    }
    window.addEventListener('mouseup', stopSelectionPaint)
    window.addEventListener('blur', stopSelectionPaint)
    return () => {
      window.removeEventListener('mouseup', stopSelectionPaint)
      window.removeEventListener('blur', stopSelectionPaint)
    }
  }, [])

  const selectedFolder = useMemo(() => {
    if (!tree || selectedFolderId === 'all') return null
    return findFolder(tree.folders, selectedFolderId)
  }, [tree, selectedFolderId])
  const folderIds = useMemo(() => selectedFolder ? new Set(descendantFolderIds(selectedFolder)) : null, [selectedFolder])
  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query])
  const visibleBookmarks = useMemo(() => (tree?.bookmarks ?? []).filter((bookmark) => {
    const inFolder = !folderIds || (bookmark.parentId ? folderIds.has(bookmark.parentId) : false)
    const searchable = `${bookmark.title} ${bookmark.url} ${bookmark.folderPath}`.toLowerCase()
    return inFolder && (!normalizedQuery || searchable.includes(normalizedQuery))
  }), [folderIds, normalizedQuery, tree])
  const allFolders = tree?.folders ?? EMPTY_FOLDERS
  const flatFolders = useMemo(() => flattenBookmarkFolders(allFolders), [allFolders])
  const bookmarkGroups = useMemo(() => groupBookmarksByFolder(visibleBookmarks, allFolders), [allFolders, visibleBookmarks])
  const draggedIds = drag?.kind === 'bookmarks' ? drag.ids : EMPTY_BOOKMARK_IDS
  const ready = Boolean(tree)

  const drawTreeConnections = useCallback(() => {
    const canvas = treeContentRef.current
    if (!canvas) return
    const canvasRect = canvas.getBoundingClientRect()
    const scaleX = canvas.offsetWidth > 0 ? canvasRect.width / canvas.offsetWidth : 1
    const scaleY = canvas.offsetHeight > 0 ? canvasRect.height / canvas.offsetHeight : scaleX
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return

    const nodes = new Map<string, HTMLElement>()
    canvas.querySelectorAll<HTMLElement>('[data-tree-node-id]').forEach((node) => {
      const id = node.dataset.treeNodeId
      if (id) nodes.set(id, node)
    })

    const connections: TreeConnection[] = []
    canvas.querySelectorAll<HTMLElement>('[data-tree-parent-id]').forEach((child) => {
      const childId = child.dataset.treeNodeId
      const parentId = child.dataset.treeParentId
      const parent = parentId ? nodes.get(parentId) : undefined
      if (!childId || !parentId || !parent) return
      const parentRect = parent.getBoundingClientRect()
      const childRect = child.getBoundingClientRect()
      const startX = (parentRect.right - canvasRect.left - 2) / scaleX
      const startY = (parentRect.top + parentRect.height / 2 - canvasRect.top) / scaleY
      const endX = (childRect.left - canvasRect.left + 2) / scaleX
      const endY = (childRect.top + childRect.height / 2 - canvasRect.top) / scaleY
      const horizontalDistance = Math.max(0, endX - startX)
      const curve = Math.max(28, Math.min(96, horizontalDistance * 0.48))
      connections.push({ id: `${parentId}-${childId}`, parentId, childId, path: `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}` })
    })

    setTreeConnectionLayer({
      width: Math.max(canvas.scrollWidth, canvas.offsetWidth),
      height: Math.max(canvas.scrollHeight, canvas.offsetHeight),
      connections,
    })
  }, [])

  useLayoutEffect(() => {
    const canvas = treeContentRef.current
    if (!canvas) return
    let frame = requestAnimationFrame(drawTreeConnections)
    const redraw = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(drawTreeConnections)
    }
    const resizeObserver = new ResizeObserver(redraw)
    resizeObserver.observe(canvas)
    window.addEventListener('resize', redraw)
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', redraw)
    }
  }, [allFolders, drawTreeConnections, expandedIds, treeZoom])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const beginSelectionPaint = useCallback((event: ReactMouseEvent<HTMLDivElement>, id: string) => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('a, button, input, label, select, textarea')) return
    const selected = !selectedIds.has(id)
    selectionPaintRef.current = { selected, visitedIds: new Set([id]) }
    event.currentTarget.classList.toggle('selected', selected)
    event.preventDefault()
  }, [selectedIds])

  const continueSelectionPaint = useCallback((event: ReactMouseEvent<HTMLDivElement>, id: string) => {
    const paint = selectionPaintRef.current
    if (!paint) return
    if (paint.visitedIds.has(id)) return
    paint.visitedIds.add(id)
    event.currentTarget.classList.toggle('selected', paint.selected)
  }, [])

  function toggleAll() {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allSelected = visibleBookmarks.length > 0 && visibleBookmarks.every((bookmark) => next.has(bookmark.id))
      visibleBookmarks.forEach((bookmark) => allSelected ? next.delete(bookmark.id) : next.add(bookmark.id))
      return next
    })
  }

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroupIds((current) => toggleSet(current, groupId))
  }, [])

  const toggleGroupSelection = useCallback((bookmarks: api.BookmarkItem[]) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allSelected = bookmarks.length > 0 && bookmarks.every((bookmark) => next.has(bookmark.id))
      bookmarks.forEach((bookmark) => allSelected ? next.delete(bookmark.id) : next.add(bookmark.id))
      return next
    })
  }, [])

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
      await Promise.all(ids.map((id) => api.moveLibraryNode(token, id, parentId)))
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

  async function deleteSelectedBookmarks() {
    if (!tree || !ready || moving || selectedIds.size === 0) return
    const ids = [...selectedIds].filter((id) => tree.bookmarks.some((bookmark) => bookmark.id === id))
    if (!ids.length) return
    const confirmed = confirmDangerousAction(
      `确定将选中的 ${ids.length} 个书签移入服务器书签库回收站吗？`,
    )
    if (!confirmed) return
    setMoving(true)
    setError('')
    setNotice('')
    try {
      await Promise.all(ids.map((id) => api.deleteLibraryNode(token, id)))
      setSelectedIds(new Set())
      setNotice(`已将 ${ids.length} 个书签移入服务器书签库回收站`)
      await load()
    } catch (requestError) {
      await load()
      setError(readableError(requestError, '删除书签失败，请刷新后重试'))
    } finally {
      setMoving(false)
    }
  }

  async function moveFolder(folderId: string, parentId: string | null) {
    if (!tree || !ready || moving) return
    setMoving(true)
    setError('')
    setNotice('')
    try {
      await api.moveLibraryNode(token, folderId, parentId)
      setNotice(parentId ? '文件夹及其全部内容已移动' : '文件夹已移动到顶级目录')
      if (parentId) setExpandedIds((current) => new Set(current).add(parentId))
      await load()
    } catch (requestError) {
      await load()
      setError(readableError(requestError, '文件夹移动失败，请刷新后重试'))
    } finally {
      setMoving(false)
      setDrag(null)
      setDropFolderId(null)
    }
  }

  const beginDrag = useCallback((event: DragEvent<HTMLButtonElement>, bookmarkId: string) => {
    if (!ready || moving) return
    const ids = resolveDraggedBookmarkIds(tree?.bookmarks ?? [], bookmarkId, selectedIds)
    if (!ids.length) return
    const sourceFolderIds = new Set(ids
      .map((id) => tree?.bookmarks.find((bookmark) => bookmark.id === id)?.parentId)
      .filter((id): id is string => Boolean(id)))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', ids.join(','))
    setDrag({ kind: 'bookmarks', ids, sourceFolderIds })
  }, [moving, ready, selectedIds, tree])

  const beginFolderDrag = useCallback((event: DragEvent<HTMLButtonElement>, folder: api.BookmarkFolder) => {
    if (!ready || moving) return
    const sourceParentId = findFolderParentId(allFolders, folder.id)
    if (sourceParentId === undefined) return
    const invalidTargetIds = new Set(descendantFolderIds(folder))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-bookmark-folder', folder.id)
    event.dataTransfer.setData('text/plain', folder.id)
    setDrag({ kind: 'folder', folderId: folder.id, title: folder.title, sourceParentId, invalidTargetIds })
  }, [allFolders, moving, ready])

  function clearFolderExpandTimer() {
    if (folderExpandTimerRef.current !== null) window.clearTimeout(folderExpandTimerRef.current)
    folderExpandTimerRef.current = null
    folderExpandTargetRef.current = null
  }

  function allowDrop(event: DragEvent<HTMLElement>, folderId: string | null) {
    if (!drag || moving) return
    if (drag.kind === 'bookmarks' && folderId === null) return
    if (drag.kind === 'folder') {
      if (folderId !== null && drag.invalidTargetIds.has(folderId)) return
      if (folderId === drag.sourceParentId) return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropFolderId(folderId ?? ROOT_FOLDER_DROP_ID)
    if (folderId && drag.kind === 'folder' && !expandedIds.has(folderId) && folderExpandTargetRef.current !== folderId) {
      clearFolderExpandTimer()
      folderExpandTargetRef.current = folderId
      folderExpandTimerRef.current = window.setTimeout(() => {
        setExpandedIds((current) => new Set(current).add(folderId))
        clearFolderExpandTimer()
      }, 550)
    }
  }

  function dropOnFolder(event: DragEvent<HTMLElement>, folderId: string | null) {
    if (!drag || moving) return
    event.preventDefault()
    clearFolderExpandTimer()
    if (drag.kind === 'folder') {
      if ((folderId !== null && drag.invalidTargetIds.has(folderId)) || folderId === drag.sourceParentId) return
      void moveFolder(drag.folderId, folderId)
    } else if (folderId) {
      const ids = event.dataTransfer.getData('text/plain').split(',').filter(Boolean)
      if (ids.length > 0) {
        void moveBookmarks(ids, folderId)
      }
    }
  }

  function leaveDropTarget(event: DragEvent<HTMLElement>, folderId: string | null) {
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return
    const targetId = folderId ?? ROOT_FOLDER_DROP_ID
    setDropFolderId((current) => current === targetId ? null : current)
    if (folderExpandTargetRef.current === folderId) clearFolderExpandTimer()
  }

  const endDrag = useCallback(() => {
    if (folderExpandTimerRef.current !== null) window.clearTimeout(folderExpandTimerRef.current)
    folderExpandTimerRef.current = null
    folderExpandTargetRef.current = null
    setDrag(null)
    setDropFolderId(null)
  }, [])

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

  const rootDropDisabled = drag?.kind === 'folder' && drag.sourceParentId === null
  const organizationPanel = useMemo(() => <aside className="panel category-tree-panel category-layout-tree"><div className="category-panel-title"><div><p className="eyebrow">SERVER LIBRARY TREE</p><h3>服务器书签组织架构</h3></div><div className="category-tree-actions"><button className="tree-action-button" onClick={collapseAll} type="button">收起</button><button className="tree-action-button" onClick={expandAll} type="button">展开</button><button aria-label="重置组织树视图" className="tree-control-button" onClick={resetTreeView} type="button">⌖</button><button aria-label="刷新分类树" className="icon-button" disabled={refreshing || moving} onClick={() => void load(true)} type="button"><RefreshCw className={refreshing ? 'spin' : ''} size={16} /></button></div></div><p className="category-tree-description">和“我的书签库”共享同一份服务器数据；书签和文件夹都可以拖动重组。</p><div className="organization-tree category-layout-tree-canvas" ref={treeCanvasRef}><div className="organization-tree-canvas" ref={treeContentRef} style={{ transform: `scale(${treeZoom})`, transformOrigin: 'top left' }}><TreeConnectionLayer state={treeConnectionLayer} /><div className="organization-root-node"><button aria-current={selectedFolderId === 'all' ? 'page' : undefined} className={`organization-root-card ${selectedFolderId === 'all' ? 'active' : ''} ${dropFolderId === ROOT_FOLDER_DROP_ID ? 'folder-drop-target' : ''} ${rootDropDisabled ? 'folder-drop-disabled' : ''}`} data-tree-node-id="root" onClick={() => selectFolder('all')} onDragLeave={(event) => leaveDropTarget(event, null)} onDragOver={(event) => allowDrop(event, null)} onDrop={(event) => dropOnFolder(event, null)} type="button"><span className="organization-root-symbol"><Home size={18} /></span><span><strong>全部书签</strong><small>{tree?.bookmarks.length ?? 0} 个书签 · 总目录</small></span>{dropFolderId === ROOT_FOLDER_DROP_ID && drag?.kind === 'folder' && <span className="root-folder-drop-label">移动为顶级文件夹</span>}</button>{allFolders.length > 0 && <div className="organization-root-rail">{allFolders.map((folder) => <FolderTreeNode drag={drag} dropFolderId={dropFolderId} expandedIds={expandedIds} folder={folder} key={folder.id} moving={moving} onDragEnd={endDrag} onDragLeave={leaveDropTarget} onDragOver={allowDrop} onDrop={dropOnFolder} onFolderDragStart={beginFolderDrag} onSelect={selectFolder} onToggle={toggleFolder} parentId="root" selectedFolderId={selectedFolderId} />)}</div>}</div></div></div><div className="organization-tree-controls"><button aria-label="缩小组织树" disabled={treeZoom <= 0.65} onClick={() => zoomTree(-0.1)} type="button">−</button><span>{Math.round(treeZoom * 100)}%</span><button aria-label="放大组织树" disabled={treeZoom >= 1.2} onClick={() => zoomTree(0.1)} type="button">＋</button></div><div className="tree-drop-guide"><Link2 size={15} /><span>左侧书签拖入文件夹；右侧文件夹可互相嵌套，拖到“全部书签”可移回顶级</span></div></aside>, [allFolders, beginFolderDrag, drag, dropFolderId, endDrag, expandedIds, moving, refreshing, rootDropDisabled, selectedFolderId, tree, treeConnectionLayer, treeZoom])

  return <div className="category-management-page">
    {error && tree && <div aria-live="polite" className="bookmark-alert error"><strong>操作失败</strong><span>{error}</span></div>}
    {notice && <div aria-live="polite" className="bookmark-alert success"><strong>已完成</strong><span>{notice}</span></div>}
    {loading ? <section className="panel category-state"><LoaderCircle className="spin" size={30} /><strong>正在加载服务器书签库…</strong><p>正在读取与“我的书签库”一致的文件夹和书签。</p></section> : error && !tree ? <section className="panel category-state"><RefreshCw size={30} /><strong>服务器书签库暂时无法连接</strong><p>{error}</p><button className="primary-button" onClick={() => void load(true)} type="button"><RefreshCw size={15} /> 重新连接</button></section> : tree ? <div className="category-workspace">
      <section className="panel category-bookmarks-panel category-layout-bookmarks">
        <div className="category-panel-title">
          <div><p className="eyebrow">BOOKMARKS TO ORGANIZE</p><h3>{selectedFolder ? selectedFolder.title : '全部书签'}</h3></div>
          <div className="category-result-summary"><span className="category-result-count">{visibleBookmarks.length} 个结果 · {bookmarkGroups.length} 个文件夹</span><div className="category-group-actions"><button disabled={bookmarkGroups.length === 0} onClick={expandBookmarkGroups} type="button">展开全部</button><button disabled={bookmarkGroups.length === 0} onClick={collapseBookmarkGroups} type="button">收起全部</button></div></div>
        </div>
        <div className="category-toolbar"><label className="bookmark-search"><Search size={15} /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索书签、网址或文件夹" type="search" value={query} /></label><button className="toolbar-button" disabled={refreshing || moving} onClick={() => void load(true)} type="button">{refreshing ? '刷新中…' : '刷新'}</button></div>
        {selectedIds.size > 0 && <div className="category-bulk-bar"><strong>已选择 {selectedIds.size} 个</strong><span>可批量移动或移入回收站</span><select aria-label="将选中的书签移动到文件夹" disabled={moving} onChange={(event) => { if (event.target.value) void moveBookmarks([...selectedIds], event.target.value) }} value=""><option value="">选择目标文件夹…</option>{flatFolders.map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.title}</option>)}</select><button className="danger-button category-delete-selected" disabled={moving} onClick={() => void deleteSelectedBookmarks()} type="button"><Trash2 size={14} />{moving ? '处理中…' : '删除'}</button><button className="toolbar-button" disabled={moving} onClick={() => setSelectedIds(new Set())} type="button">取消选择</button></div>}
        <div className="category-bookmark-list category-layout-bookmark-list">
          <div className="category-list-header"><label className="checkbox-wrap"><input checked={visibleBookmarks.length > 0 && visibleBookmarks.every((bookmark) => selectedIds.has(bookmark.id))} onChange={toggleAll} type="checkbox" /><span /></label><span className="category-list-title"><Folders size={14} />按文件夹分类</span><span>操作</span></div>
          {visibleBookmarks.length === 0 ? (
            <div className="category-empty"><Search size={25} /><strong>没有匹配的书签</strong><p>换个搜索关键词，或先在右侧选择其他文件夹。</p></div>
          ) : (
            <CategoryVirtualList
              bookmarkGroups={bookmarkGroups}
              collapsedGroupIds={collapsedGroupIds}
              draggedIds={draggedIds}
              moving={moving}
              normalizedQuery={normalizedQuery}
              onDragEnd={endDrag}
              onDragStart={beginDrag}
              onSelectionMouseDown={beginSelectionPaint}
              onSelectionMouseOver={continueSelectionPaint}
              onToggleGroup={toggleGroup}
              onToggleGroupSelection={toggleGroupSelection}
              onToggleSelected={toggleSelected}
              selectedIds={selectedIds}
            />
          )}
        </div>
        <p className="category-keyboard-hint">按住书签行并上下滑动可连续多选；拖动右侧手柄，可将选中的书签放入组织树文件夹。</p>
      </section>
      {organizationPanel}
    </div> : null}
  </div>
}

const GROUP_HEADER_HEIGHT = 44
const BOOKMARK_ROW_HEIGHT = 54

type VirtualRowItem =
  | { kind: 'group'; id: string; group: ReturnType<typeof groupBookmarksByFolder>[number]; collapsed: boolean }
  | { kind: 'bookmark'; id: string; bookmark: api.BookmarkItem; groupId: string }

const CategoryVirtualList = memo(function CategoryVirtualList({
  bookmarkGroups,
  collapsedGroupIds,
  normalizedQuery,
  selectedIds,
  draggedIds,
  moving,
  onToggleGroup,
  onToggleGroupSelection,
  onToggleSelected,
  onSelectionMouseDown,
  onSelectionMouseOver,
  onDragStart,
  onDragEnd,
}: {
  bookmarkGroups: ReturnType<typeof groupBookmarksByFolder>
  collapsedGroupIds: Set<string>
  normalizedQuery: string
  selectedIds: Set<string>
  draggedIds: string[]
  moving: boolean
  onToggleGroup: (id: string) => void
  onToggleGroupSelection: (bookmarks: api.BookmarkItem[]) => void
  onToggleSelected: (id: string) => void
  onSelectionMouseDown: (event: ReactMouseEvent<HTMLDivElement>, id: string) => void
  onSelectionMouseOver: (event: ReactMouseEvent<HTMLDivElement>, id: string) => void
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: string) => void
  onDragEnd: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  const items = useMemo<VirtualRowItem[]>(() => {
    const list: VirtualRowItem[] = []
    for (const group of bookmarkGroups) {
      const collapsed = !normalizedQuery && collapsedGroupIds.has(group.id)
      list.push({ kind: 'group', id: `group-${group.id}`, group, collapsed })
      if (!collapsed) {
        for (const bookmark of group.bookmarks) {
          list.push({ kind: 'bookmark', id: `bookmark-${bookmark.id}`, bookmark, groupId: group.id })
        }
      }
    }
    return list
  }, [bookmarkGroups, collapsedGroupIds, normalizedQuery])

  const itemHeights = useMemo(() => {
    return items.map((item) => (item.kind === 'group' ? GROUP_HEADER_HEIGHT : BOOKMARK_ROW_HEIGHT))
  }, [items])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      setScrollTop(container.scrollTop)
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height)
      }
    })

    container.addEventListener('scroll', handleScroll, { passive: true })
    observer.observe(container)
    setViewportHeight(container.clientHeight)
    setScrollTop(container.scrollTop)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      observer.disconnect()
    }
  }, [])

  const win = useMemo(() => {
    return getVariableVirtualWindow(itemHeights, scrollTop, viewportHeight, 8)
  }, [itemHeights, scrollTop, viewportHeight])

  const visibleItems = useMemo(() => {
    return items.slice(win.start, win.end)
  }, [items, win.start, win.end])

  return (
    <div
      className="category-virtual-scroll-container"
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
    >
      <div
        className="category-virtual-phantom"
        style={{ height: `${win.totalSize}px`, position: 'relative', width: '100%' }}
      >
        <div
          className="category-virtual-content"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${win.offset}px)`,
          }}
        >
          {visibleItems.map((item) => {
            if (item.kind === 'group') {
              const group = item.group
              const groupSelectedCount = group.bookmarks.filter((bookmark) => selectedIds.has(bookmark.id)).length
              const groupAllSelected = group.bookmarks.length > 0 && groupSelectedCount === group.bookmarks.length
              const groupPartiallySelected = groupSelectedCount > 0 && !groupAllSelected

              return (
                <div
                  className={`category-bookmark-group-header ${item.collapsed ? 'collapsed' : ''}`}
                  key={item.id}
                  style={{
                    '--folder-depth': group.depth,
                    display: 'grid',
                    gridTemplateColumns: '24px 26px minmax(0, 1fr) auto',
                    alignItems: 'center',
                    paddingLeft: `${10 + Math.min(group.depth, 4) * 12}px`,
                    height: `${GROUP_HEADER_HEIGHT}px`,
                    boxSizing: 'border-box',
                  } as React.CSSProperties}
                >
                  <label className={`checkbox-wrap category-group-checkbox ${groupPartiallySelected ? 'partial' : ''}`}>
                    <input
                      aria-label={`选择 ${group.path} 中的全部书签`}
                      checked={groupAllSelected}
                      onChange={() => onToggleGroupSelection(group.bookmarks)}
                      ref={(node) => {
                        if (node) node.indeterminate = groupPartiallySelected
                      }}
                      type="checkbox"
                    />
                    <span />
                  </label>
                  <button
                    aria-expanded={!item.collapsed}
                    aria-label={`${item.collapsed ? '展开' : '收起'} ${group.path}`}
                    className="category-group-toggle"
                    onClick={() => onToggleGroup(group.id)}
                    type="button"
                  >
                    {item.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <button
                    className="category-group-summary"
                    onClick={() => onToggleGroup(group.id)}
                    title={group.path !== group.title ? group.path : undefined}
                    type="button"
                  >
                    <span className="category-group-icon">
                      {item.collapsed ? <Folder size={16} /> : <FolderOpen size={16} />}
                    </span>
                    <span><strong>{group.title}</strong></span>
                  </button>
                  <span className="folder-count-badge">{group.bookmarks.length}</span>
                </div>
              )
            }

            const bookmark = item.bookmark
            const isSelected = selectedIds.has(bookmark.id)
            const isDragging = draggedIds.includes(bookmark.id)

            return (
              <div
                className={`category-bookmark-row ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
                data-bookmark-id={bookmark.id}
                key={item.id}
                onMouseDown={(event) => onSelectionMouseDown(event, bookmark.id)}
                onMouseOver={(event) => onSelectionMouseOver(event, bookmark.id)}
                style={{ height: `${BOOKMARK_ROW_HEIGHT}px`, boxSizing: 'border-box' }}
              >
                <label className="checkbox-wrap">
                  <input
                    checked={isSelected}
                    onChange={() => onToggleSelected(bookmark.id)}
                    type="checkbox"
                  />
                  <span />
                </label>
                <button
                  aria-label={`拖动 ${bookmark.title || bookmark.url}`}
                  className="category-drag-handle"
                  draggable={!moving}
                  onDragEnd={onDragEnd}
                  onDragStart={(event) => onDragStart(event, bookmark.id)}
                  title="拖动到右侧文件夹"
                  type="button"
                >
                  <GripVertical size={16} />
                </button>
                <div className="category-bookmark-info">
                  <LibrarySiteIcon title={bookmark.title} url={bookmark.url} />
                  <div>
                    <strong title={bookmark.title}>{bookmark.title || '未命名书签'}</strong>
                    <small>{getHost(bookmark.url)}</small>
                  </div>
                </div>
                <a
                  aria-label={`打开 ${bookmark.title || bookmark.url}`}
                  className="bookmark-open-link"
                  href={bookmark.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLinkIcon />
                </a>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

function TreeConnectionLayer({ state }: { state: TreeConnectionLayerState }) {
  if (!state.width || !state.height || state.connections.length === 0) return null
  return <svg aria-hidden="true" className="organization-tree-connections" height={state.height} viewBox={`0 0 ${state.width} ${state.height}`} width={state.width}>{state.connections.map((connection) => <path className="organization-tree-connection" d={connection.path} data-tree-child-id={connection.childId} data-tree-parent-id={connection.parentId} key={connection.id} />)}</svg>
}

function FolderTreeNode({ folder, parentId, selectedFolderId, expandedIds, dropFolderId, drag, moving, depth = 0, onSelect, onToggle, onFolderDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: { folder: api.BookmarkFolder; parentId: string; selectedFolderId: string; expandedIds: Set<string>; dropFolderId: string | null; drag: DragState; moving: boolean; depth?: number; onSelect: (id: string) => void; onToggle: (id: string) => void; onFolderDragStart: (event: DragEvent<HTMLButtonElement>, folder: api.BookmarkFolder) => void; onDragEnd: () => void; onDragOver: (event: DragEvent<HTMLElement>, id: string | null) => void; onDrop: (event: DragEvent<HTMLElement>, id: string | null) => void; onDragLeave: (event: DragEvent<HTMLElement>, id: string | null) => void }) {
  const expanded = expandedIds.has(folder.id)
  const hasChildren = folderHasChildren(folder)
  const isBookmarkSource = drag?.kind === 'bookmarks' && drag.sourceFolderIds.has(folder.id)
  const isFolderSource = drag?.kind === 'folder' && drag.folderId === folder.id
  const isFolderDropDisabled = drag?.kind === 'folder' && (drag.invalidTargetIds.has(folder.id) || drag.sourceParentId === folder.id)
  const isDropTarget = dropFolderId === folder.id && !isFolderDropDisabled
  return <div className="organization-node"><div className={`organization-folder-row ${selectedFolderId === folder.id ? 'active' : ''} ${isDropTarget ? 'folder-drop-target' : ''} ${isBookmarkSource ? 'source-folder' : ''} ${isFolderSource ? 'folder-drag-source' : ''} ${isFolderDropDisabled ? 'folder-drop-disabled' : ''}`} data-tree-node-id={folder.id} data-tree-parent-id={parentId} onDragLeave={(event) => onDragLeave(event, folder.id)} onDragOver={(event) => onDragOver(event, folder.id)} onDrop={(event) => onDrop(event, folder.id)} style={{ '--folder-depth': depth } as React.CSSProperties}>{hasChildren ? <button aria-expanded={expanded} aria-label={`${expanded ? '折叠' : '展开'} ${folder.title}`} className="organization-toggle" onClick={() => onToggle(folder.id)} type="button">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span aria-hidden="true" className="organization-toggle-spacer" />}<button aria-current={selectedFolderId === folder.id ? 'page' : undefined} aria-label={`拖动文件夹 ${folder.title}`} className="organization-folder-button" disabled={moving} draggable={!moving} onClick={() => onSelect(folder.id)} onDragEnd={onDragEnd} onDragStart={(event) => onFolderDragStart(event, folder)} title="拖动到其他文件夹可移动整棵分支" type="button">{expanded ? <FolderOpen size={17} /> : <Folder size={17} />}<span>{folder.title}</span><small>{folder.bookmarkCount}</small></button>{isDropTarget && drag && <span className="folder-drop-label">{drag.kind === 'folder' ? '移动到此处' : '放入此处'}</span>}</div>{expanded && hasChildren && <div className="organization-children">{folder.children.map((child) => <FolderTreeNode depth={depth + 1} drag={drag} dropFolderId={dropFolderId} expandedIds={expandedIds} folder={child} key={child.id} moving={moving} onDragEnd={onDragEnd} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop} onFolderDragStart={onFolderDragStart} onSelect={onSelect} onToggle={onToggle} parentId={folder.id} selectedFolderId={selectedFolderId} />)}</div>}</div>
}

function toggleSet(current: Set<string>, id: string) { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }
function allFolderIds(folders: api.BookmarkFolder[]): string[] { return folders.flatMap((folder) => [folder.id, ...allFolderIds(folder.children)]) }
function findFolder(folders: api.BookmarkFolder[], id: string): api.BookmarkFolder | null { for (const folder of folders) { if (folder.id === id) return folder; const match = findFolder(folder.children, id); if (match) return match } return null }
function flattenFolders(folders: api.BookmarkFolder[], depth = 0): FlatBookmarkFolder[] { return flattenBookmarkFolders(folders, depth) }
function getHost(value: string) { try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value } }
function readableError(error: unknown, fallback: string) { if (error instanceof api.ApiRequestError) { if (error.status === 401) return '登录已过期，请重新登录。'; if (error.status === 409) return '同步文件已变化，请刷新后重试。'; if (error.status === 423) return 'Floccus 正在同步文件，请稍后再试。'; return error.message } return error instanceof Error ? error.message : fallback }
function ExternalLinkIcon() { return <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 24 24" width="13"><path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>}
