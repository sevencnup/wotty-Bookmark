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
