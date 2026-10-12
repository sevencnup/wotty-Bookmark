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
      // Pages that were already open when the extension was installed have not
      // received the declarative script yet. Inject it on demand, then toggle.
      await injectFloatingSidebar(tabId);
      await browser.tabs.sendMessage(tabId, { type: TOGGLE_FLOATING_SIDEBAR_MESSAGE });
    } catch {
      // Browser-internal pages and restricted sites cannot host page overlays.
    }
  }
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    void toggleFloatingSidebar(tab.id);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === TOGGLE_FLOATING_SIDEBAR_COMMAND) void toggleFloatingSidebar(tab?.id);
  });
});
