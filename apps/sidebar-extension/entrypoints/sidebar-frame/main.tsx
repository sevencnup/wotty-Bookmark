import { StrictMode } from 'react';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import '../../src/styles.css';

const SIDEBAR_ACTIVITY_MESSAGE = 'wotty-bookmark:sidebar-activity';
const SIDEBAR_READY_MESSAGE = 'wotty-bookmark:sidebar-ready';
const ACTIVITY_REPORT_INTERVAL_MS = 200;
let lastActivityReportAt = 0;

function SidebarReadySignal() {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.parent.postMessage({ type: SIDEBAR_READY_MESSAGE }, '*');
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return null;
}

const reportSidebarActivity = () => {
  const now = Date.now();
  if (now - lastActivityReportAt < ACTIVITY_REPORT_INTERVAL_MS) return;
  lastActivityReportAt = now;
  window.parent.postMessage({ type: SIDEBAR_ACTIVITY_MESSAGE }, '*');
};

['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input', 'change', 'scroll'].forEach((type) => {
  window.addEventListener(type, reportSidebarActivity, { capture: true, passive: true });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SidebarReadySignal />
    <App />
  </StrictMode>,
);
