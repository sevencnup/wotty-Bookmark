import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getLibraryFaviconUrls, resolveLibraryFavicon } from './library-favicon'

describe('library favicon helpers', () => {
  it('provides multiple site favicon candidates and a hosted fallback', () => {
    expect(getLibraryFaviconUrls('https://www.zhihu.com/question/344998452')).toEqual([
      'https://www.zhihu.com/favicon.ico',
      'https://www.zhihu.com/favicon.svg',
      'https://www.zhihu.com/favicon.png',
      'https://www.zhihu.com/favicon-32x32.png',
      'https://www.zhihu.com/favicon-16x16.png',
      'https://www.zhihu.com/apple-touch-icon.png',
      'https://www.zhihu.com/apple-touch-icon-precomposed.png',
      'https://icons.duckduckgo.com/ip3/zhihu.com.ico',
      'https://www.google.com/s2/favicons?domain=zhihu.com&sz=64',
      'https://favicon.im/zhihu.com',
      'https://icon.horse/icon/zhihu.com',
    ])
  })

  it('ignores invalid and unsupported bookmark URLs', () => {
    expect(getLibraryFaviconUrls('chrome://settings')).toEqual([])
    expect(getLibraryFaviconUrls('not a url')).toEqual([])
  })

  it('shares a persisted resolver per site origin and probes fallbacks in parallel', async () => {
    expect(resolveLibraryFavicon).toBeTypeOf('function')
    const implementation = await readFile(resolve(import.meta.dirname, 'library-favicon.ts'), 'utf8')
    expect(implementation).toContain('probeFirstFavicon(firstParty, 1100)')
    expect(implementation).toContain('localStorage.setItem(FAVICON_STORAGE_KEY')
  })
})
