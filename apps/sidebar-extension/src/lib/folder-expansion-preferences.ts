import { browser } from './extension-api';
import type { SidebarSourceMode } from './preferences';

export type FolderExpansionSnapshot = {
  knownFolderIds: string[];
  expandedFolderIds: string[];
};

const STORAGE_KEYS: Record<SidebarSourceMode, string> = {
  browser: 'bookmark-vault.expanded-folders.browser.v1',
  server: 'bookmark-vault.expanded-folders.server.v1',
};

const emptySnapshot = (): FolderExpansionSnapshot => ({ knownFolderIds: [], expandedFolderIds: [] });

function normalizeSnapshot(value: unknown): FolderExpansionSnapshot {
  if (!value || typeof value !== 'object') return emptySnapshot();
  const stored = value as Partial<FolderExpansionSnapshot>;
  const knownFolderIds = Array.isArray(stored.knownFolderIds)
    ? [...new Set(stored.knownFolderIds.filter((id): id is string => typeof id === 'string'))]
    : [];
  const known = new Set(knownFolderIds);
  const expandedFolderIds = Array.isArray(stored.expandedFolderIds)
    ? [...new Set(stored.expandedFolderIds.filter((id): id is string => typeof id === 'string' && known.has(id)))]
    : [];
  return { knownFolderIds, expandedFolderIds };
}

export async function loadFolderExpansionSnapshots(): Promise<Record<SidebarSourceMode, FolderExpansionSnapshot>> {
  const keys = Object.values(STORAGE_KEYS);
  const stored = await browser.storage.local.get(keys);
  return {
    browser: normalizeSnapshot(stored[STORAGE_KEYS.browser]),
    server: normalizeSnapshot(stored[STORAGE_KEYS.server]),
  };
}

export async function saveFolderExpansionSnapshot(sourceMode: SidebarSourceMode, snapshot: FolderExpansionSnapshot): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS[sourceMode]]: normalizeSnapshot(snapshot) });
}
