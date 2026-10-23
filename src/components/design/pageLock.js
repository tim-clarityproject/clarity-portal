// Shared by everything that covers the page (panels, pop-ups, the phone
// drop-down panel, the calendar, focus mode, a guided tool).

// The page underneath is pinned where it is (body fixed at its scroll
// position), so nothing can scroll it while something covers it,
// including code that scrolls the window to keep a typing caret in view,
// and the reader is put back exactly where they were afterwards. Nested
// covers share one lock, released when the last one closes.
let lockCount = 0;
let saved = null;

export function lockPage() {
  lockCount += 1;
  if (lockCount > 1) return;
  const html = document.documentElement;
  const { body } = document;
  const y = window.scrollY;
  saved = {
    y,
    overflow: html.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
  };
  html.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `${-y}px`;
  body.style.left = '0';
  body.style.right = '0';
  const root = document.getElementById('root');
  if (root) root.inert = true;
}

export function unlockPage() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0 || !saved) return;
  const html = document.documentElement;
  const { body } = document;
  html.style.overflow = saved.overflow;
  body.style.position = saved.position;
  body.style.top = saved.top;
  body.style.left = saved.left;
  body.style.right = saved.right;
  window.scrollTo({ top: saved.y, left: 0, behavior: 'instant' });
  saved = null;
  const root = document.getElementById('root');
  if (root) root.inert = false;
}

// Safari doesn't focus a button when it's tapped, so the opener isn't the
// focused element when something opens. The last control pressed is
// remembered here, so focus can still go back to it on close.
let lastPressed = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    lastPressed = e.target instanceof Element
      ? e.target.closest('button, a[href], input, select, textarea, [tabindex]')
      : null;
  }, true);
}

export function openerOf(active) {
  if (active && active !== document.body && active !== document.documentElement) return active;
  return lastPressed;
}

export function returnFocus(el) {
  if (el && el.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true });
}

// Phone layout: the same break as the panels and pop-ups.
export const PHONE_QUERY = '(max-width: 600px)';

export function isPhoneWidth() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches;
}

export const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Tab and Shift+Tab go round inside `container`. Every step is moved by
// hand rather than left to the browser, because Safari skips buttons in
// its own Tab order and would otherwise leave the container.
export function trapTab(e, container) {
  if (e.key !== 'Tab' || !container) return;
  e.preventDefault();
  const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement);
  let next;
  if (at === -1) next = e.shiftKey ? items.length - 1 : 0;
  else next = (at + (e.shiftKey ? -1 : 1) + items.length) % items.length;
  items[next].focus();
}
