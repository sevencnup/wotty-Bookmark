import { describe, expect, it } from 'vitest'
import type { BookmarkFolder } from './api'
import { getExplorerFolderList, getExplorerNavigationState } from './category-explorer'

const folders: BookmarkFolder[] = [
  { id: 'zebra', title: 'Zebra', bookmarkCount: 0, children: [] },
  { id: 'projects', title: '项目', bookmarkCount: 0, children: [
    { id: 'later', title: 'Later', bookmarkCount: 0, children: [] },
    { id: 'alpha', title: 'Alpha', bookmarkCount: 0, children: [] },
  ] },
  { id: 'alpha-root', title: 'Alpha', bookmarkCount: 0, children: [] },
]

describe('category explorer navigation', () => {
  it('clears the current-level folder filter when entering a folder', () => {
    expect(getExplorerNavigationState('linux-do')).toEqual({
      currentExplorerFolderId: 'linux-do',
      folderFilterQuery: '',
      selectedFolderId: 'linux-do',
    })
  })

  it('selects all bookmarks and clears the filter when returning to the root folder', () => {
    expect(getExplorerNavigationState(null)).toEqual({
      currentExplorerFolderId: null,
      folderFilterQuery: '',
      selectedFolderId: 'all',
    })
  })

  it('keeps the server order at the root and in child directories', () => {
    expect(getExplorerFolderList(folders, null).map((folder) => folder.id)).toEqual(['zebra', 'projects', 'alpha-root'])
    expect(getExplorerFolderList(folders, 'projects').map((folder) => folder.id)).toEqual(['later', 'alpha'])
  })
})
