import { browser } from 'wxt/browser';
import type { BackendConnection } from './backend';

export type SidebarLocale = 'zh-CN' | 'en';

const SIDEBAR_LOCALE_KEY = 'bookmark-vault.sidebar-locale.v1';
const DEFAULT_LOCALE: SidebarLocale = 'zh-CN';

function isSidebarLocale(value: unknown): value is SidebarLocale {
  return value === 'zh-CN' || value === 'en';
}

/** Restores the last known account language while the service is unavailable. */
export async function loadSidebarLocale(): Promise<SidebarLocale> {
  const values = await browser.storage.local.get(SIDEBAR_LOCALE_KEY);
  const value = values[SIDEBAR_LOCALE_KEY];
  return isSidebarLocale(value) ? value : DEFAULT_LOCALE;
}

export async function saveSidebarLocale(locale: SidebarLocale): Promise<void> {
  await browser.storage.local.set({ [SIDEBAR_LOCALE_KEY]: locale });
}

/**
 * Reads the account-owned preference. The sidebar intentionally never writes
 * this setting: the admin console remains the single source of truth.
 */
export async function refreshSidebarLocale(connection: BackendConnection): Promise<SidebarLocale> {
  const response = await fetch(`${connection.serverUrl}/api/v1/preferences`, {
    headers: { authorization: `Bearer ${connection.token}` },
  });
  const payload = await response.json().catch(() => null) as { language?: unknown; message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.message || `语言偏好读取失败（${response.status}）`);
  }
  if (!isSidebarLocale(payload?.language)) {
    throw new Error('服务器返回了不支持的界面语言');
  }
  await saveSidebarLocale(payload.language);
  return payload.language;
}
