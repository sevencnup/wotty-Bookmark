import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

const TOGGLE_FLOATING_SIDEBAR_MESSAGE = 'wotty-bookmark:toggle-floating-sidebar';
const TOGGLE_FLOATING_SIDEBAR_COMMAND = 'open-sidebar-for-debug';
const FLOATING_SIDEBAR_SCRIPT = '/content-scripts/floating-sidebar.js';

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
