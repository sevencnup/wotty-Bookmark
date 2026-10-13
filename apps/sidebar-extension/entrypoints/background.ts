import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

const TOGGLE_FLOATING_SIDEBAR_MESSAGE = 'wotty-bookmark:toggle-floating-sidebar';
const TOGGLE_FLOATING_SIDEBAR_COMMAND = 'open-sidebar-for-debug';
const FLOATING_SIDEBAR_SCRIPT = '/content-scripts/floating-sidebar.js';
const API_REQUEST_MESSAGE = 'wotty-bookmark:api-request';

type ApiRequestMessage = { type: typeof API_REQUEST_MESSAGE; url: string; init?: RequestInit };

async function requestApi(url: string, init?: RequestInit) {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('服务器地址仅支持 HTTP 或 HTTPS');
  const response = await fetch(parsedUrl.toString(), { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await response.text();
  return { status: response.status, body };
}

async function injectFloatingSidebar(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [FLOATING_SIDEBAR_SCRIPT],
  });
}

async function toggleFloatingSidebar(tabId: number | undefined) {
  if (tabId == null) return;

  try {
    await browser.tabs.sendMessage(tabId, { type: TOGGLE_FLOATING_SIDEBAR_MESSAGE });
  } catch {
    try {
      // A tab opened before extension installation may lack a content script.
      await injectFloatingSidebar(tabId);
      await browser.tabs.sendMessage(tabId, { type: TOGGLE_FLOATING_SIDEBAR_MESSAGE });
    } catch {
      // Browser-internal pages and restricted sites cannot host page overlays.
    }
  }
}

async function replaceFloatingSidebar(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      const host = document.getElementById('wotty-bookmark-floating-sidebar');
      if (!host) return;
      const isOpen = host.getAttribute('data-open') === 'true';
      host.remove();
      if (isOpen) document.documentElement.setAttribute('data-wotty-sidebar-restore-open', 'true');
    },
  });
  await injectFloatingSidebar(tabId);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: ApiRequestMessage) => {
    if (message?.type !== API_REQUEST_MESSAGE || typeof message.url !== 'string') return undefined;
    return requestApi(message.url, message.init).catch((error: unknown) => ({
      error: error instanceof DOMException && error.name === 'TimeoutError'
        ? '服务器请求超时，请检查服务器地址和网络后重试'
        : error instanceof Error ? error.message : '无法连接服务器',
    }));
  });

  browser.runtime.onInstalled.addListener(() => {
    void browser.tabs.query({}).then((tabs) => Promise.allSettled(
      tabs.filter((tab) => /^https?:\/\//.test(tab.url ?? '') && tab.id != null)
        .map((tab) => replaceFloatingSidebar(tab.id!)),
    )).catch(() => undefined);
  });

  browser.action.onClicked.addListener((tab) => {
    void toggleFloatingSidebar(tab.id);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === TOGGLE_FLOATING_SIDEBAR_COMMAND) void toggleFloatingSidebar(tab?.id);
  });
});
