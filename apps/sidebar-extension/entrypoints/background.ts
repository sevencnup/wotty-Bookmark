import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

const TOGGLE_FLOATING_SIDEBAR_MESSAGE = 'wotty-bookmark:toggle-floating-sidebar';
const TOGGLE_FLOATING_SIDEBAR_COMMAND = 'open-sidebar-for-debug';

async function toggleFloatingSidebar(tabId: number | undefined) {
  if (tabId == null) return;

  try {
    await browser.tabs.sendMessage(tabId, { type: TOGGLE_FLOATING_SIDEBAR_MESSAGE });
  } catch {
    // Browser-internal pages and tabs that have not loaded the content script cannot host the overlay.
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
