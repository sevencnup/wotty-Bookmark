import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, CornerDownRight, Folder, FolderOpen, Folders, GripVertical, Home, LayoutGrid, List, ListFilter, LoaderCircle, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import { descendantFolderIds, findFolderParentId, flattenFolders as flattenBookmarkFolders, groupBookmarksByFolder, resolveDraggedBookmarkIds, type FlatBookmarkFolder } from './bookmark-tree'
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

const EMPTY_FOLDERS: api.BookmarkFolder[] = []
const EMPTY_BOOKMARK_IDS: string[] = []
const ROOT_FOLDER_DROP_ID = '__tree_root__'

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

function sortFoldersAlphabetically(folders: api.BookmarkFolder[]): api.BookmarkFolder[] {
  return [...folders]
    .sort((a, b) => collator.compare(a.title, b.title))
    .map((folder) => ({
      ...folder,
      children: sortFoldersAlphabetically(folder.children),
    }))
}

function getFolderFirstLetter(title: string): string {
  const trimmed = title.trim()
  if (!trimmed) return '#'
  const first = trimmed[0].toUpperCase()
  if (/[A-Z0-9]/.test(first)) return first
  return first
}

function findFolderPath(folders: api.BookmarkFolder[], targetId: string, currentPath: api.BookmarkFolder[] = []): api.BookmarkFolder[] | null {
  for (const folder of folders) {
    const path = [...currentPath, folder]
    if (folder.id === targetId) return path
    const match = findFolderPath(folder.children, targetId, path)
    if (match) return match
  }
  return null
}

