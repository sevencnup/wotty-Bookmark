import type { BookmarkTree, LibraryTree } from './api'

/**
 * The category workspace retains its specialised tree interaction UI while
 * reading the server library — the same source used by “我的书签库”.
 */
export function toCategoryTree(library: LibraryTree): BookmarkTree {
  return {
    status: 'ready',
    etag: null,
    version: null,
    folders: library.folders,
    bookmarks: library.bookmarks,
  }
}
