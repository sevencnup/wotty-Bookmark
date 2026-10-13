import { browser } from './extension-api';
import type { BackendConnection } from './backend';
import type { LibraryTree } from './library';

const CACHE_KEY_PREFIX = 'bookmark-vault.server-library-cache.v1';
const MAX_CACHE_BYTES = 2 * 1024 * 1024;

export type CachedLibrary = {
  tree: LibraryTree;
  savedAt: string;
};

function cacheKey(connection: BackendConnection) {
  const server = connection.serverUrl.replace(/\/+$/, '').toLowerCase();
  const account = connection.loginIdentifier.trim().toLowerCase();
  return `${CACHE_KEY_PREFIX}:${encodeURIComponent(server)}:${encodeURIComponent(account)}`;
}

function isLibraryTree(value: unknown): value is LibraryTree {
  if (!value || typeof value !== 'object') return false;
  const tree = value as Partial<LibraryTree>;
  return Array.isArray(tree.folders) && Array.isArray(tree.bookmarks);
}

export async function loadCachedLibrary(connection: BackendConnection): Promise<CachedLibrary | null> {
  const key = cacheKey(connection);
  const values = await browser.storage.local.get(key);
  const cached = values[key] as CachedLibrary | undefined;
  if (!cached || !isLibraryTree(cached.tree) || typeof cached.savedAt !== 'string') return null;
  if (!Number.isFinite(Date.parse(cached.savedAt))) return null;
  return cached;
}

export async function saveCachedLibrary(connection: BackendConnection, tree: LibraryTree): Promise<void> {
  const cached: CachedLibrary = { tree, savedAt: new Date().toISOString() };
  const size = new TextEncoder().encode(JSON.stringify(cached)).byteLength;
  if (size > MAX_CACHE_BYTES) return;
  await browser.storage.local.set({ [cacheKey(connection)]: cached });
}
