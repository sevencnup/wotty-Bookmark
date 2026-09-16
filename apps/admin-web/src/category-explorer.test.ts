import { describe, expect, it } from 'vitest'
import { getExplorerNavigationState } from './category-explorer'

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
})
