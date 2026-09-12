export function getLibraryFaviconUrls(value: string): string[] {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return []
    const hostname = parsed.hostname.replace(/^www\./i, '')
    return [
      new URL('/favicon.ico', parsed.origin).toString(),
      new URL('/favicon.svg', parsed.origin).toString(),
      new URL('/favicon.png', parsed.origin).toString(),
      new URL('/favicon-32x32.png', parsed.origin).toString(),
      new URL('/favicon-16x16.png', parsed.origin).toString(),
      new URL('/apple-touch-icon.png', parsed.origin).toString(),
      new URL('/apple-touch-icon-precomposed.png', parsed.origin).toString(),
      `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`,
      `https://favicon.im/${hostname}`,
      `https://icon.horse/icon/${hostname}`,
    ]
  } catch {
    return []
  }
}

const FAVICON_STORAGE_KEY = 'wotty.admin.library-favicons.v1'
const faviconResolutionCache = new Map<string, Promise<string | null>>()

function faviconCacheKey(value: string): string | null {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}

function readStoredFaviconUrls(): Record<string, string> {
  try {
    const raw = localStorage.getItem(FAVICON_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => typeof key === 'string' && typeof value === 'string'))
  } catch {
    return {}
  }
}

function rememberFaviconUrl(key: string, value: string) {
  try {
    const stored = readStoredFaviconUrls()
    stored[key] = value
    localStorage.setItem(FAVICON_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Local storage is an optional optimization; rendering must still work without it.
  }
}

function forgetFaviconUrl(key: string, value: string) {
  try {
    const stored = readStoredFaviconUrls()
    if (stored[key] !== value) return
    delete stored[key]
    localStorage.setItem(FAVICON_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Ignore storage failures. The in-memory resolver will continue with the next candidate.
  }
}

function probeFirstFavicon(candidates: string[], timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (candidates.length === 0) {
      resolve(null)
      return
    }
    let pending = candidates.length
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve(value)
    }
    const timeout = window.setTimeout(() => finish(null), timeoutMs)
    candidates.forEach((candidate) => {
      const image = new Image()
      image.referrerPolicy = 'no-referrer'
      image.onload = () => finish(candidate)
      image.onerror = () => {
        pending -= 1
        if (pending === 0) finish(null)
      }
      image.src = candidate
    })
  })
}

/** Resolve one usable favicon URL per origin and share the result across all rows. */
export function resolveLibraryFavicon(value: string): Promise<string | null> {
  const key = faviconCacheKey(value)
  if (!key) return Promise.resolve(null)
  const cached = faviconResolutionCache.get(key)
  if (cached) return cached
  const resolution = (async () => {
    const candidates = getLibraryFaviconUrls(value)
    const stored = readStoredFaviconUrls()[key]
    if (stored) {
      const storedResult = await probeFirstFavicon([stored], 900)
      if (storedResult) return storedResult
      forgetFaviconUrl(key, stored)
    }

    // Probe first-party paths in parallel so a missing /favicon.ico does not
    // block the rest of the list behind several serial timeouts.
    const firstParty = candidates.slice(0, 7)
    const firstPartyResult = await probeFirstFavicon(firstParty, 1100)
    if (firstPartyResult) {
      rememberFaviconUrl(key, firstPartyResult)
      return firstPartyResult
    }

    // Public favicon services are the final fallback for sites that keep their
    // icon behind a non-standard path or block direct cross-origin requests.
    const hostedFallback = candidates.slice(7)
    const hostedResult = await probeFirstFavicon(hostedFallback, 2600)
    if (hostedResult) {
      rememberFaviconUrl(key, hostedResult)
      return hostedResult
    }
    return null
  })()
  faviconResolutionCache.set(key, resolution)
  return resolution
}
