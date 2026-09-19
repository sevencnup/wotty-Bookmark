import type { BookmarkNode } from './browser-api';
import { getBookmarksApi } from './browser-api';
import type { LibraryFolder, LibraryTree } from './library';

function api() {
  const bookmarks = getBookmarksApi();
  if (!bookmarks) throw new Error('浏览器书签 API 不可用，请检查扩展权限。');
  return bookmarks;
}

function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce((total, node) => total + (node.children ? countBookmarks(node.children) : 1), 0);
}

function foldersFromNodes(nodes: BookmarkNode[]): LibraryFolder[] {
  return nodes.filter((node) => Boolean(node.children)).map((node) => ({
    id: node.id,
    title: node.title,
    bookmarkCount: countBookmarks(node.children ?? []),
    children: foldersFromNodes(node.children ?? []),
  }));
}

function collectBookmarks(nodes: BookmarkNode[], parentId: string | null, output: LibraryTree['bookmarks']) {
  for (const node of nodes) {
    if (node.children) collectBookmarks(node.children, node.id, output);
    else if (node.url) output.push({ id: node.id, title: node.title, url: node.url, parentId, folderPath: '' });
  }
}

export async function getBrowserLibrary(): Promise<LibraryTree> {
  const roots = await api().getTree();
  const visibleRoots = roots.length === 1 && !roots[0]?.title
    ? roots[0]?.children ?? []
    : roots;
  const bookmarks: LibraryTree['bookmarks'] = [];
  collectBookmarks(visibleRoots, null, bookmarks);
  return { folders: foldersFromNodes(visibleRoots), bookmarks };
}

function defaultParentId(roots: BookmarkNode[]): string {
  const firstFolder = roots.flatMap((root) => root.children ?? []).find((node) => Boolean(node.children));
  if (firstFolder) return firstFolder.id;
  const fallback = roots.find((root) => Boolean(root.children));
  if (fallback) return fallback.id;
  throw new Error('浏览器没有可用的书签文件夹。');
}

async function resolveParentId(parentId: string | null) {
  if (parentId) return parentId;
  const roots = await api().getTree();
  return defaultParentId(roots);
}

export async function createBrowserBookmark(value: { title: string; url: string; parentId: string | null }) {
  await api().create({ parentId: await resolveParentId(value.parentId), title: value.title, url: value.url });
}

export async function createBrowserFolder(value: { title: string; parentId: string | null }) {
  await api().create({ parentId: await resolveParentId(value.parentId), title: value.title });
}

export async function updateBrowserNode(id: string, value: { title: string; url?: string }) {
  await api().update(id, value);
}

export async function moveBrowserNode(id: string, parentId: string | null) {
  await api().move(id, { parentId: await resolveParentId(parentId) });
}

export async function deleteBrowserNode(id: string) {
  await api().removeTree(id);
}
