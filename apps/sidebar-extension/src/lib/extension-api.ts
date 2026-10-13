const BRIDGE_REQUEST = 'wotty-bookmark:frame-api-request';
const BRIDGE_RESPONSE = 'wotty-bookmark:frame-api-response';
let requestId = 0;

export function callExtensionApi<T>(operation: string, args: unknown[] = []): Promise<T> {
  if (window.parent === window) return Promise.reject(new Error('侧栏必须在扩展页面中打开'));
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onResponse);
      reject(new Error('扩展后台响应超时，请重新加载插件'));
    }, 20_000);
    function onResponse(event: MessageEvent) {
      if (event.source !== window.parent || event.data?.type !== BRIDGE_RESPONSE || event.data?.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onResponse);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.value as T);
    }
    window.addEventListener('message', onResponse);
    window.parent.postMessage({ type: BRIDGE_REQUEST, id, operation, args }, '*');
  });
}

export const browser = {
  storage: { local: {
    get: (keys: string | string[]) => callExtensionApi<Record<string, unknown>>('storage.get', [keys]),
    set: (items: Record<string, unknown>) => callExtensionApi<void>('storage.set', [items]),
    remove: (keys: string | string[]) => callExtensionApi<void>('storage.remove', [keys]),
  } },
  runtime: { sendMessage: (message: unknown) => callExtensionApi<unknown>('runtime.sendMessage', [message]) },
  tabs: {
    query: (query: { active?: boolean; currentWindow?: boolean }) => callExtensionApi<Array<{ title?: string; url?: string }>>('tabs.query', [query]),
    create: (details: { url: string }) => callExtensionApi<unknown>('tabs.create', [details]),
  },
  bookmarks: {
    getTree: () => callExtensionApi<unknown>('bookmarks.getTree'),
    create: (details: unknown) => callExtensionApi<unknown>('bookmarks.create', [details]),
    update: (id: string, changes: unknown) => callExtensionApi<unknown>('bookmarks.update', [id, changes]),
    move: (id: string, destination: unknown) => callExtensionApi<unknown>('bookmarks.move', [id, destination]),
    removeTree: (id: string) => callExtensionApi<void>('bookmarks.removeTree', [id]),
  },
};
