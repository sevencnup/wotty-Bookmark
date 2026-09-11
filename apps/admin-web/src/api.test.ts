import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupFileVersions,
  createFloccusCredential,
  emptyTrash,
  exportStorageFile,
  forgetFloccusPassphrase,
  getBookmarks,
  getDevices,
  getFileVersions,
  getHealth,
  getEncryptionStatus,
  getTrash,
  importStorageFile,
  login,
  moveBookmark,
  moveBookmarks,
  moveFolder,
  permanentlyDeleteTrashItem,
  register,
  registerDevice,
  resetSyncBaseline,
  restoreFileVersion,
  restoreTrashItem,
  revokeAppPassword,
  revokeDevice,
  trashBookmark,
  trashBookmarks,
  unlockFloccusEncryption,
  getBackupSettings,
  updateBackupSettings,
  getBackupRuns,
  runBackupNow,
  downloadBackup,
  restoreBackup,
} from './api'

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(payload === undefined ? '' : JSON.stringify(payload)),
  } as unknown as Response
}

describe('admin API contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers with the API camelCase field names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ token: 'session-token' }))
    vi.stubGlobal('fetch', fetchMock)

    await register('qa@example.com', 'password-123456')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ loginIdentifier: 'qa@example.com', password: 'password-123456' }),
      }),
    )
  })

  it('logs in with the API snake_case field names', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ token: 'session-token' }))
    vi.stubGlobal('fetch', fetchMock)

    await login('qa@example.com', 'password-123456')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ login_identifier: 'qa@example.com', password: 'password-123456' }),
      }),
    )
  })

  it('creates one Floccus credential for WebDAV and encryption', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      id: 'credential-id',
      name: 'Floccus 书签同步',
      secret: 'bv_shared-secret',
      lastUsedAt: null,
      expiresAt: null,
      createdAt: '2026-08-30T00:00:00Z',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const credential = await createFloccusCredential('session-token', 'Floccus 书签同步')

    expect(credential.secret).toBe('bv_shared-secret')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/floccus/credentials',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Floccus 书签同步' }),
      }),
    )
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer session-token')
  })

  it('calls bookmark tree and move endpoints with encoded data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ status: 'ready', etag: 'etag-1', version: 2, folders: [], bookmarks: [] }))
      .mockResolvedValueOnce(response({ moved: true, count: 1, etag: 'etag-2', version: 3 }))
      .mockResolvedValueOnce(response({ moved: true, count: 2, etag: 'etag-3', version: 4 }))
      .mockResolvedValueOnce(response({ moved: true, folderId: 'folder-3', parentId: null, etag: 'etag-4', version: 5 }))
    vi.stubGlobal('fetch', fetchMock)

    await getBookmarks('session-token', 'Rust docs / 中文')
    await moveBookmark('session-token', 'bookmark-1', 'folder-1', 'etag-1')
    await moveBookmarks('session-token', ['bookmark-1', 'bookmark-2'], 'folder-2', 'etag-2')
    await moveFolder('session-token', 'folder-3', null, 'etag-3')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/bookmarks?q=Rust%20docs%20%2F%20%E4%B8%AD%E6%96%87')
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer session-token')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ bookmarkId: 'bookmark-1', parentId: 'folder-1', expectedEtag: 'etag-1' })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ bookmarkIds: ['bookmark-1', 'bookmark-2'], parentId: 'folder-2', expectedEtag: 'etag-2' })
    expect(fetchMock.mock.calls[3][0]).toBe('/api/v1/bookmarks/folders/move')
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ folderId: 'folder-3', parentId: null, expectedEtag: 'etag-3' })
  })
  it('uses binary requests for storage import and export', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(new Blob(['data'])) })
      .mockResolvedValueOnce(response({ imported: true, encrypted: true, byteSize: 4 }))
    vi.stubGlobal('fetch', fetchMock)

    await exportStorageFile('session-token')
    await importStorageFile('session-token', new Blob(['data']))

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/storage/export')
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { authorization: 'Bearer session-token' } })
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: expect.any(Blob),
    }))
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('content-type')).toBe('application/octet-stream')
  })

  it('requests a fast Floccus baseline reset with the session token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ reset: true, backupCreated: true }))
    vi.stubGlobal('fetch', fetchMock)

    await resetSyncBaseline('session-token')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/storage/reset-sync-baseline',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer session-token')
  })

  it('manages scheduled backup settings and runs', async () => {
    const settings = { enabled: true, dailyTime: '03:30', retentionCount: 5, lastStartedAt: null, lastFinishedAt: null, lastStatus: null, lastError: null, nextRunAt: '2026-09-12T03:30:00+08:00' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(settings))
      .mockResolvedValueOnce(response({ ...settings, enabled: false }))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: 'run-1', backupName: 'backup-20260911-033000', byteSize: 1234, status: 'success', errorMessage: null, createdAt: '2026-09-11T03:30:00Z', completedAt: '2026-09-11T03:30:03Z' }))
    vi.stubGlobal('fetch', fetchMock)

    await getBackupSettings('token')
    await updateBackupSettings('token', { enabled: false, dailyTime: '03:30', retentionCount: 5 })
    await getBackupRuns('token')
    await runBackupNow('token')

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method ?? 'GET'])).toEqual([
      ['/api/v1/backups/settings', 'GET'],
      ['/api/v1/backups/settings', 'PUT'],
      ['/api/v1/backups/runs', 'GET'],
      ['/api/v1/backups/run', 'POST'],
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ enabled: false, dailyTime: '03:30', retentionCount: 5 })
  })

  it('downloads and restores a complete server backup', async () => {
    const blob = new Blob(['archive'])
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(blob, { status: 200 }))
      .mockResolvedValueOnce(response({ restored: true, restartRequired: true, protectionBackup: 'backup-protect' }))
    vi.stubGlobal('fetch', fetchMock)

    await downloadBackup('session-token', 'backup-20260911-033000-abcd1234')
    await restoreBackup('session-token', 'backup-20260911-033000-abcd1234')

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method ?? 'GET'])).toEqual([
      ['/api/v1/backups/backup-20260911-033000-abcd1234/download', 'GET'],
      ['/api/v1/backups/backup-20260911-033000-abcd1234/restore', 'POST'],
    ])
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer session-token')
  })

  it('manages the protected Floccus passphrase without reading it back', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ encryptedFile: true, passphraseStored: false, unlocked: false, zeroKnowledge: true }))
      .mockResolvedValueOnce(response({ unlocked: true }))
      .mockResolvedValueOnce(response(undefined, 204))
    vi.stubGlobal('fetch', fetchMock)

    await getEncryptionStatus('session-token')
    await unlockFloccusEncryption('session-token', 'same passphrase as Floccus')
    await forgetFloccusPassphrase('session-token')

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method ?? 'GET'])).toEqual([
      ['/api/v1/storage/encryption', 'GET'],
      ['/api/v1/storage/encryption/unlock', 'POST'],
      ['/api/v1/storage/encryption/passphrase', 'DELETE'],
    ])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ passphrase: 'same passphrase as Floccus' })
  })


  it('preserves API status codes for actionable errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ code: 'locked', message: '同步中' }, 423))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getTrash('session-token')).rejects.toMatchObject({ status: 423, code: 'locked' })
  })

  it('turns a dropped development server into an actionable network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(getBookmarks('session-token')).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
      message: '开发服务连接已断开，请重新运行 pnpm dev 后点击刷新重试。',
    })
  })

  it('recognizes a Vite proxy 500 when the API process is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(undefined, 500)))

    await expect(getBookmarks('session-token')).rejects.toMatchObject({
      status: 500,
      code: 'service_unavailable',
      message: 'API 服务未连接，请查看 pnpm dev 终端中的 api 退出原因，修复后点击刷新重试。',
    })
  })

  it('calls trash, device, version, and health endpoints with the expected methods', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: 'device', clientId: 'client', name: '浏览器', deviceType: 'browser', userAgentSummary: '', lastSeenAt: '', createdAt: '', revokedAt: null }))
      .mockResolvedValueOnce(response(undefined, 204))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ removed: 0, retainedPerFile: 30 }))
      .mockResolvedValueOnce(response({ restored: true }))
      .mockResolvedValueOnce(response({ deleted: true }))
      .mockResolvedValueOnce(response({ deleted: true, count: 2, etag: 'etag-next', version: 4 }))
      .mockResolvedValueOnce(response({ restored: true }))
      .mockResolvedValueOnce(response(undefined, 204))
      .mockResolvedValueOnce(response({ removed: 1 }))
      .mockResolvedValueOnce(response({ status: 'ok', service: 'bookmark-vault-api', version: 'test' }))
    vi.stubGlobal('fetch', fetchMock)

    await getDevices('token')
    await registerDevice('token', { clientId: 'client', name: '浏览器', deviceType: 'browser' })
    await revokeDevice('token', 'device')
    await getFileVersions('token')
    await cleanupFileVersions('token')
    await restoreFileVersion('token', 'version')
    await trashBookmark('token', 'bookmark', 'etag')
    await trashBookmarks('token', ['bookmark-1', 'bookmark-2'], 'etag-next')
    await restoreTrashItem('token', 'trash', 'etag')
    await permanentlyDeleteTrashItem('token', 'trash')
    await emptyTrash('token')
    await getHealth()

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method ?? 'GET'])).toEqual([
      ['/api/v1/devices', 'GET'],
      ['/api/v1/devices/register', 'POST'],
      ['/api/v1/devices/device/revoke', 'POST'],
      ['/api/v1/storage/versions', 'GET'],
      ['/api/v1/storage/versions/cleanup', 'POST'],
      ['/api/v1/storage/versions/version/restore', 'POST'],
      ['/api/v1/bookmarks/trash', 'POST'],
      ['/api/v1/bookmarks/trash/batch', 'POST'],
      ['/api/v1/bookmarks/trash/trash/restore', 'POST'],
      ['/api/v1/bookmarks/trash/trash', 'DELETE'],
      ['/api/v1/bookmarks/trash/empty', 'POST'],
      ['/health/live', 'GET'],
    ])
    expect(JSON.parse(fetchMock.mock.calls[7][1].body)).toEqual({
      bookmarkIds: ['bookmark-1', 'bookmark-2'],
      expectedEtag: 'etag-next',
    })
  })
})
