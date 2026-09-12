import { describe, expect, it } from 'vitest'
import { getLibraryFaviconCandidates } from './library-favicon'

describe('library favicon fallback candidates', () => {
  it('builds first-party paths and a hosted fallback per origin', () => {
    expect(getLibraryFaviconCandidates('https://www.example.com/docs/page')).toEqual([
      'https://www.example.com/favicon.ico',
      'https://www.example.com/favicon.svg',
      'https://www.example.com/favicon.png',
      'https://www.example.com/favicon-32x32.png',
      'https://www.example.com/favicon-16x16.png',
      'https://www.example.com/apple-touch-icon.png',
      'https://www.example.com/apple-touch-icon-precomposed.png',
      'https://icons.duckduckgo.com/ip3/example.com.ico',
      'https://www.google.com/s2/favicons?domain=example.com&sz=64',
      'https://favicon.im/example.com',
      'https://icon.horse/icon/example.com',
    ])
  })

  it('ignores unsupported bookmark schemes', () => {
    expect(getLibraryFaviconCandidates('chrome://settings')).toEqual([])
    expect(getLibraryFaviconCandidates('not a url')).toEqual([])
  })
})
