export type BrowserBookmarkNode =
  | { kind: 'folder'; title: string; children: BrowserBookmarkNode[] }
  | { kind: 'bookmark'; title: string; url: string }

type HtmlCapture = { kind: 'folder' | 'bookmark'; title: string; url?: string }

/** Parse the Netscape Bookmark HTML format emitted by Chromium and Firefox. */
export function parseBrowserBookmarksHtml(source: string): BrowserBookmarkNode[] {
  const roots: BrowserBookmarkNode[] = []
  const contexts: BrowserBookmarkNode[][] = [roots]
  let pendingFolder: Extract<BrowserBookmarkNode, { kind: 'folder' }> | null = null
  let capture: HtmlCapture | null = null
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][\w:-]*)([^>]*)>|([^<]+)/g

  const current = () => contexts[contexts.length - 1]
  const attachPendingFolder = () => {
    if (!pendingFolder) return
    current().push(pendingFolder)
    pendingFolder = null
  }

  for (const match of source.matchAll(tokenPattern)) {
    const rawTag = match[1]
    if (!rawTag) {
      if (capture && match[3]) capture.title += decodeHtmlEntities(match[3])
      continue
    }
    const rawAttributes = match[2] ?? ''
    const isClosing = match[0].startsWith('</')
    const tag = rawTag.toLowerCase()

    if (isClosing) {
      if (tag === 'h3' && capture?.kind === 'folder') {
        pendingFolder = { kind: 'folder', title: normalizeTitle(capture.title), children: [] }
        capture = null
      } else if (tag === 'a' && capture?.kind === 'bookmark') {
        const title = normalizeTitle(capture.title)
        if (capture.url && title && isSupportedBookmarkUrl(capture.url)) {
          attachPendingFolder()
          current().push({ kind: 'bookmark', title, url: capture.url })
        }
        capture = null
      } else if (tag === 'dl' && contexts.length > 1) {
        contexts.pop()
      }
      continue
    }

    if (tag === 'h3') {
      attachPendingFolder()
      capture = { kind: 'folder', title: '' }
    } else if (tag === 'a') {
      attachPendingFolder()
      capture = { kind: 'bookmark', title: '', url: getHtmlAttribute(rawAttributes, 'href') }
    } else if (tag === 'dl') {
      if (pendingFolder) {
        const folder = pendingFolder
        current().push(folder)
        pendingFolder = null
        contexts.push(folder.children)
      }
    }
  }

  if (capture?.kind === 'folder') pendingFolder = { kind: 'folder', title: normalizeTitle(capture.title), children: [] }
  if (capture?.kind === 'bookmark' && capture.url && isSupportedBookmarkUrl(capture.url)) {
    const title = normalizeTitle(capture.title)
    if (title) {
      attachPendingFolder()
      current().push({ kind: 'bookmark', title, url: capture.url })
    }
  }
  attachPendingFolder()
  return roots
}

export function browserBookmarksHtmlToXbel(source: string): { xbel: string; count: number } {
  const nodes = parseBrowserBookmarksHtml(source)
  const count = countBookmarks(nodes)
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE xbel PUBLIC "+//IDN python.org//DTD XML Bookmark Exchange Language 1.0//EN//XML" "http://pyxml.sourceforge.net/topics/dtds/xbel.dtd">',
    '<xbel version="1.0">',
  ]
  renderNodes(nodes, lines, 1)
  lines.push('</xbel>', '')
  return { xbel: lines.join('\\n'), count }
}

function renderNodes(nodes: BrowserBookmarkNode[], lines: string[], depth: number) {
  const indent = '  '.repeat(depth)
  nodes.forEach((node) => {
    if (node.kind === 'folder') {
      lines.push(indent + '<folder>', indent + '  <title>' + escapeXml(node.title) + '</title>')
      renderNodes(node.children, lines, depth + 1)
      lines.push(indent + '</folder>')
    } else {
      lines.push(indent + '<bookmark href="' + escapeXml(node.url) + '"><title>' + escapeXml(node.title) + '</title></bookmark>')
    }
  })
}

function countBookmarks(nodes: BrowserBookmarkNode[]): number {
  return nodes.reduce((total, node) => total + (node.kind === 'bookmark' ? 1 : countBookmarks(node.children)), 0)
}

function getHtmlAttribute(attributes: string, name: string) {
  const pattern = new RegExp(name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", 'i')
  const match = attributes.match(pattern)
  return match ? decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '').trim() : undefined
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
}

function normalizeTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function isSupportedBookmarkUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