export function CategoryManagementPage({ token }: Props) {
  const [tree, setTree] = useState<api.BookmarkTree | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<DragState>(null)
  const [dropFolderId, setDropFolderId] = useState<string | null>(null)
  const [currentExplorerFolderId, setCurrentExplorerFolderId] = useState<string | null>(null)
  const [folderLayoutMode, setFolderLayoutMode] = useState<'grid' | 'list'>('grid')
  const [folderFilterQuery, setFolderFilterQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selectionPaintRef = useRef<SelectionPaintState>(null)

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true)
    setError('')
    try {
      const library = await api.getLibrary(token)
      const nextTree = toCategoryTree(library)
      setTree(nextTree)
      setSelectedIds((current) => new Set([...current].filter((id) => nextTree.bookmarks.some((bookmark) => bookmark.id === id))))
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
  const sortedAllFolders = useMemo(() => sortFoldersAlphabetically(allFolders), [allFolders])
  const flatFolders = useMemo(() => flattenBookmarkFolders(sortedAllFolders), [sortedAllFolders])
  const bookmarkGroups = useMemo(() => groupBookmarksByFolder(visibleBookmarks, sortedAllFolders), [sortedAllFolders, visibleBookmarks])
  const draggedIds = drag?.kind === 'bookmarks' ? drag.ids : EMPTY_BOOKMARK_IDS
  const ready = Boolean(tree)

  const explorerPath = useMemo<api.BookmarkFolder[]>(() => {
    if (!currentExplorerFolderId) return []
    return findFolderPath(sortedAllFolders, currentExplorerFolderId) ?? []
  }, [currentExplorerFolderId, sortedAllFolders])

  const currentExplorerFolder = useMemo<api.BookmarkFolder | null>(() => {
    if (!currentExplorerFolderId) return null
    return findFolder(sortedAllFolders, currentExplorerFolderId)
  }, [currentExplorerFolderId, sortedAllFolders])

  const currentSubfolders = useMemo(() => {
    const list = currentExplorerFolder ? currentExplorerFolder.children : sortedAllFolders
    const q = folderFilterQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((folder) => folder.title.toLowerCase().includes(q))
  }, [currentExplorerFolder, folderFilterQuery, sortedAllFolders])

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

  const beginFolderDrag = useCallback((event: DragEvent<HTMLElement>, folder: api.BookmarkFolder) => {
    if (!ready || moving) return
    const sourceParentId = findFolderParentId(allFolders, folder.id)
    if (sourceParentId === undefined) return
    const invalidTargetIds = new Set(descendantFolderIds(folder))
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-bookmark-folder', folder.id)
    event.dataTransfer.setData('text/plain', folder.id)
    setDrag({ kind: 'folder', folderId: folder.id, title: folder.title, sourceParentId, invalidTargetIds })
  }, [allFolders, moving, ready])

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
  }

  function dropOnFolder(event: DragEvent<HTMLElement>, folderId: string | null) {
    if (!drag || moving) return
    event.preventDefault()
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
  }

  const endDrag = useCallback(() => {
    setDrag(null)
    setDropFolderId(null)
  }, [])

  function enterFolder(id: string) {
    setCurrentExplorerFolderId(id)
    selectFolder(id)
  }

  function navigateUp() {
    if (explorerPath.length <= 1) {
      setCurrentExplorerFolderId(null)
      setSelectedFolderId('all')
    } else {
      const parent = explorerPath[explorerPath.length - 2]
      setCurrentExplorerFolderId(parent.id)
      selectFolder(parent.id)
    }
  }

  function navigateTo(id: string | null) {
    setCurrentExplorerFolderId(id)
    if (id) {
      selectFolder(id)
    } else {
      setSelectedFolderId('all')
    }
  }

  const rootDropDisabled = drag?.kind === 'folder' && drag.sourceParentId === null

  const organizationPanel = useMemo(() => (
    <aside className="panel category-tree-panel category-layout-tree explorer-folder-panel">
      <div className="category-panel-title">
        <div>
          <p className="eyebrow">EXPLORER FOLDERS (A-Z)</p>
          <h3>服务器文件夹管理</h3>
        </div>
        <div className="category-tree-actions explorer-header-actions">
          <span className="explorer-sort-badge" title="所有层级文件夹均按照 26 字母自然排序 (A-Z)">
            <ListFilter size={13} />
            <span>26 字母排序</span>
          </span>
          <div className="explorer-view-toggle">
            <button
              aria-label="网格视图"
              className={`explorer-toggle-btn ${folderLayoutMode === 'grid' ? 'active' : ''}`}
              onClick={() => setFolderLayoutMode('grid')}
              title="网格视图"
              type="button"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              aria-label="列表视图"
              className={`explorer-toggle-btn ${folderLayoutMode === 'list' ? 'active' : ''}`}
              onClick={() => setFolderLayoutMode('list')}
              title="列表视图"
              type="button"
            >
              <List size={15} />
            </button>
          </div>
          <button
            aria-label="刷新文件夹"
            className="icon-button"
            disabled={refreshing || moving}
            onClick={() => void load(true)}
            type="button"
          >
            <RefreshCw className={refreshing ? 'spin' : ''} size={16} />
          </button>
        </div>
      </div>

      <div className="explorer-path-bar">
        <button
          aria-label="返回上一级"
          className="explorer-nav-back-btn"
          disabled={!currentExplorerFolderId}
          onClick={navigateUp}
          title={currentExplorerFolderId ? '返回上一级目录' : '已在根目录'}
          type="button"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="explorer-breadcrumbs">
          <button
            className={`explorer-breadcrumb-btn ${!currentExplorerFolderId ? 'current' : ''} ${dropFolderId === ROOT_FOLDER_DROP_ID ? 'folder-drop-target' : ''} ${rootDropDisabled ? 'folder-drop-disabled' : ''}`}
            onClick={() => navigateTo(null)}
            onDragLeave={(event) => leaveDropTarget(event, null)}
            onDragOver={(event) => allowDrop(event, null)}
            onDrop={(event) => dropOnFolder(event, null)}
            title="点击回到根目录，也可将文件夹拖放到此处移至根目录"
            type="button"
          >
            <Home size={14} />
            <span>全部书签</span>
          </button>

          {explorerPath.map((seg, index) => {
            const isLast = index === explorerPath.length - 1
            const isDrop = dropFolderId === seg.id
            return (
              <span className="explorer-breadcrumb-segment" key={seg.id}>
                <ChevronRight className="explorer-breadcrumb-sep" size={13} />
                <button
                  className={`explorer-breadcrumb-btn ${isLast ? 'current' : ''} ${isDrop ? 'folder-drop-target' : ''}`}
                  onClick={() => navigateTo(seg.id)}
                  onDragLeave={(event) => leaveDropTarget(event, seg.id)}
                  onDragOver={(event) => allowDrop(event, seg.id)}
                  onDrop={(event) => dropOnFolder(event, seg.id)}
                  title={`点击进入 ${seg.title}，也可拖拽到此处`}
                  type="button"
                >
                  <Folder size={14} />
                  <span>{seg.title}</span>
                </button>
              </span>
            )
          })}
        </div>
      </div>

      <div className="explorer-sub-bar">
        <label className="explorer-filter-input">
          <Search size={14} />
          <input
            onChange={(event) => setFolderFilterQuery(event.target.value)}
            placeholder="过滤当前层级文件夹..."
            type="search"
            value={folderFilterQuery}
          />
        </label>
        <span className="explorer-count-summary">
          共 {currentSubfolders.length} 个文件夹
          {currentExplorerFolder && ` · ${currentExplorerFolder.bookmarkCount} 个直属书签`}
        </span>
      </div>

      <div className="explorer-content-container">
        {currentSubfolders.length === 0 ? (
          <div className="explorer-empty-folder">
            <div className="explorer-empty-icon">
              <FolderOpen size={42} />
            </div>
            <h4>{folderFilterQuery ? '没有找到匹配的文件夹' : '此目录下暂无子文件夹'}</h4>
            <p>
              {currentExplorerFolder
                ? `当前文件夹「${currentExplorerFolder.title}」共包含 ${currentExplorerFolder.bookmarkCount} 个书签。左侧列表可直接管理书签，或从其他目录拖入文件夹重组。`
                : '当前服务器书签库暂无顶级文件夹。在书签库中创建或导入文件夹后将自动按 26 字母排序展示。'}
            </p>
            {currentExplorerFolder && (
              <button className="secondary-button" onClick={navigateUp} type="button">
                <ArrowLeft size={14} /> 返回上一级
              </button>
            )}
          </div>
        ) : folderLayoutMode === 'grid' ? (
          <div className="explorer-folder-grid">
            {currentSubfolders.map((folder) => {
              const isBookmarkSource = drag?.kind === 'bookmarks' && drag.sourceFolderIds.has(folder.id)
              const isFolderSource = drag?.kind === 'folder' && drag.folderId === folder.id
              const isFolderDropDisabled = drag?.kind === 'folder' && (drag.invalidTargetIds.has(folder.id) || drag.sourceParentId === folder.id)
              const isDropTarget = dropFolderId === folder.id && !isFolderDropDisabled
              const isSelected = selectedFolderId === folder.id
              const firstLetter = getFolderFirstLetter(folder.title)

              return (
                <div
                  className={`explorer-card ${isSelected ? 'selected' : ''} ${isDropTarget ? 'folder-drop-target' : ''} ${isBookmarkSource ? 'source-folder' : ''} ${isFolderSource ? 'folder-drag-source' : ''} ${isFolderDropDisabled ? 'folder-drop-disabled' : ''}`}
                  draggable={!moving}
                  key={folder.id}
                  onClick={() => selectFolder(folder.id)}
                  onDoubleClick={() => enterFolder(folder.id)}
                  onDragEnd={endDrag}
                  onDragLeave={(event) => leaveDropTarget(event, folder.id)}
                  onDragOver={(event) => allowDrop(event, folder.id)}
                  onDragStart={(event) => beginFolderDrag(event, folder)}
                  onDrop={(event) => dropOnFolder(event, folder.id)}
                  title="单击选择并在左侧查看，双击进入下级；可拖动重组"
                >
                  <div className="explorer-card-header">
                    <span className="explorer-letter-chip">{firstLetter}</span>
                    <div className="explorer-card-icon-wrap">
                      {isSelected ? <FolderOpen className="explorer-card-icon" size={26} /> : <Folder className="explorer-card-icon" size={26} />}
                    </div>
                    <button
                      aria-label={`进入 ${folder.title}`}
                      className="explorer-card-enter-btn"
                      onClick={(event) => {
                        event.stopPropagation()
                        enterFolder(folder.id)
                      }}
                      title="进入此文件夹"
                      type="button"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </div>

                  <div className="explorer-card-body">
                    <strong className="explorer-card-title" title={folder.title}>
                      {folder.title}
                    </strong>
                    <div className="explorer-card-meta">
                      <span>{folder.bookmarkCount} 书签</span>
                      {folder.children.length > 0 && <span> · {folder.children.length} 子目录</span>}
                    </div>
                  </div>

                  {isDropTarget && drag && (
                    <div className="explorer-card-drop-badge">
                      {drag.kind === 'folder' ? '移入此目录' : '放入此目录'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="explorer-folder-list">
            <div className="explorer-list-head">
              <span>文件夹名称</span>
              <span>书签数</span>
              <span>子文件夹</span>
              <span style={{ textAlign: 'right' }}>操作</span>
            </div>
            <div className="explorer-list-body">
              {currentSubfolders.map((folder) => {
                const isBookmarkSource = drag?.kind === 'bookmarks' && drag.sourceFolderIds.has(folder.id)
                const isFolderSource = drag?.kind === 'folder' && drag.folderId === folder.id
                const isFolderDropDisabled = drag?.kind === 'folder' && (drag.invalidTargetIds.has(folder.id) || drag.sourceParentId === folder.id)
                const isDropTarget = dropFolderId === folder.id && !isFolderDropDisabled
                const isSelected = selectedFolderId === folder.id
                const firstLetter = getFolderFirstLetter(folder.title)

                return (
                  <div
                    className={`explorer-list-row ${isSelected ? 'selected' : ''} ${isDropTarget ? 'folder-drop-target' : ''} ${isBookmarkSource ? 'source-folder' : ''} ${isFolderSource ? 'folder-drag-source' : ''} ${isFolderDropDisabled ? 'folder-drop-disabled' : ''}`}
                    draggable={!moving}
                    key={folder.id}
                    onClick={() => selectFolder(folder.id)}
                    onDoubleClick={() => enterFolder(folder.id)}
                    onDragEnd={endDrag}
                    onDragLeave={(event) => leaveDropTarget(event, folder.id)}
                    onDragOver={(event) => allowDrop(event, folder.id)}
                    onDragStart={(event) => beginFolderDrag(event, folder)}
                    onDrop={(event) => dropOnFolder(event, folder.id)}
                  >
                    <div className="explorer-list-col-name">
                      <span className="explorer-letter-chip small">{firstLetter}</span>
                      {isSelected ? <FolderOpen className="explorer-row-icon" size={18} /> : <Folder className="explorer-row-icon" size={18} />}
                      <strong title={folder.title}>{folder.title}</strong>
                    </div>
                    <div className="explorer-list-col-count">
                      <span className="explorer-count-badge">{folder.bookmarkCount}</span>
                    </div>
                    <div className="explorer-list-col-sub">
                      {folder.children.length > 0 ? `${folder.children.length} 个` : '—'}
                    </div>
                    <div className="explorer-list-col-actions">
                      <button
                        className="explorer-row-enter-btn"
                        onClick={(event) => {
                          event.stopPropagation()
                          enterFolder(folder.id)
                        }}
                        title="进入文件夹"
                        type="button"
                      >
                        <span>进入</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="tree-drop-guide explorer-footer-guide">
        <CornerDownRight size={15} />
        <span>单击在左侧展示书签，双击/点击“进入”进入下级；拖动文件夹可互相嵌套，拖至上方路径栏可移回上级。</span>
      </div>
    </aside>
  ), [
    beginFolderDrag,
    currentExplorerFolder,
    currentExplorerFolderId,
    currentSubfolders,
    drag,
    dropFolderId,
    endDrag,
    explorerPath,
    folderFilterQuery,
    folderLayoutMode,
    moving,
    refreshing,
    rootDropDisabled,
    selectedFolderId,
    tree?.bookmarks.length,
  ])

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

function toggleSet(current: Set<string>, id: string) { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }
function allFolderIds(folders: api.BookmarkFolder[]): string[] { return folders.flatMap((folder) => [folder.id, ...allFolderIds(folder.children)]) }
function findFolder(folders: api.BookmarkFolder[], id: string): api.BookmarkFolder | null { for (const folder of folders) { if (folder.id === id) return folder; const match = findFolder(folder.children, id); if (match) return match } return null }
function flattenFolders(folders: api.BookmarkFolder[], depth = 0): FlatBookmarkFolder[] { return flattenBookmarkFolders(folders, depth) }
function getHost(value: string) { try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value } }
function readableError(error: unknown, fallback: string) { if (error instanceof api.ApiRequestError) { if (error.status === 401) return '登录已过期，请重新登录。'; if (error.status === 409) return '同步文件已变化，请刷新后重试。'; if (error.status === 423) return 'Floccus 正在同步文件，请稍后再试。'; return error.message } return error instanceof Error ? error.message : fallback }
function ExternalLinkIcon() { return <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 24 24" width="13"><path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>}
