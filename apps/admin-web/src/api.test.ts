import { afterEach, describe, expect, it, vi } from 'vitest'
import { login, register, revokeAppPassword } from './api'

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

  it('accepts an empty 204 revoke response and sends the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(undefined, 204))
    vi.stubGlobal('fetch', fetchMock)

    await revokeAppPassword('session-token', 'app-password-id')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/app-passwords/app-password-id',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.any(Headers),
      }),
    )
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit
    expect(new Headers(requestInit.headers).get('authorization')).toBe('Bearer session-token')
  })
})
