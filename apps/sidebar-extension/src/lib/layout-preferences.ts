import { browser } from 'wxt/browser';

const COMPACT_TOOLBAR_KEY = 'bookmark-vault.compact-toolbar.v1';

export function isCompactToolbar(value: unknown): boolean {
  return value === true;
}

export async function loadCompactToolbar(): Promise<boolean> {
  const values = await browser.storage.local.get(COMPACT_TOOLBAR_KEY);
  return isCompactToolbar(values[COMPACT_TOOLBAR_KEY]);
}

export async function saveCompactToolbar(compact: boolean): Promise<void> {
  await browser.storage.local.set({ [COMPACT_TOOLBAR_KEY]: compact });
}
