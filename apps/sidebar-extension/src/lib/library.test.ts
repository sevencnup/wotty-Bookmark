import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLibraryBookmark, getLibrary, moveLibraryNode } from './library';
import { loadSidebarLocale, refreshSidebarLocale } from './preferences';

const storage = new Map<string, unknown>();

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storage.get(key) })),
        set: vi.fn(async (values: Record<string, unknown>) => { Object.entries(values).forEach(([key, value]) => storage.set(key, value)); }),
      },
    },
  },
}));

const connection = { serverUrl: 'https://bookmarks.example.com', token: 'sidebar-token', loginIdentifier: 'me', connectedAt: '2026-09-12T00:00:00Z' };

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(payload) } as unknown as Response;
}

describe('server library client', () => {
  afterEach(() => { vi.unstubAllGlobals(); storage.clear(); });

  it('uses the authenticated server library routes, not browser bookmark APIs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ folders: [], bookmarks: [] }))
      .mockResolvedValueOnce(response({ node: {} }))
      .mockResolvedValueOnce(response({ moved: true }));
    vi.stubGlobal('fetch', fetchMock);

    await getLibrary(connection);
    await createLibraryBookmark(connection, { title: 'Example', url: 'https://example.com', parentId: 'folder-1' });
    await moveLibraryNode(connection, 'node/one', null);

    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method ?? 'GET'])).toEqual([
      ['https://bookmarks.example.com/api/v1/library', 'GET'],
      ['https://bookmarks.example.com/api/v1/library/bookmarks', 'POST'],
      ['https://bookmarks.example.com/api/v1/library/nodes/node%2Fone/move', 'POST'],
    ]);
    const bookmarkRequest = fetchMock.mock.calls[1];
    expect(bookmarkRequest).toBeDefined();
    expect(new Headers(bookmarkRequest![1].headers).get('authorization')).toBe('Bearer sidebar-token');
    expect(JSON.parse(bookmarkRequest![1].body as string)).toEqual({ title: 'Example', url: 'https://example.com', parentId: 'folder-1' });
  });

  it('loads and caches the account language using the sidebar bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ language: 'en' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadSidebarLocale()).resolves.toBe('zh-CN');
    await expect(refreshSidebarLocale(connection)).resolves.toBe('en');
    await expect(loadSidebarLocale()).resolves.toBe('en');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bookmarks.example.com/api/v1/preferences',
      { headers: { authorization: 'Bearer sidebar-token' } },
    );
  });
});
