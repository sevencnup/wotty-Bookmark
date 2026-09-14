import { describe, expect, it } from 'vitest'
import type { LibraryTree } from './api'
import { toCategoryTree } from './category-library'

describe('category library adapter', () => {
  it('keeps empty folders from the server library in the category tree', () => {
    const library: LibraryTree = {
      folders: [{ id: 'empty', title: '空白文件夹', bookmarkCount: 0, children: [] }],
      bookmarks: [],
    }

    expect(toCategoryTree(library)).toMatchObject({
      status: 'ready',
      folders: library.folders,
      bookmarks: library.bookmarks,
    })
  })
})
