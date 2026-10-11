import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';

const HOST_ID = 'wotty-bookmark-floating-sidebar';
const TOGGLE_FLOATING_SIDEBAR_MESSAGE = 'wotty-bookmark:toggle-floating-sidebar';

const styles = `
:host {
  all: initial !important;
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483647 !important;
  display: block !important;
  width: 100vw !important;
  height: 100vh !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  pointer-events: none !important;
  --wotty-sidebar-width: min(390px, calc(100vw - 24px));
}

*, *::before, *::after { box-sizing: border-box; }

.panel {
  position: absolute;
  top: 0;
  right: 0;
  width: var(--wotty-sidebar-width);
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  border-left: 1px solid #dbe4f0;
  background: #f8fafc;
  box-shadow: -14px 0 36px rgba(15, 23, 42, 0.2);
  opacity: 0;
  pointer-events: none;
  transform: translateX(100%);
  visibility: hidden;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms ease, visibility 0s linear 220ms;
}

:host([data-open='true']) .panel {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
  visibility: visible;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms ease, visibility 0s;
}

.panel iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #f8fafc;
}

.edge-toggle {
  position: absolute;
  top: 50%;
  right: 0;
  display: grid;
  width: 38px;
  height: 66px;
  place-items: center;
  padding: 0;
  border: 1px solid #1d4ed8;
  border-right: 0;
  border-radius: 10px 0 0 10px;
  color: #fff;
  background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%);
  box-shadow: 0 5px 18px rgba(15, 23, 42, 0.24);
  cursor: pointer;
  pointer-events: auto;
  transform: translateY(-50%);
  transition: right 220ms cubic-bezier(0.16, 1, 0.3, 1), background 160ms ease, box-shadow 160ms ease;
}

.edge-toggle:hover {
  background: linear-gradient(180deg, #2563eb 0%, #1e40af 100%);
  box-shadow: 0 7px 22px rgba(15, 23, 42, 0.3);
}

.edge-toggle:focus-visible {
  outline: 3px solid #93c5fd;
  outline-offset: -4px;
}

:host([data-open='true']) .edge-toggle {
  right: var(--wotty-sidebar-width);
  color: #1d4ed8;
  background: #fff;
  box-shadow: -4px 5px 16px rgba(15, 23, 42, 0.16);
}

.edge-toggle svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
  transition: transform 180ms ease;
}

:host([data-open='true']) .edge-toggle svg { transform: rotate(180deg); }

@media (prefers-reduced-motion: reduce) {
  .panel, .edge-toggle, .edge-toggle svg { transition: none; }
}
`;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main(context) {
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement('wotty-bookmark-floating-sidebar');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;border:0!important;pointer-events:none!important;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = styles;

    const panel = document.createElement('aside');
    panel.className = 'panel';
    panel.id = 'wotty-bookmark-floating-panel';
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', '书签侧栏');
    panel.setAttribute('aria-hidden', 'true');

    const frame = document.createElement('iframe');
    frame.title = '书签侧栏';
    frame.setAttribute('loading', 'eager');
    panel.append(frame);

    const toggle = document.createElement('button');
    toggle.className = 'edge-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', panel.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', '展开书签侧栏');
    toggle.title = '展开书签侧栏';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg>';

    shadow.append(style, panel, toggle);
    document.documentElement.append(host);

    let isOpen = false;
    let frameLoaded = false;

    const setOpen = (open: boolean) => {
      isOpen = open;
      host.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '收起书签侧栏' : '展开书签侧栏');
      toggle.title = open ? '收起书签侧栏' : '展开书签侧栏';
      panel.setAttribute('aria-hidden', String(!open));
      frame.inert = !open;

      if (open && !frameLoaded) {
        frameLoaded = true;
        frame.src = browser.runtime.getURL('/sidebar-frame.html');
      }

      if (!open) toggle.focus({ preventScroll: true });
    };

    const toggleOpen = () => setOpen(!isOpen);
    const onRuntimeMessage = (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === TOGGLE_FLOATING_SIDEBAR_MESSAGE) {
        toggleOpen();
      }
    };

    toggle.addEventListener('click', toggleOpen);
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    context.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      host.remove();
    });
  },
});
