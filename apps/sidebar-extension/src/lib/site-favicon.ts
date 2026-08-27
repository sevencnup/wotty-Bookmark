export type SiteFaviconAsset =
  | { kind: 'image'; source: string }
  | { kind: 'svg'; source: string }

export function getSiteFaviconUrls(url: string): string[] {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return []
    return [
      new URL('/favicon.ico', parsed.origin).toString(),
      new URL('/favicon.svg', parsed.origin).toString(),
      new URL('/favicon.png', parsed.origin).toString(),
      new URL('/favicon-32x32.png', parsed.origin).toString(),
      new URL('/favicon-16x16.png', parsed.origin).toString(),
      new URL('/apple-touch-icon.png', parsed.origin).toString(),
      new URL('/apple-touch-icon-precomposed.png', parsed.origin).toString(),
    ]
  } catch {
    return []
  }
}

export function getSiteFaviconUrl(url: string): string | null {
  return getSiteFaviconUrls(url).find((candidate) => candidate.startsWith('http')) ?? null
}

const faviconDiscoveryCache = new Map<string, Promise<string[]>>();
const faviconAssetCache = new Map<string, Promise<SiteFaviconAsset | null>>();

export async function loadSiteFavicon(url: string): Promise<SiteFaviconAsset | null> {
  const cached = faviconAssetCache.get(url);
  if (cached) return cached;
  const loading = fetchSiteFaviconAsset(url);
  faviconAssetCache.set(url, loading);
  return loading;
}

async function fetchSiteFaviconAsset(url: string): Promise<SiteFaviconAsset | null> {
  const candidates = [
    ...(await discoverSiteFaviconUrls(url)),
    ...getSiteFaviconUrls(url),
  ];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate, { credentials: 'omit' });
      if (!response.ok) continue;
      const type = response.headers.get('content-type')?.split(';')[0]?.toLowerCase()
      const blob = await response.blob()
      if (type === 'image/svg+xml' || candidate.toLowerCase().split('?')[0]?.endsWith('.svg')) {
        const svg = sanitizeSvg(await blob.text());
        if (svg) return { kind: 'svg', source: svg };
        continue;
      }
      if (!type?.startsWith('image/')) continue;
      const source = await blobToDataUrl(blob);
      if (source) return { kind: 'image', source };
    } catch {
      continue;
    }
  }
  return null;
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function sanitizeSvg(value: string): string | null {
  const document = new DOMParser().parseFromString(value, 'image/svg+xml');
  const svg = document.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg' || document.querySelector('parsererror')) return null;
  document.querySelectorAll('script, style, a, foreignObject, iframe, object, embed, image, link, use').forEach((node) => node.remove());
  document.querySelectorAll('*').forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      if (/^on/i.test(attribute.name) || /url\s*\(/i.test(attribute.value)) node.removeAttribute(attribute.name);
    });
  });
  return svg.outerHTML;
}

export async function discoverSiteFaviconUrls(url: string): Promise<string[]> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return []
    const cached = faviconDiscoveryCache.get(parsed.origin)
    if (cached) return cached
    const discovery = fetchSiteFaviconUrls(url)
    faviconDiscoveryCache.set(parsed.origin, discovery)
    return discovery
  } catch {
    return []
  }
}

async function fetchSiteFaviconUrls(url: string): Promise<string[]> {
  try {
    const response = await fetch(url, { credentials: 'omit' })
    if (!response.ok) return []
    const html = await response.text()
    const document = new DOMParser().parseFromString(html, 'text/html')
    const baseUrl = response.url || url
    return Array.from(document.querySelectorAll<HTMLLinkElement>('link[href]'))
      .filter((link) => /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(link.rel))
      .map((link) => {
        try {
          const candidate = new URL(link.getAttribute('href') || '', baseUrl)
          return candidate.protocol === 'http:' || candidate.protocol === 'https:' ? candidate.toString() : null
        } catch {
          return null
        }
      })
      .filter((candidate): candidate is string => Boolean(candidate))
  } catch {
    return []
  }
}
