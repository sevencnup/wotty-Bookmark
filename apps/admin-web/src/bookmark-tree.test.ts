import { describe, expect, it } from 'vitest'
import type { BookmarkFolder, BookmarkItem } from './api'
import { calculateBookmarkSelection, descendantFolderIds, findFolderParentId, flattenFolders, folderHasChildren, getBookmarkDragPayload, groupBookmarksByFolder, resolveDraggedBookmarkIds, ROOT_BOOKMARK_GROUP_ID, visibleFolders } from './bookmark-tree'

const folders: BookmarkFolder[] = [
  { id: 'work', title: '工作', bookmarkCount: 3, children: [
    { id: 'docs', title: '文档', bookmarkCount: 2, children: [] },
  ] },
  { id: 'read', title: '待读', bookmarkCount: 0, children: [] },
]

const bookmarks: BookmarkItem[] = [
  { id: 'root', title: 'Root', url: 'https://root.test', parentId: null, folderPath: '' },
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

  it('finds root and nested folder parents without confusing a missing folder with root', () => {
    expect(findFolderParentId(folders, 'work')).toBeNull()
    expect(findFolderParentId(folders, 'docs')).toBe('work')
    expect(findFolderParentId(folders, 'missing')).toBeUndefined()
  })

  it('resolves selected and unselected drag operations', () => {
    expect(resolveDraggedBookmarkIds(bookmarks, 'one', new Set(['one', 'two', 'missing']))).toEqual(['one', 'two'])
    expect(resolveDraggedBookmarkIds(bookmarks, 'two', new Set())).toEqual(['two'])
    expect(resolveDraggedBookmarkIds(bookmarks, 'missing', new Set(['missing']))).toEqual([])
  })

  it('serializes the selected bookmarks for a folder-drop operation', () => {
    expect(getBookmarkDragPayload(bookmarks, 'one', new Set(['one', 'two', 'missing']))).toEqual({
      ids: ['one', 'two'],
      textPlain: 'one,two',
    })
    expect(getBookmarkDragPayload(bookmarks, 'missing', new Set(['one']))).toBeNull()
  })

  it('calculates Windows-style single, range, additive-range, and toggle selections', () => {
    const order = ['root', 'one', 'two', 'three', 'four']

    const single = calculateBookmarkSelection(order, new Set(['two']), 'two', 'one', {})
    expect([...single.ids]).toEqual(['one'])
    expect(single.anchorId).toBe('one')

    const range = calculateBookmarkSelection(order, single.ids, single.anchorId, 'three', { shiftKey: true })
    expect([...range.ids]).toEqual(['one', 'two', 'three'])
    expect(range.anchorId).toBe('one')

    const additiveRange = calculateBookmarkSelection(order, new Set(['root']), 'two', 'four', { ctrlKey: true, shiftKey: true })
    expect([...additiveRange.ids]).toEqual(['root', 'two', 'three', 'four'])
    expect(additiveRange.anchorId).toBe('two')

    const deselected = calculateBookmarkSelection(order, range.ids, range.anchorId, 'two', { ctrlKey: true })
    expect([...deselected.ids]).toEqual(['one', 'three'])
    expect(deselected.anchorId).toBe('two')
  })

  it('detects folders with children', () => {
    expect(folderHasChildren(folders[0])).toBe(true)
    expect(folderHasChildren(folders[1])).toBe(false)
  })

  it('groups bookmarks by their actual folder in tree order', () => {
    const groups = groupBookmarksByFolder(bookmarks, folders)

    expect(groups.map(({ id, title, path, depth, bookmarks: items }) => ({
      id, title, path, depth, bookmarkIds: items.map((bookmark) => bookmark.id),
    }))).toEqual([
      { id: ROOT_BOOKMARK_GROUP_ID, title: '根目录', path: '根目录', depth: 0, bookmarkIds: ['root'] },
      { id: 'work', title: '工作', path: '工作', depth: 0, bookmarkIds: ['one'] },
      { id: 'docs', title: '文档', path: '工作 / 文档', depth: 1, bookmarkIds: ['two'] },
    ])
  })

  it('keeps bookmarks whose folder is missing from the current tree', () => {
    const groups = groupBookmarksByFolder([
      { id: 'legacy', title: 'Legacy', url: 'https://legacy.test', parentId: 'missing', folderPath: '归档 / 旧资料' },
    ], folders)

    expect(groups[0]).toMatchObject({ id: 'missing', title: '旧资料', path: '归档 / 旧资料', depth: 1 })
    expect(groups[0].bookmarks.map((bookmark) => bookmark.id)).toEqual(['legacy'])
  })
})
