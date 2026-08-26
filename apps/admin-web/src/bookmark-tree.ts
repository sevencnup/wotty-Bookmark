import type { BookmarkFolder, BookmarkItem } from './api'

export type FlatBookmarkFolder = BookmarkFolder & { depth: number }

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
