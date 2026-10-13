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

export async function requestBackendApi(serverUrl: string, path: string, init?: RequestInit): Promise<Response> {
  let result: { status?: number; body?: string; error?: string };
  try {
    result = await browser.runtime.sendMessage({ type: 'wotty-bookmark:api-request', url: `${serverUrl}${path}`, init });
  } catch {
    throw new Error('无法连接扩展后台，请重新加载插件后重试');
  }
  if (result?.error) throw new Error(result.error);
  const status = result?.status ?? 502;
  const body = status === 204 || status === 205 || status === 304 ? null : result?.body ?? '';
  return new Response(body, { status });
}

export async function connectToBackend(serverUrlValue: string, deviceCodeValue: string): Promise<BackendConnection> {
  const { serverUrl, code } = resolvePairingRequest(serverUrlValue, deviceCodeValue);
  const response = await requestBackendApi(serverUrl, '/api/v1/sidebar/exchange', {
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
