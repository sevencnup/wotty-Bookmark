const FALLBACK_STORAGE_KEY = 'wotty.admin.library-favicon-fallback.v1'
const memoryCache = new Map<string, string>()

function originKey(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}

function readStorage(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const value = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) ?? '{}') as unknown
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'))
  } catch {
    return {}
  }
}

function writeStorage(value: Record<string, string>) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(value)) } catch { /* optional cache */ }
}

export function getCachedLibraryFavicon(value: string): string | null {
  const key = originKey(value)
  if (!key) return null
  const memory = memoryCache.get(key)
  if (memory) return memory
  const stored = readStorage()[key]
  if (stored) memoryCache.set(key, stored)
  return stored ?? null
}

export function rememberLibraryFavicon(value: string, faviconUrl: string) {
  const key = originKey(value)
  if (!key || !faviconUrl) return
  memoryCache.set(key, faviconUrl)
  const stored = readStorage()
  stored[key] = faviconUrl
  writeStorage(stored)
}

export function forgetLibraryFavicon(value: string, faviconUrl?: string) {
  const key = originKey(value)
  if (!key) return
  if (!faviconUrl || memoryCache.get(key) === faviconUrl) memoryCache.delete(key)
  const stored = readStorage()
  if (!faviconUrl || stored[key] === faviconUrl) {
    delete stored[key]
    writeStorage(stored)
  }
}

/** Candidate paths are first-party-first; the hosted fallback covers non-standard sites. */
export function getLibraryFaviconCandidates(value: string): string[] {
  const key = originKey(value)
  if (!key) return []
  let hostname = ''
  try { hostname = new URL(key).hostname.replace(/^www\./i, '') } catch { return [] }
  const paths = [
    '/favicon.ico',
    '/favicon.svg',
    '/favicon.png',
    '/favicon-32x32.png',
    '/favicon-16x16.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
  ]
  return [
    ...paths.map((path) => key + path),
    'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(hostname) + '.ico',
    'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(hostname) + '&sz=64',
    'https://favicon.im/' + encodeURIComponent(hostname),
    'https://icon.horse/icon/' + encodeURIComponent(hostname),
  ]
}
