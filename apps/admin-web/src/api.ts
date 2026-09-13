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
  serverUrl: string
  deviceCode: string
  expiresAt: string
  browserName: string
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

export type LibraryFolder = {
  id: string
  title: string
  bookmarkCount: number
  children: LibraryFolder[]
}

export type LibraryBookmark = {
  id: string
  title: string
  url: string
  parentId: string | null
  folderPath: string
}

export type LibraryTree = {
  folders: LibraryFolder[]
  bookmarks: LibraryBookmark[]
}

export type LibraryTrashItem = {
  id: string
  title: string
  nodeType: 'folder' | 'bookmark'
  deletedAt: string
}

export type LibraryFaviconMap = Record<string, string>

const LIBRARY_FAVICON_STORAGE_KEY = 'wotty.admin.library-favicons.v2'
const libraryFaviconCache = new Map<string, string>()

function readLibraryFaviconCache() {
  try {
    const value = JSON.parse(localStorage.getItem(LIBRARY_FAVICON_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    Object.entries(value).forEach(([key, source]) => { if (typeof source === 'string') libraryFaviconCache.set(key, source) })
  } catch {
    // Persistence is optional.
  }
}

function writeLibraryFaviconCache() {
  try {
    localStorage.setItem(LIBRARY_FAVICON_STORAGE_KEY, JSON.stringify(Object.fromEntries(libraryFaviconCache)))
  } catch {
    // Persistence is optional.
  }
}

export type EncryptionStatus = {
  encryptedFile: boolean
  passphraseStored: boolean
  unlocked: boolean
  zeroKnowledge: boolean
}

export type ResetSyncBaselineResult = {
  reset: boolean
  backupCreated: boolean
}

export type BackupSettings = {
  enabled: boolean
  dailyTime: string
  retentionCount: number
  lastStartedAt: string | null
  lastFinishedAt: string | null
  lastStatus: string | null
  lastError: string | null
  nextRunAt: string | null
}

export type BackupRun = {
  id: string
  backupName: string
  byteSize: number
  status: string
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export type MoveFolderResponse = {
  moved: boolean
  unchanged?: boolean
  folderId?: string
  parentId?: string | null
  etag: string | null
  version?: number
}

function networkRequestError(error: unknown): ApiRequestError | null {
  if (!(error instanceof TypeError) || !/fetch|network|failed|connection/i.test(error.message)) return null
  return new ApiRequestError('开发服务连接已断开，请重新运行 pnpm dev 后点击刷新重试。', 0, 'network_error')
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch (error) {
    throw networkRequestError(error) ?? error
  }
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }

  if (!response.ok) {
    const errorPayload = typeof payload === 'object' && payload ? payload as { message?: unknown; code?: unknown } : {}
    const code = typeof errorPayload.code === 'string' ? errorPayload.code : undefined
    const proxyConnectionFailed = response.status === 500 && !code && (payload === null || typeof payload === 'string')
    const message = proxyConnectionFailed
      ? 'API 服务未连接，请查看 pnpm dev 终端中的 api 退出原因，修复后点击刷新重试。'
      : typeof errorPayload.message === 'string'
      ? errorPayload.message
      : `请求失败（${response.status}）`
    throw new ApiRequestError(message, response.status, proxyConnectionFailed ? 'service_unavailable' : code)
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

export function createFloccusCredential(token: string, name: string) {
  return request<AppPassword>('/api/v1/floccus/credentials', {
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

export function getEncryptionStatus(token: string) {
  return request<EncryptionStatus>('/api/v1/storage/encryption', {}, token)
}

export function unlockFloccusEncryption(token: string, passphrase: string) {
  return request<{ unlocked: boolean }>('/api/v1/storage/encryption/unlock', {
    method: 'POST',
    body: JSON.stringify({ passphrase }),
  }, token)
}

export function forgetFloccusPassphrase(token: string) {
  return request<void>('/api/v1/storage/encryption/passphrase', { method: 'DELETE' }, token)
}

export function getHealth() {
  return request<HealthResponse>('/health/live')
}

export function moveFolder(token: string, folderId: string, parentId: string | null, expectedEtag: string | null) {
  return request<MoveFolderResponse>('/api/v1/bookmarks/folders/move', {
    method: 'POST',
    body: JSON.stringify({ folderId, parentId, expectedEtag }),
  }, token)
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

export function trashBookmarks(token: string, bookmarkIds: string[], expectedEtag: string | null) {
  return request<{ deleted: boolean; count: number; etag: string; version: number }>('/api/v1/bookmarks/trash/batch', {
    method: 'POST',
    body: JSON.stringify({ bookmarkIds, expectedEtag }),
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
  let response: Response
  try {
    response = await fetch('/api/v1/storage/export', {
      headers: { authorization: `Bearer ${token}` },
    })
  } catch (error) {
    throw networkRequestError(error) ?? error
  }
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

export function resetSyncBaseline(token: string) {
  return request<ResetSyncBaselineResult>('/api/v1/storage/reset-sync-baseline', { method: 'POST' }, token)
}

export function getBackupSettings(token: string) {
  return request<BackupSettings>('/api/v1/backups/settings', {}, token)
}

export function updateBackupSettings(token: string, settings: Pick<BackupSettings, 'enabled' | 'dailyTime' | 'retentionCount'>) {
  return request<BackupSettings>('/api/v1/backups/settings', { method: 'PUT', body: JSON.stringify(settings) }, token)
}

export function getBackupRuns(token: string) {
  return request<BackupRun[]>('/api/v1/backups/runs', {}, token)
}

export function runBackupNow(token: string) {
  return request<BackupRun>('/api/v1/backups/run', { method: 'POST' }, token)
}

export async function downloadBackup(token: string, backupName: string) {
  const response = await fetch(`/api/v1/backups/${encodeURIComponent(backupName)}/download`, { headers: { authorization: `Bearer ${token}` } })
  if (!response.ok) throw new ApiRequestError('备份下载失败', response.status)
  return response.blob()
}

export function restoreBackup(token: string, backupName: string) {
  return request<{ restored: boolean; restartRequired: boolean; protectionBackup: string }>(`/api/v1/backups/${encodeURIComponent(backupName)}/restore`, { method: 'POST' }, token)
}

export function createSidebarPairing(token: string, browserName: string) {
  return request<SidebarPairing>('/api/v1/sidebar/pairing-codes', {
    method: 'POST',
    body: JSON.stringify({ browserName }),
  }, token)
}

export function getBookmarks(token: string, query = '') {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
  return request<BookmarkTree>(`/api/v1/bookmarks${suffix}`, {}, token)
}

export function getLibrary(token: string) {
  return request<LibraryTree>('/api/v1/library', {}, token)
}

export function createLibraryBookmark(token: string, value: { title: string; url: string; parentId: string | null }) {
  return request('/api/v1/library/bookmarks', { method: 'POST', body: JSON.stringify(value) }, token)
}

export function createLibraryFolder(token: string, value: { title: string; parentId: string | null }) {
  return request('/api/v1/library/folders', { method: 'POST', body: JSON.stringify(value) }, token)
}

export function updateLibraryNode(token: string, id: string, value: { title: string; url?: string }) {
  return request(`/api/v1/library/nodes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(value) }, token)
}

export function moveLibraryNode(token: string, id: string, parentId: string | null) {
  return request(`/api/v1/library/nodes/${encodeURIComponent(id)}/move`, { method: 'POST', body: JSON.stringify({ parentId }) }, token)
}

export function deleteLibraryNode(token: string, id: string) {
  return request(`/api/v1/library/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' }, token)
}

export function getLibraryTrash(token: string) {
  return request<LibraryTrashItem[]>('/api/v1/library/trash', {}, token)
}

export function restoreLibraryNode(token: string, id: string) {
  return request(`/api/v1/library/trash/${encodeURIComponent(id)}/restore`, { method: 'POST' }, token)
}

export function permanentlyDeleteLibraryTrashNode(token: string, id: string) {
  return request<{ deleted: boolean; removed: number }>(`/api/v1/library/trash/${encodeURIComponent(id)}`, { method: 'DELETE' }, token)
}

export function emptyLibraryTrash(token: string) {
  return request<{ removed: number }>('/api/v1/library/trash/empty', { method: 'POST' }, token)
}

export function importLibraryXbel(token: string, xbel: string, replace = false) {
  return request<{ imported: boolean; count: number }>('/api/v1/library/import', { method: 'POST', body: JSON.stringify({ xbel, replace }) }, token)
}

export function importLibraryFromSync(token: string) {
  return request<{ imported: boolean; count: number }>('/api/v1/library/import-from-sync', { method: 'POST' }, token)
}

export async function resolveLibraryFavicons(token: string, urls: string[]): Promise<LibraryFaviconMap> {
  if (typeof localStorage !== 'undefined' && libraryFaviconCache.size === 0) readLibraryFaviconCache()
  const origins = Array.from(new Set(urls.map((value) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
    } catch {
      return null
    }
  }).filter((value): value is string => Boolean(value))))
  const output: LibraryFaviconMap = {}
  const pendingOrigins = origins.filter((origin) => {
    const cached = libraryFaviconCache.get(origin)
    if (cached) output[origin] = cached
    return !cached
  })
  for (let index = 0; index < pendingOrigins.length; index += 2000) {
    const payload = await request<{ items: Array<{ origin: string; url: string; dataUrl?: string }> }>('/api/v1/library/favicons', {
      method: 'POST',
      body: JSON.stringify({ urls: pendingOrigins.slice(index, index + 2000) }),
    }, token)
    await Promise.all(payload.items.map(async (item) => {
      if (item.dataUrl) {
        output[item.origin] = item.dataUrl
        libraryFaviconCache.set(item.origin, item.dataUrl)
        return
      }
      try {
        const response = await fetch(item.url, { headers: { authorization: `Bearer ${token}` } })
        if (!response.ok) return
        const blob = await response.blob()
        const source = await new Promise<string | null>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        })
        if (source) { output[item.origin] = source; libraryFaviconCache.set(item.origin, source) }
      } catch {
        // Individual icons are best-effort; the list still renders without them.
      }
    }))
  }
  if (typeof localStorage !== 'undefined') writeLibraryFaviconCache()
  return output
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
