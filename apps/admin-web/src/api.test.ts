import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupFileVersions,
  emptyTrash,
  exportStorageFile,
  getBookmarks,
  getDevices,
  getFileVersions,
  getHealth,
  getTrash,
  importStorageFile,
  login,
  moveBookmark,
  moveBookmarks,
  permanentlyDeleteTrashItem,
  register,
  registerDevice,
  restoreFileVersion,
  restoreTrashItem,
  revokeAppPassword,
  revokeDevice,
  trashBookmark,
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

  it('calls bookmark tree and move endpoints with encoded data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ status: 'ready', etag: 'etag-1', version: 2, folders: [], bookmarks: [] }))
      .mockResolvedValueOnce(response({ moved: true, count: 1, etag: 'etag-2', version: 3 }))
      .mockResolvedValueOnce(response({ moved: true, count: 2, etag: 'etag-3', version: 4 }))
    vi.stubGlobal('fetch', fetchMock)

    await getBookmarks('session-token', 'Rust docs / 中文')
    await moveBookmark('session-token', 'bookmark-1', 'folder-1', 'etag-1')
    await moveBookmarks('session-token', ['bookmark-1', 'bookmark-2'], 'folder-2', 'etag-2')

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/bookmarks?q=Rust%20docs%20%2F%20%E4%B8%AD%E6%96%87')
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer session-token')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ bookmarkId: 'bookmark-1', parentId: 'folder-1', expectedEtag: 'etag-1' })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ bookmarkIds: ['bookmark-1', 'bookmark-2'], parentId: 'folder-2', expectedEtag: 'etag-2' })
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
      ['/api/v1/bookmarks/trash/trash/restore', 'POST'],
      ['/api/v1/bookmarks/trash/trash', 'DELETE'],
      ['/api/v1/bookmarks/trash/empty', 'POST'],
      ['/health/live', 'GET'],
    ])
  })
})
