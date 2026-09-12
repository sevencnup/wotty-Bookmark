import { browser } from 'wxt/browser';
import { resolvePairingRequest } from './backend-connection';

const CONNECTION_KEY = 'bookmark-vault.sidebar-connection';

export interface BackendConnection {
  serverUrl: string;
  token: string;
  loginIdentifier: string;
  connectedAt: string;
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

export async function connectToBackend(serverUrlValue: string, deviceCodeValue: string): Promise<BackendConnection> {
  const { serverUrl, code } = resolvePairingRequest(serverUrlValue, deviceCodeValue);
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
