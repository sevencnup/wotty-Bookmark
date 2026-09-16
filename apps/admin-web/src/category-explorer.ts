import type { BookmarkFolder } from './api'
import { findFolder } from './bookmark-tree'

export type ExplorerNavigationState = {
  currentExplorerFolderId: string | null
  selectedFolderId: string
  folderFilterQuery: string
}

/**
 * A folder filter only applies to the directory currently being viewed.
 * Reset it whenever navigation changes that directory.
 */
export function getExplorerNavigationState(folderId: string | null): ExplorerNavigationState {
  return {
    currentExplorerFolderId: folderId,
    selectedFolderId: folderId ?? 'all',
    folderFilterQuery: '',
  }
}

/** Keeps the server's position order for the root and every child directory. */
export function getExplorerFolderList(folders: BookmarkFolder[], currentFolderId: string | null): BookmarkFolder[] {
  if (!currentFolderId) return folders
  return findFolder(folders, currentFolderId)?.children ?? []
}
