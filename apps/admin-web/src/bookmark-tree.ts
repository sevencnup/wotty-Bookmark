import type { BookmarkFolder, BookmarkItem } from './api'

export type FlatBookmarkFolder = BookmarkFolder & { depth: number }
export type BookmarkFolderGroup = {
  id: string
  title: string
  path: string
  depth: number
  bookmarks: BookmarkItem[]
}

export const ROOT_BOOKMARK_GROUP_ID = '__root__'

export function flattenFolders(folders: BookmarkFolder[], depth = 0): FlatBookmarkFolder[] {
  return folders.flatMap((folder) => [
    { ...folder, depth },
    ...flattenFolders(folder.children, depth + 1),
  ])
}

export function visibleFolders(
  folders: BookmarkFolder[],
  expandedFolderIds: Set<string>,
  depth = 0,
): FlatBookmarkFolder[] {
  return folders.flatMap((folder) => [
    { ...folder, depth },
    ...(expandedFolderIds.has(folder.id)
      ? visibleFolders(folder.children, expandedFolderIds, depth + 1)
      : []),
  ])
}

export function descendantFolderIds(folder: BookmarkFolder): string[] {
  return [folder.id, ...folder.children.flatMap(descendantFolderIds)]
}

export function findFolderParentId(
  folders: BookmarkFolder[],
  targetId: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const folder of folders) {
    if (folder.id === targetId) return parentId
    const match = findFolderParentId(folder.children, targetId, folder.id)
    if (match !== undefined) return match
  }
  return undefined
}

export function findFolder(folders: BookmarkFolder[], id: string): BookmarkFolder | null {
  for (const folder of folders) {
    if (folder.id === id) return folder
    const match = findFolder(folder.children, id)
    if (match) return match
  }
  return null
}

export function folderHasChildren(folder: BookmarkFolder) {
  return folder.children.length > 0
}

export function resolveDraggedBookmarkIds(
  bookmarks: BookmarkItem[],
  bookmarkId: string,
  selectedIds: Set<string>,
) {
  const validIds = new Set(bookmarks.map((bookmark) => bookmark.id))
  const candidates = selectedIds.has(bookmarkId) ? [...selectedIds] : [bookmarkId]
  return candidates.filter((id, index) => validIds.has(id) && candidates.indexOf(id) === index)
}

export function groupBookmarksByFolder(
  bookmarks: BookmarkItem[],
  folders: BookmarkFolder[],
): BookmarkFolderGroup[] {
  const folderMetadata = new Map<string, Omit<BookmarkFolderGroup, 'bookmarks'>>()

  function visit(items: BookmarkFolder[], parentPath = '', depth = 0) {
    items.forEach((folder) => {
      const path = parentPath ? `${parentPath} / ${folder.title}` : folder.title
      folderMetadata.set(folder.id, { id: folder.id, title: folder.title, path, depth })
      visit(folder.children, path, depth + 1)
    })
  }

  visit(folders)

  const grouped = new Map<string, BookmarkFolderGroup>()
  bookmarks.forEach((bookmark) => {
    const id = bookmark.parentId ?? ROOT_BOOKMARK_GROUP_ID
    const knownFolder = bookmark.parentId ? folderMetadata.get(bookmark.parentId) : null
    const fallbackPath = bookmark.folderPath.trim() || '根目录'
    const fallbackTitle = fallbackPath.split(/\s*\/\s*/).filter(Boolean).at(-1) ?? '根目录'
    const metadata = knownFolder ?? {
      id,
      title: bookmark.parentId ? fallbackTitle : '根目录',
      path: fallbackPath,
      depth: bookmark.parentId ? Math.max(0, fallbackPath.split(/\s*\/\s*/).filter(Boolean).length - 1) : 0,
    }
    const group = grouped.get(id) ?? { ...metadata, bookmarks: [] }
    group.bookmarks.push(bookmark)
    grouped.set(id, group)
  })

  const orderedIds = [ROOT_BOOKMARK_GROUP_ID, ...flattenFolders(folders).map((folder) => folder.id)]
  const order = new Map(orderedIds.map((id, index) => [id, index]))
  return [...grouped.values()].sort((left, right) => {
    const leftOrder = order.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = order.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftOrder - rightOrder || left.path.localeCompare(right.path, 'zh-CN')
  })
}
