import type { BackendConnection } from './backend';

export type LibraryFolder = {
  id: string;
  title: string;
  bookmarkCount: number;
  children: LibraryFolder[];
};

export type LibraryBookmark = {
  id: string;
  title: string;
  url: string;
  parentId: string | null;
  folderPath: string;
};

export type LibraryTree = {
  folders: LibraryFolder[];
  bookmarks: LibraryBookmark[];
};

type ErrorPayload = { message?: string };

async function request<T>(connection: BackendConnection, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${connection.serverUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json', ...init.headers },
  });
  const payload = await response.json().catch(() => null) as T | ErrorPayload | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && 'message' in payload && payload.message ? payload.message : `书签库请求失败（${response.status}）`);
  }
  return payload as T;
}

export function getLibrary(connection: BackendConnection) { return request<LibraryTree>(connection, '/api/v1/library'); }
export function createLibraryBookmark(connection: BackendConnection, value: { title: string; url: string; parentId: string | null }) { return request(connection, '/api/v1/library/bookmarks', { method: 'POST', body: JSON.stringify(value) }); }
export function createLibraryFolder(connection: BackendConnection, value: { title: string; parentId: string | null }) { return request(connection, '/api/v1/library/folders', { method: 'POST', body: JSON.stringify(value) }); }
export function updateLibraryNode(connection: BackendConnection, id: string, value: { title: string; url?: string }) { return request(connection, `/api/v1/library/nodes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(value) }); }
export function moveLibraryNode(connection: BackendConnection, id: string, parentId: string | null) { return request(connection, `/api/v1/library/nodes/${encodeURIComponent(id)}/move`, { method: 'POST', body: JSON.stringify({ parentId }) }); }
export function deleteLibraryNode(connection: BackendConnection, id: string) { return request(connection, `/api/v1/library/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
