import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

export default defineBackground(() => {
  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'open-sidebar-for-debug' || tab?.id == null) {
      return;
    }

    // An extension command is a user gesture, which is required by
    // chrome.sidePanel.open. Invoke it synchronously inside the command
    // handler so Chrome preserves that gesture.
    void browser.sidePanel?.open({ tabId: tab.id });
  });
});
