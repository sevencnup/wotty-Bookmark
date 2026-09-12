import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLibraryBookmark, getLibrary, moveLibraryNode } from './library';

const connection = { serverUrl: 'https://bookmarks.example.com', token: 'sidebar-token', loginIdentifier: 'me', connectedAt: '2026-09-12T00:00:00Z' };

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(payload) } as unknown as Response;
}

describe('server library client', () => {
  afterEach(() => vi.unstubAllGlobals());

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
});
