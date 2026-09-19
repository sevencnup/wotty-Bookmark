import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserBookmark, createBrowserFolder, deleteBrowserNode, getBrowserLibrary, moveBrowserNode, updateBrowserNode } from './browser-library';

const bookmarks = {
  getTree: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  removeTree: vi.fn(),
};

vi.mock('./browser-api', async () => {
  const actual = await vi.importActual<typeof import('./browser-api')>('./browser-api');
  return { ...actual, getBookmarksApi: () => bookmarks };
});

describe('browser bookmark library', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('converts the browser bookmark tree into the sidebar library shape', async () => {
    bookmarks.getTree.mockResolvedValue([{ id: 'root', title: '', children: [{ id: 'bar', title: '书签栏', children: [{ id: 'one', title: 'Example', url: 'https://example.com' }] }] }]);

    await expect(getBrowserLibrary()).resolves.toEqual({
      folders: [{ id: 'bar', title: '书签栏', bookmarkCount: 1, children: [] }],
      bookmarks: [{ id: 'one', title: 'Example', url: 'https://example.com', parentId: 'bar', folderPath: '' }],
    });
  });

  it('uses the requested parent and resolves the default browser folder when needed', async () => {
    bookmarks.getTree.mockResolvedValue([{ id: 'root', title: '', children: [{ id: 'bar', title: '书签栏', children: [] }] }]);
    bookmarks.create.mockResolvedValue({ id: 'created' });

    await createBrowserBookmark({ title: 'Example', url: 'https://example.com', parentId: 'bar' });
    await createBrowserFolder({ title: 'News', parentId: null });

    expect(bookmarks.create).toHaveBeenNthCalledWith(1, { parentId: 'bar', title: 'Example', url: 'https://example.com' });
    expect(bookmarks.create).toHaveBeenNthCalledWith(2, { parentId: 'bar', title: 'News' });
  });

  it('delegates edit, move, and delete operations to the browser API', async () => {
    bookmarks.getTree.mockResolvedValue([{ id: 'root', title: '', children: [{ id: 'bar', title: '书签栏', children: [] }] }]);

    await updateBrowserNode('one', { title: 'Updated', url: 'https://updated.example.com' });
    await moveBrowserNode('one', null);
    await deleteBrowserNode('one');

    expect(bookmarks.update).toHaveBeenCalledWith('one', { title: 'Updated', url: 'https://updated.example.com' });
    expect(bookmarks.move).toHaveBeenCalledWith('one', { parentId: 'bar' });
    expect(bookmarks.removeTree).toHaveBeenCalledWith('one');
  });
});
