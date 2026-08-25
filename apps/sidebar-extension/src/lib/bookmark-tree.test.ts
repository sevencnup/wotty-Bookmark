import { describe, expect, it } from 'vitest';
import {
  countBookmarks,
  flattenVisibleNodes,
  getFolderOptions,
  searchBookmarks,
} from './bookmark-tree';
import type { BookmarkNode } from './browser-api';

const tree: BookmarkNode[] = [
  {
    id: 'bar',
    title: '书签栏',
    children: [
      { id: 'design', title: '设计灵感', children: [{ id: 'linear', title: 'Linear', url: 'https://linear.app' }] },
      { id: 'docs', title: '浏览器文档', url: 'https://developer.chrome.com' },
    ],
  },
];

describe('bookmark tree helpers', () => {
  it('flattens only expanded branches and keeps depth', () => {
    expect(flattenVisibleNodes(tree, new Set(['bar']))).toMatchObject([
      { id: 'bar', depth: 0 },
      { id: 'design', depth: 1 },
      { id: 'docs', depth: 1 },
    ]);
    expect(flattenVisibleNodes(tree, new Set(['bar', 'design']))).toMatchObject([
      { id: 'bar', depth: 0 },
      { id: 'design', depth: 1 },
      { id: 'linear', depth: 2 },
      { id: 'docs', depth: 1 },
    ]);
  });

  it('searches titles and urls with folder breadcrumbs', () => {
    expect(searchBookmarks(tree, 'linear')).toEqual([
      { node: tree[0]!.children![0]!.children![0], breadcrumb: ['书签栏', '设计灵感'] },
    ]);
    expect(searchBookmarks(tree, 'chrome')).toHaveLength(1);
  });

  it('counts bookmarks and excludes the edited folder from destinations', () => {
    expect(countBookmarks(tree)).toBe(2);
    expect(getFolderOptions(tree, 'bar')).toEqual([]);
    expect(getFolderOptions(tree)).toMatchObject([{ id: 'bar' }, { id: 'design' }]);
  });
});
