import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';

const HOST_ID = 'wotty-bookmark-floating-sidebar';
const TOGGLE_FLOATING_SIDEBAR_MESSAGE = 'wotty-bookmark:toggle-floating-sidebar';
const SIDEBAR_ACTIVITY_MESSAGE = 'wotty-bookmark:sidebar-activity';
const SIDEBAR_READY_MESSAGE = 'wotty-bookmark:sidebar-ready';
const AUTO_CLOSE_DELAY_MS = 5_000;
const FLOATING_SIDEBAR_WIDTH_KEY = 'bookmark-vault.floating-sidebar-width.v1';
const FLOATING_TOGGLE_POSITION_KEY = 'bookmark-vault.floating-sidebar-toggle-position.v1';
const DEFAULT_SIDEBAR_WIDTH = 390;
const MIN_SIDEBAR_WIDTH = 280;
const SIDEBAR_EDGE_RESERVE = 44;
const DEFAULT_TOGGLE_POSITION = 0.5;
const TOGGLE_HEIGHT = 34;
const TOGGLE_EDGE_INSET = 8;
const TOGGLE_DRAG_THRESHOLD = 4;

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
  --wotty-sidebar-width: min(390px, calc(100vw - 44px));
  --wotty-toggle-top: 50%;
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
  opacity: 1;
  pointer-events: none;
  transform: translateX(100%);
  visibility: hidden;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 220ms;
}

:host([data-open='true']) .panel {
  pointer-events: auto;
  transform: translateX(0);
  visibility: visible;
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), visibility 0s;
}

.panel iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #f8fafc;
}

.frame-placeholder {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 10px;
  background: #f8fafc;
  color: #475569;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.frame-placeholder-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid #bfdbfe;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: wotty-sidebar-spin 700ms linear infinite;
}

.frame-placeholder-error {
  display: none;
  max-width: 260px;
  padding: 0 18px;
  text-align: center;
}

.frame-placeholder-retry {
  display: block;
  margin: 12px auto 0;
  padding: 7px 12px;
  border: 1px solid #bfdbfe;
  border-radius: 7px;
  background: #ffffff;
  color: #1d4ed8;
  cursor: pointer;
}

.panel[data-frame-error='true'] .frame-placeholder-spinner,
.panel[data-frame-error='true'] .frame-placeholder-message {
  display: none;
}

.panel[data-frame-error='true'] .frame-placeholder-error { display: block; }
.panel[data-frame-ready='true'] .frame-placeholder { display: none; }

@keyframes wotty-sidebar-spin { to { transform: rotate(360deg); } }

.resize-handle {
  position: absolute;
  top: 0;
  right: calc(var(--wotty-sidebar-width) - 4px);
  z-index: 1;
  width: 8px;
  height: 100vh;
  height: 100dvh;
  cursor: col-resize;
  opacity: 0;
  pointer-events: none;
  touch-action: none;
  transition: opacity 160ms ease;
}

