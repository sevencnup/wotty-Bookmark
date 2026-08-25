export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  children?: BookmarkNode[];
}

export interface BookmarkCreateDetails {
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
}

export interface BookmarkUpdateDetails {
  title?: string;
  url?: string;
}

interface BookmarkListener {
  addListener(listener: (...args: any[]) => void): void;
  removeListener(listener: (...args: any[]) => void): void;
}

interface BookmarkApi {
  getTree(): Promise<BookmarkNode[]>;
  create(details: BookmarkCreateDetails): Promise<BookmarkNode>;
  update(id: string, changes: BookmarkUpdateDetails): Promise<BookmarkNode>;
  move(id: string, destination: { parentId?: string; index?: number }): Promise<BookmarkNode>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
  onCreated: BookmarkListener;
  onChanged: BookmarkListener;
  onMoved: BookmarkListener;
  onRemoved: BookmarkListener;
}

interface TabsApi {
  query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ title?: string; url?: string }>>;
  create(details: { url: string }): Promise<unknown>;
  onActivated?: BookmarkListener;
}

interface BrowserGlobals {
  browser?: { bookmarks?: BookmarkApi; tabs?: TabsApi };
  chrome?: { bookmarks?: BookmarkApi; tabs?: TabsApi };
}

function getGlobals(): BrowserGlobals {
  return globalThis as unknown as BrowserGlobals;
}

export function getBookmarksApi(): BookmarkApi {
  const globals = getGlobals();
  const api = globals.browser?.bookmarks ?? globals.chrome?.bookmarks;

  if (!api) {
    throw new Error('Bookmarks API is not available in this browser context.');
  }

  return api;
}

export async function getBookmarkTree(): Promise<BookmarkNode[]> {
  return getBookmarksApi().getTree();
}

export async function getActiveTab(): Promise<{ title: string; url: string } | null> {
  const globals = getGlobals();
  const tabs = globals.browser?.tabs ?? globals.chrome?.tabs;

  if (!tabs) {
    return null;
  }

  const [tab] = await tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || /^(chrome|edge|about|brave|opera):/i.test(tab.url)) {
    return null;
  }

  return {
    title: tab.title?.trim() || tab.url,
    url: tab.url,
  };
}

export async function openBookmark(url: string): Promise<void> {
  const globals = getGlobals();
  const tabs = globals.browser?.tabs ?? globals.chrome?.tabs;
  if (!tabs) {
    throw new Error('Tabs API is not available in this browser context.');
  }
  await tabs.create({ url });
}

export function getTabsApi(): TabsApi | undefined {
  const globals = getGlobals();
  return globals.browser?.tabs ?? globals.chrome?.tabs;
}
