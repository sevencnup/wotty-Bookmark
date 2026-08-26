export type User = {
  id: string
  loginIdentifier: string
}

export type Session = {
  token: string
  user: User
}

export type AppPassword = {
  id: string
  name: string
  secret?: string | null
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export type StorageStatus = {
  files: number
  bytes: number
  lastModifiedAt: string | null
  maxFileBytes: number
}

export type BookmarkFolder = {
  id: string
  title: string
  bookmarkCount: number
  children: BookmarkFolder[]
}

export type BookmarkItem = {
  id: string
  title: string
  url: string
  parentId: string | null
  folderPath: string
}

export type BookmarkTree = {
  status: 'ready' | 'encrypted' | 'migrationRequired' | 'notReady'
  etag: string | null
  version: number | null
  folders: BookmarkFolder[]
  bookmarks: BookmarkItem[]
}

export type MoveBookmarksResponse = {
  moved: boolean
  count: number
  etag: string
  version: number
}

export type SidebarPairing = {
  code: string
  expiresAt: string
}

export type FileVersion = {
  id: string
  filePath: string
  etag: string
  byteSize: number
  createdAt: string
}

export type TrashItem = {
  id: string
  title: string
  url: string
  folderPath: string
  originalPosition: number
  deletedAt: string
}

export type TrashResponse = {
  status: 'ready' | 'encrypted' | 'migrationRequired' | 'notReady'
  items: TrashItem[]
}

export type Device = {
  id: string
  clientId: string
  name: string
  deviceType: string
  userAgentSummary: string
  lastSeenAt: string
  createdAt: string
  revokedAt: string | null
}

export type HealthResponse = {
  status: 'ok'
  service: string
  version: string
}

export type ImportResult = {
  imported: boolean
  encrypted: boolean
  byteSize: number
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)

  const response = await fetch(path, { ...init, headers })
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    const errorPayload = typeof payload === 'object' && payload ? payload as { message?: unknown; code?: unknown } : {}
    const message = typeof errorPayload.message === 'string'
      ? errorPayload.message
      : `请求失败（${response.status}）`
    throw new ApiRequestError(message, response.status, typeof errorPayload.code === 'string' ? errorPayload.code : undefined)
  }
  return payload as T
}

export function register(loginIdentifier: string, password: string) {
  return request<Session>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ loginIdentifier, password }),
  })
}

export function login(loginIdentifier: string, password: string) {
  return request<Session>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login_identifier: loginIdentifier, password }),
  })
}

export function getAppPasswords(token: string) {
  return request<AppPassword[]>('/api/v1/app-passwords', {}, token)
}

export function createAppPassword(token: string, name: string) {
  return request<AppPassword>('/api/v1/app-passwords', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }, token)
}

export function revokeAppPassword(token: string, id: string) {
  return request<void>(`/api/v1/app-passwords/${id}`, { method: 'DELETE' }, token)
}

export function getStorageStatus(token: string) {
  return request<StorageStatus>('/api/v1/storage/status', {}, token)
}

export function getHealth() {
  return request<HealthResponse>('/health/live')
}

export function logout(token: string) {
  return request<void>('/api/v1/auth/logout', { method: 'POST' }, token)
}

export function getFileVersions(token: string) {
  return request<FileVersion[]>('/api/v1/storage/versions', {}, token)
}

export function restoreFileVersion(token: string, id: string) {
  return request<{ restored: boolean }>(`/api/v1/storage/versions/${id}/restore`, { method: 'POST' }, token)
}

export function cleanupFileVersions(token: string) {
  return request<{ removed: number; retainedPerFile: number }>('/api/v1/storage/versions/cleanup', { method: 'POST' }, token)
}

export function getTrash(token: string) {
  return request<TrashResponse>('/api/v1/bookmarks/trash', {}, token)
}

export function trashBookmark(token: string, bookmarkId: string, expectedEtag: string | null) {
  return request<{ deleted: boolean }>('/api/v1/bookmarks/trash', {
    method: 'POST',
    body: JSON.stringify({ bookmarkId, expectedEtag }),
  }, token)
}

export function restoreTrashItem(token: string, id: string, expectedEtag: string | null) {
  return request<{ restored: boolean }>(`/api/v1/bookmarks/trash/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify({ expectedEtag }),
  }, token)
}

export function permanentlyDeleteTrashItem(token: string, id: string) {
  return request<void>(`/api/v1/bookmarks/trash/${id}`, { method: 'DELETE' }, token)
}

export function emptyTrash(token: string) {
  return request<{ removed: number }>('/api/v1/bookmarks/trash/empty', { method: 'POST' }, token)
}

export function getDevices(token: string) {
  return request<Device[]>('/api/v1/devices', {}, token)
}

export function registerDevice(token: string, payload: { clientId: string; name: string; deviceType: string }) {
  return request<Device>('/api/v1/devices/register', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function revokeDevice(token: string, id: string) {
  return request<void>(`/api/v1/devices/${id}/revoke`, { method: 'POST' }, token)
}

export async function exportStorageFile(token: string) {
  const response = await fetch('/api/v1/storage/export', {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiRequestError('同步文件导出失败', response.status)
  return response.blob()
}

export function importStorageFile(token: string, file: Blob) {
  return request<ImportResult>('/api/v1/storage/import', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: file,
  }, token)
}

export function createSidebarPairing(token: string) {
  return request<SidebarPairing>('/api/v1/sidebar/pairing-codes', { method: 'POST' }, token)
}

export function getBookmarks(token: string, query = '') {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
  return request<BookmarkTree>(`/api/v1/bookmarks${suffix}`, {}, token)
}

export function moveBookmark(token: string, bookmarkId: string, parentId: string, expectedEtag: string | null) {
  return request<MoveBookmarksResponse>('/api/v1/bookmarks/move', {
    method: 'POST',
    body: JSON.stringify({ bookmarkId, parentId, expectedEtag }),
  }, token)
}

export function moveBookmarks(token: string, bookmarkIds: string[], parentId: string, expectedEtag: string | null) {
  return request<MoveBookmarksResponse>('/api/v1/bookmarks/move-batch', {
    method: 'POST',
    body: JSON.stringify({ bookmarkIds, parentId, expectedEtag }),
  }, token)
}
