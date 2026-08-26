import { browser } from 'wxt/browser';

const CONNECTION_KEY = 'bookmark-vault.sidebar-connection';
const PAIRING_PREFIX = 'bvpair.v1.';

export interface BackendConnection {
  serverUrl: string;
  token: string;
  loginIdentifier: string;
  connectedAt: string;
}

export interface BackendBookmarkTree {
  status: 'ready' | 'encrypted' | 'migrationRequired' | 'notReady';
  etag: string | null;
  version: number | null;
  folders: Array<{ id: string; title: string; bookmarkCount: number; children: unknown[] }>;
  bookmarks: Array<{ id: string; title: string; url: string; parentId: string | null; folderPath: string }>;
}

interface PairingEnvelope {
  serverUrl?: string;
  secret?: string;
}

interface SessionResponse {
  token: string;
  user: { id: string; loginIdentifier: string };
}

async function loadValue<T>(key: string): Promise<T | null> {
  const values = await browser.storage.local.get(key);
  return (values[key] as T | undefined) ?? null;
}

export function loadBackendConnection(): Promise<BackendConnection | null> {
  return loadValue<BackendConnection>(CONNECTION_KEY);
}

export async function clearBackendConnection(): Promise<void> {
  await browser.storage.local.remove(CONNECTION_KEY);
}

function parsePairingCode(value: string): { serverUrl: string; code: string } {
  const trimmed = value.trim();
  if (!trimmed.startsWith(PAIRING_PREFIX)) {
    throw new Error('连接码格式不正确');
  }
  let envelope: PairingEnvelope;
  try {
    const encoded = trimmed.slice(PAIRING_PREFIX.length);
    const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4));
    envelope = JSON.parse(decoded) as PairingEnvelope;
  } catch {
    throw new Error('连接码格式不正确');
  }
  const serverUrl = envelope.serverUrl?.trim().replace(/\/$/, '');
  if (!serverUrl || !envelope.secret) {
    throw new Error('连接码内容不完整');
  }
  try {
    const url = new URL(serverUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
  } catch {
    throw new Error('连接码中的后台地址无效');
  }
  return { serverUrl, code: trimmed };
}

export async function connectWithPairingCode(value: string): Promise<BackendConnection> {
  const { serverUrl, code } = parsePairingCode(value);
  const response = await fetch(`${serverUrl}/api/v1/sidebar/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const payload = await response.json().catch(() => null) as SessionResponse | { message?: string } | null;
  if (!response.ok || !payload || !('token' in payload)) {
    throw new Error(payload && 'message' in payload && payload.message ? payload.message : '侧边栏连接失败');
  }
  const connection: BackendConnection = {
    serverUrl,
    token: payload.token,
    loginIdentifier: payload.user.loginIdentifier,
    connectedAt: new Date().toISOString(),
  };
  await browser.storage.local.set({ [CONNECTION_KEY]: connection });
  return connection;
}

export async function getBackendBookmarks(connection: BackendConnection): Promise<BackendBookmarkTree> {
  const response = await fetch(`${connection.serverUrl}/api/v1/bookmarks`, {
    headers: { authorization: `Bearer ${connection.token}` },
  });
  const payload = await response.json().catch(() => null) as BackendBookmarkTree | { message?: string } | null;
  if (!response.ok || !payload || !('status' in payload)) {
    throw new Error(payload && 'message' in payload && payload.message ? payload.message : '读取后台书签失败');
  }
  return payload;
}