.resize-handle::after {
  position: absolute;
  top: 50%;
  left: 2px;
  width: 3px;
  height: 44px;
  border-radius: 999px;
  background: #cbd5e1;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.9), 0 1px 5px rgba(15, 23, 42, 0.16);
  content: '';
  transform: translateY(-50%);
  transition: background 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

:host([data-open='true']) .resize-handle {
  opacity: 0.6;
  pointer-events: auto;
}

.resize-handle:hover,
:host([data-resizing='true']) .resize-handle {
  opacity: 1;
}

.resize-handle:hover::after,
:host([data-resizing='true']) .resize-handle::after {
  background: #2563eb;
  box-shadow: 0 0 0 1px #ffffff, 0 2px 8px rgba(37, 99, 235, 0.38);
  transform: translateY(-50%) scaleY(1.18);
}

.resize-handle:focus-visible::after {
  background: #2563eb;
  box-shadow: 0 0 0 3px #bfdbfe;
}

.edge-toggle {
  position: absolute;
  top: var(--wotty-toggle-top);
  right: 5px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 1px solid #ffffff;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.42), 0 4px 12px rgba(15, 23, 42, 0.26);
  backdrop-filter: blur(10px);
  cursor: pointer;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  transform: translateY(-50%);
  transition: right 220ms cubic-bezier(0.16, 1, 0.3, 1), transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.edge-toggle:hover {
  background: #eff6ff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2), 0 6px 16px rgba(15, 23, 42, 0.3);
  transform: translateY(-50%) scale(1.08);
}

.edge-toggle:focus-visible {
  outline: 3px solid #93c5fd;
  outline-offset: -4px;
}

:host([data-open='true']) .edge-toggle {
  right: 5px;
  background: #eff6ff;
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.46), 0 4px 12px rgba(15, 23, 42, 0.24);
}

:host([data-positioning='true']) .edge-toggle {
  cursor: grabbing;
  transform: translateY(-50%);
  transition: none;
}

.edge-toggle img {
  display: block;
  width: 25px;
  height: 25px;
  object-fit: contain;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .panel, .resize-handle, .resize-handle::after, .edge-toggle { transition: none; }
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
    frame.inert = true;
    panel.append(frame);

    const framePlaceholder = document.createElement('div');
    framePlaceholder.className = 'frame-placeholder';
    framePlaceholder.setAttribute('role', 'status');
    framePlaceholder.innerHTML = '<span class="frame-placeholder-spinner" aria-hidden="true"></span><span class="frame-placeholder-message">正在加载书签侧栏…</span><span class="frame-placeholder-error">侧栏暂时无法加载。<button class="frame-placeholder-retry" type="button">重新加载</button></span>';
    panel.append(framePlaceholder);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.setAttribute('aria-hidden', 'true');
    resizeHandle.setAttribute('aria-label', '调整书签侧栏宽度');
    resizeHandle.setAttribute('aria-orientation', 'vertical');
    resizeHandle.setAttribute('role', 'separator');
    resizeHandle.tabIndex = -1;
    resizeHandle.title = '拖动调整侧栏宽度；双击恢复默认宽度';

    const toggle = document.createElement('button');
    toggle.className = 'edge-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', panel.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', '展开书签侧栏；可上下拖动调整位置');
    toggle.title = '展开书签侧栏；可上下拖动调整位置';
    const toggleIcon = document.createElement('img');
    toggleIcon.alt = '';
    toggleIcon.src = browser.runtime.getURL('/logo.webp');
    toggle.append(toggleIcon);

    shadow.append(style, panel, resizeHandle, toggle);
    document.documentElement.append(host);

    let isOpen = false;
    let frameReady = false;
    let frameReadyTimer: number | undefined;
    let frameLoadAttempt = 0;
    const frameUrl = browser.runtime.getURL('/sidebar-frame.html');
    let autoCloseTimer: number | undefined;
    let preferredSidebarWidth = DEFAULT_SIDEBAR_WIDTH;
    let resizePointerId: number | undefined;
    let preferredTogglePosition = DEFAULT_TOGGLE_POSITION;
    let togglePointerId: number | undefined;
    let toggleStartClientY = 0;
    let isPositioningToggle = false;
    let suppressToggleClick = false;

    const getSidebarWidthBounds = () => {
      const max = Math.max(1, window.innerWidth - SIDEBAR_EDGE_RESERVE);
      return { min: Math.min(MIN_SIDEBAR_WIDTH, max), max };
    };
    const constrainSidebarWidth = (value: number) => {
      const { min, max } = getSidebarWidthBounds();
      return Math.min(max, Math.max(min, Math.round(value)));
    };
    const applySidebarWidth = () => {
      const width = constrainSidebarWidth(preferredSidebarWidth);
      host.style.setProperty('--wotty-sidebar-width', `${width}px`);
      const { min, max } = getSidebarWidthBounds();
      resizeHandle.setAttribute('aria-valuemin', String(min));
      resizeHandle.setAttribute('aria-valuemax', String(max));
      resizeHandle.setAttribute('aria-valuenow', String(width));
    };
    const saveSidebarWidth = () => {
      void browser.storage.local.set({ [FLOATING_SIDEBAR_WIDTH_KEY]: preferredSidebarWidth }).catch(() => undefined);
    };
    const setSidebarWidth = (width: number, persist = false) => {
      preferredSidebarWidth = constrainSidebarWidth(width);
      applySidebarWidth();
      if (persist) saveSidebarWidth();
    };
    const getTogglePositionBounds = () => {
      const halfHeight = TOGGLE_HEIGHT / 2;
      const minY = Math.min(window.innerHeight / 2, halfHeight + TOGGLE_EDGE_INSET);
      const maxY = Math.max(minY, window.innerHeight - halfHeight - TOGGLE_EDGE_INSET);
      return { min: minY / Math.max(1, window.innerHeight), max: maxY / Math.max(1, window.innerHeight) };
    };
    const constrainTogglePosition = (value: number) => {
      const { min, max } = getTogglePositionBounds();
      return Math.min(max, Math.max(min, value));
    };
    const applyTogglePosition = () => {
      const position = constrainTogglePosition(preferredTogglePosition);
      host.style.setProperty('--wotty-toggle-top', `${position * 100}%`);
    };
    const setTogglePosition = (position: number, persist = false) => {
      preferredTogglePosition = constrainTogglePosition(position);
      applyTogglePosition();
      if (persist) void browser.storage.local.set({ [FLOATING_TOGGLE_POSITION_KEY]: preferredTogglePosition }).catch(() => undefined);
    };

    applySidebarWidth();
    void browser.storage.local.get(FLOATING_SIDEBAR_WIDTH_KEY).then((values) => {
      const savedWidth = values[FLOATING_SIDEBAR_WIDTH_KEY];
      if (typeof savedWidth === 'number' && Number.isFinite(savedWidth)) preferredSidebarWidth = savedWidth;
      applySidebarWidth();
    }).catch(() => undefined);
    applyTogglePosition();
    void browser.storage.local.get(FLOATING_TOGGLE_POSITION_KEY).then((values) => {
      const savedPosition = values[FLOATING_TOGGLE_POSITION_KEY];
      if (typeof savedPosition === 'number' && Number.isFinite(savedPosition)) preferredTogglePosition = savedPosition;
      applyTogglePosition();
    }).catch(() => undefined);

    const resetAutoCloseTimer = () => {
      window.clearTimeout(autoCloseTimer);
      if (!isOpen) return;
      autoCloseTimer = window.setTimeout(() => setOpen(false, document.activeElement === host), AUTO_CLOSE_DELAY_MS);
    };

    const setOpen = (open: boolean, returnFocus = true) => {
      isOpen = open;
      window.clearTimeout(autoCloseTimer);
      host.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '收起书签侧栏；可上下拖动调整位置' : '展开书签侧栏；可上下拖动调整位置');
      toggle.title = open ? '收起书签侧栏；可上下拖动调整位置' : '展开书签侧栏；可上下拖动调整位置';
      panel.setAttribute('aria-hidden', String(!open));
      frame.inert = !open;
      resizeHandle.setAttribute('aria-hidden', String(!open));
      resizeHandle.tabIndex = open ? 0 : -1;

      if (open) resetAutoCloseTimer();
      else if (returnFocus) toggle.focus({ preventScroll: true });
    };

    const toggleOpen = () => setOpen(!isOpen);
    const onRuntimeMessage = (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === TOGGLE_FLOATING_SIDEBAR_MESSAGE) {
        toggleOpen();
      }
    };
    const onSidebarActivity = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.contentWindow) return;
      if (typeof event.data !== 'object' || event.data === null || !('type' in event.data)) return;
      if (event.data.type === SIDEBAR_READY_MESSAGE) {
        frameReady = true;
        window.clearTimeout(frameReadyTimer);
        panel.dataset.frameReady = 'true';
        delete panel.dataset.frameError;
        return;
      }
      if (event.data.type === SIDEBAR_ACTIVITY_MESSAGE) {
        resetAutoCloseTimer();
      }
    };
    const startFrameLoad = () => {
      frameReady = false;
      delete panel.dataset.frameReady;
      delete panel.dataset.frameError;
      window.clearTimeout(frameReadyTimer);
      frameReadyTimer = window.setTimeout(() => {
        if (!frameReady) panel.dataset.frameError = 'true';
      }, 8_000);
      frame.src = `${frameUrl}?load=${++frameLoadAttempt}`;
    };
    framePlaceholder.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.frame-placeholder-retry')) startFrameLoad();
    });
    const onPageActivity = (event: Event) => {
      if (event.composedPath().includes(host)) resetAutoCloseTimer();
    };
    const onResizeStart = (event: PointerEvent) => {
      if (!isOpen || event.button !== 0) return;
      event.preventDefault();
      resizePointerId = event.pointerId;
      resizeHandle.setPointerCapture(event.pointerId);
      host.dataset.resizing = 'true';
      resetAutoCloseTimer();
    };
    const onResizeMove = (event: PointerEvent) => {
      if (resizePointerId !== event.pointerId) return;
      setSidebarWidth(window.innerWidth - event.clientX);
      resetAutoCloseTimer();
    };
    const onResizeEnd = (event: PointerEvent) => {
      if (resizePointerId !== event.pointerId) return;
      if (resizeHandle.hasPointerCapture(event.pointerId)) resizeHandle.releasePointerCapture(event.pointerId);
      resizePointerId = undefined;
      delete host.dataset.resizing;
      saveSidebarWidth();
    };
    const onResizeKeyDown = (event: KeyboardEvent) => {
      const { min, max } = getSidebarWidthBounds();
      let nextWidth: number | undefined;
      if (event.key === 'ArrowLeft') nextWidth = preferredSidebarWidth + 20;
      if (event.key === 'ArrowRight') nextWidth = preferredSidebarWidth - 20;
      if (event.key === 'Home') nextWidth = min;
      if (event.key === 'End') nextWidth = max;
      if (nextWidth === undefined) return;
      event.preventDefault();
      setSidebarWidth(nextWidth, true);
      resetAutoCloseTimer();
    };
    const onResizeDoubleClick = () => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH, true);
    const onTogglePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      togglePointerId = event.pointerId;
      toggleStartClientY = event.clientY;
      isPositioningToggle = false;
      toggle.setPointerCapture(event.pointerId);
      resetAutoCloseTimer();
    };
    const onTogglePointerMove = (event: PointerEvent) => {
      if (togglePointerId !== event.pointerId) return;
      if (!isPositioningToggle && Math.abs(event.clientY - toggleStartClientY) < TOGGLE_DRAG_THRESHOLD) return;
      isPositioningToggle = true;
      host.dataset.positioning = 'true';
      setTogglePosition(event.clientY / Math.max(1, window.innerHeight));
      resetAutoCloseTimer();
    };
    const onTogglePointerEnd = (event: PointerEvent) => {
      if (togglePointerId !== event.pointerId) return;
      if (toggle.hasPointerCapture(event.pointerId)) toggle.releasePointerCapture(event.pointerId);
      togglePointerId = undefined;
      if (isPositioningToggle) {
        setTogglePosition(preferredTogglePosition, true);
        suppressToggleClick = true;
        window.setTimeout(() => { suppressToggleClick = false; }, 0);
      }
      isPositioningToggle = false;
      delete host.dataset.positioning;
    };
    const onToggleClick = (event: MouseEvent) => {
      if (suppressToggleClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressToggleClick = false;
        return;
      }
      toggleOpen();
    };
    const onViewportResize = () => {
      applySidebarWidth();
      applyTogglePosition();
    };
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input', 'change', 'scroll'] as const;
    activityEvents.forEach((type) => window.addEventListener(type, onPageActivity, { capture: true, passive: true }));

    toggle.addEventListener('pointerdown', onTogglePointerDown);
    toggle.addEventListener('pointermove', onTogglePointerMove);
    toggle.addEventListener('pointerup', onTogglePointerEnd);
    toggle.addEventListener('pointercancel', onTogglePointerEnd);
    toggle.addEventListener('click', onToggleClick);
    resizeHandle.addEventListener('pointerdown', onResizeStart);
    resizeHandle.addEventListener('pointermove', onResizeMove);
    resizeHandle.addEventListener('pointerup', onResizeEnd);
    resizeHandle.addEventListener('pointercancel', onResizeEnd);
    resizeHandle.addEventListener('keydown', onResizeKeyDown);
    resizeHandle.addEventListener('dblclick', onResizeDoubleClick);
    browser.runtime.onMessage.addListener(onRuntimeMessage);
    window.addEventListener('message', onSidebarActivity);
    startFrameLoad();
    window.addEventListener('resize', onViewportResize);
    context.onInvalidated(() => {
      window.clearTimeout(autoCloseTimer);
      window.clearTimeout(frameReadyTimer);
      activityEvents.forEach((type) => window.removeEventListener(type, onPageActivity, true));
      toggle.removeEventListener('pointerdown', onTogglePointerDown);
      toggle.removeEventListener('pointermove', onTogglePointerMove);
      toggle.removeEventListener('pointerup', onTogglePointerEnd);
      toggle.removeEventListener('pointercancel', onTogglePointerEnd);
      toggle.removeEventListener('click', onToggleClick);
      resizeHandle.removeEventListener('pointerdown', onResizeStart);
      resizeHandle.removeEventListener('pointermove', onResizeMove);
      resizeHandle.removeEventListener('pointerup', onResizeEnd);
      resizeHandle.removeEventListener('pointercancel', onResizeEnd);
      resizeHandle.removeEventListener('keydown', onResizeKeyDown);
      resizeHandle.removeEventListener('dblclick', onResizeDoubleClick);
      window.removeEventListener('message', onSidebarActivity);
      window.removeEventListener('resize', onViewportResize);
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      host.remove();
    });
  },
});
