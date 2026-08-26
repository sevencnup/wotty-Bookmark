export function getSiteFaviconUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return new URL('/favicon.ico', parsed.origin).toString()
  } catch {
    return null
  }
}
