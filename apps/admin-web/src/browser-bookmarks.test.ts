import { describe, expect, it } from 'vitest'
import { browserBookmarksHtmlToXbel, parseBrowserBookmarksHtml } from './browser-bookmarks'

describe('browser bookmark HTML import', () => {
  it('preserves nested folders and decodes browser HTML entities', () => {
    const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>' +
      '<DT><H3>阅读 &amp; 工作</H3><DL><p>' +
      '<DT><A HREF="https://example.com?a=1&amp;b=2">示例 &amp; 首页</A>' +
      '<DT><H3>子文件夹</H3><DL><p><DT><A HREF="http://nested.test">Nested</A></DL><p>' +
      '</DL><p><DT><A HREF="javascript:alert(1)">脚本</A></DL><p>'
    const nodes = parseBrowserBookmarksHtml(html)
    expect(nodes).toEqual([
      { kind: 'folder', title: '阅读 & 工作', children: [
        { kind: 'bookmark', title: '示例 & 首页', url: 'https://example.com?a=1&b=2' },
        { kind: 'folder', title: '子文件夹', children: [{ kind: 'bookmark', title: 'Nested', url: 'http://nested.test' }] },
      ] },
    ])
    const converted = browserBookmarksHtmlToXbel(html)
    expect(converted.count).toBe(2)
    expect(converted.xbel).toContain('<folder>')
    expect(converted.xbel).toContain('https://example.com?a=1&amp;b=2')
    expect(converted.xbel).not.toContain('javascript:')
  })

  it('accepts unquoted href attributes used by some exporters', () => {
    const converted = browserBookmarksHtmlToXbel('<DL><p><DT><A HREF=https://example.com>Example</A></DL>')
    expect(converted.count).toBe(1)
    expect(converted.xbel).toContain('Example')
  })
})
