import { browser } from 'wxt/browser';
import type { BackendConnection } from './backend';

export type SidebarLocale = 'zh-CN' | 'en';
export type SidebarSourceMode = 'browser' | 'server';

const SIDEBAR_LOCALE_KEY = 'bookmark-vault.sidebar-locale.v1';
const DEFAULT_LOCALE: SidebarLocale = 'zh-CN';
const SIDEBAR_SOURCE_MODE_KEY = 'bookmark-vault.sidebar-source-mode.v1';
const SIDEBAR_SOURCE_MODE_OVERRIDE_KEY = 'bookmark-vault.sidebar-source-mode-override.v1';
const DEFAULT_SOURCE_MODE: SidebarSourceMode = 'server';

function isSidebarLocale(value: unknown): value is SidebarLocale {
  return value === 'zh-CN' || value === 'en';
}

function isSidebarSourceMode(value: unknown): value is SidebarSourceMode {
  return value === 'browser' || value === 'server';
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

export async function loadSidebarSourceMode(): Promise<SidebarSourceMode> {
  const values = await browser.storage.local.get(SIDEBAR_SOURCE_MODE_KEY);
  return isSidebarSourceMode(values[SIDEBAR_SOURCE_MODE_KEY]) ? values[SIDEBAR_SOURCE_MODE_KEY] : DEFAULT_SOURCE_MODE;
}

export async function loadSidebarSourceModeOverride(): Promise<SidebarSourceMode | null> {
  const values = await browser.storage.local.get(SIDEBAR_SOURCE_MODE_OVERRIDE_KEY);
  const value = values[SIDEBAR_SOURCE_MODE_OVERRIDE_KEY];
  return isSidebarSourceMode(value) ? value : null;
}

export async function saveSidebarSourceModeOverride(sourceMode: SidebarSourceMode): Promise<void> {
  await browser.storage.local.set({ [SIDEBAR_SOURCE_MODE_OVERRIDE_KEY]: sourceMode });
}

async function saveSidebarSourceMode(sourceMode: SidebarSourceMode): Promise<void> {
  await browser.storage.local.set({ [SIDEBAR_SOURCE_MODE_KEY]: sourceMode });
}

export async function refreshSidebarPreferences(connection: BackendConnection): Promise<{ language: SidebarLocale; sourceMode: SidebarSourceMode }> {
  const response = await fetch(`${connection.serverUrl}/api/v1/preferences`, {
    headers: { authorization: `Bearer ${connection.token}` },
  });
  const payload = await response.json().catch(() => null) as { language?: unknown; sourceMode?: unknown; message?: string } | null;
  if (!response.ok) throw new Error(payload?.message || `偏好设置读取失败（${response.status}）`);
  if (!isSidebarLocale(payload?.language)) throw new Error('服务器返回了不支持的界面语言');
  if (!isSidebarSourceMode(payload?.sourceMode)) throw new Error('服务器返回了不支持的书签来源');
  await saveSidebarLocale(payload.language);
  await saveSidebarSourceMode(payload.sourceMode);
  return { language: payload.language, sourceMode: payload.sourceMode };
}

/**
 * Reads the account-owned preference. The sidebar intentionally never writes
 * this setting: the admin console remains the single source of truth.
 */
export async function refreshSidebarLocale(connection: BackendConnection): Promise<SidebarLocale> {
  return (await refreshSidebarPreferences(connection)).language;
}
