import { describe, expect, it } from 'vitest'
import type { BookmarkFolder, BookmarkItem } from './api'
import { descendantFolderIds, flattenFolders, folderHasChildren, resolveDraggedBookmarkIds, visibleFolders } from './bookmark-tree'

const folders: BookmarkFolder[] = [
  { id: 'work', title: '工作', bookmarkCount: 3, children: [
    { id: 'docs', title: '文档', bookmarkCount: 2, children: [] },
  ] },
  { id: 'read', title: '待读', bookmarkCount: 0, children: [] },
]

const bookmarks: BookmarkItem[] = [
  { id: 'one', title: 'One', url: 'https://one.test', parentId: 'work', folderPath: '工作' },
  { id: 'two', title: 'Two', url: 'https://two.test', parentId: 'docs', folderPath: '工作 / 文档' },
]

describe('bookmark tree helpers', () => {
  it('flattens nested folders with their depth', () => {
    expect(flattenFolders(folders).map(({ id, depth }) => [id, depth])).toEqual([
      ['work', 0], ['docs', 1], ['read', 0],
    ])
  })

  it('only shows descendants of expanded folders', () => {
    expect(visibleFolders(folders, new Set()).map(({ id }) => id)).toEqual(['work', 'read'])
    expect(visibleFolders(folders, new Set(['work'])).map(({ id }) => id)).toEqual(['work', 'docs', 'read'])
  })

  it('collects a folder and all descendants', () => {
    expect(descendantFolderIds(folders[0])).toEqual(['work', 'docs'])
  })

  it('resolves selected and unselected drag operations', () => {
    expect(resolveDraggedBookmarkIds(bookmarks, 'one', new Set(['one', 'two', 'missing']))).toEqual(['one', 'two'])
    expect(resolveDraggedBookmarkIds(bookmarks, 'two', new Set())).toEqual(['two'])
    expect(resolveDraggedBookmarkIds(bookmarks, 'missing', new Set(['missing']))).toEqual([])
  })

  it('detects folders with children', () => {
    expect(folderHasChildren(folders[0])).toBe(true)
    expect(folderHasChildren(folders[1])).toBe(false)
  })
})
