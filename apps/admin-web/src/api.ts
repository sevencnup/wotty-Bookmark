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

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
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
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String(payload.message)
      : `请求失败（${response.status}）`
    throw new Error(message)
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
