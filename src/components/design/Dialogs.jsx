import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { PANEL_MS, POPUP_MS, prefersReducedMotion } from './timing';
import './design.css';

// The slide-across panel and the centred pop-up (design reference:
// Panels; decisions: "Room to type", "Phone gestures"). Both:
// - close with the rotated crosshair, Escape, or a tap outside;
// - keep keyboard focus inside while open and return it afterwards;
// - are full screen on phone, where a swipe down closes them;
// - render into document.body inside their own .ui-root (rule 17), with
//   the page underneath made inert and unscrollable while open.

const SWIPE_CLOSE_PX = 90;
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared across every open dialog: which one is on top (Escape closes only
// that one), and the page lock, released when the last one closes.
const openStack = [];
let lockCount = 0;
let saved = null;

// The page underneath is pinned where it is (body fixed at its scroll
// position), so nothing can scroll it while a dialog is open, including
// code that scrolls the window to keep a typing caret in view, and the
// reader is put back exactly where they were afterwards.
function lockPage() {
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

function unlockPage() {
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
// focused element when a dialog opens. The last control pressed is
// remembered here, so focus can still go back to it on close.
let lastPressed = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    lastPressed = e.target instanceof Element
      ? e.target.closest('button, a[href], input, select, textarea, [tabindex]')
      : null;
  }, true);
}

function openerOf(active) {
  if (active && active !== document.body && active !== document.documentElement) return active;
  return lastPressed;
}

function isPhoneWidth() {
  return window.matchMedia?.('(max-width: 600px)').matches;
}

function Modal({ kind, open, onClose, title, children, footer, initialFocusRef, closeLabel = 'Close' }) {
  const ms = kind === 'panel' ? PANEL_MS : POPUP_MS;
  const id = useId();
  const titleId = useId();
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const drag = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Opening: put it in the page, then show it on the next frame so it
  // slides or fades in. Closing: hide it, then take it out once its
  // motion has finished. Quick open-close-open just reverses.
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Reopened mid-close after a swipe: forget where the finger left it.
      if (dialogRef.current) dialogRef.current.style.transform = '';
      let second;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : ms);
    return () => clearTimeout(timer);
  }, [open, ms]);

  const active = open && mounted;

  // While open: lock the page, move focus in, and on close give it back.
  useLayoutEffect(() => {
    if (!active) return undefined;
    const returnTo = openerOf(document.activeElement);
    lockPage();
    openStack.push(id);
    const target = initialFocusRef?.current || dialogRef.current;
    target?.focus({ preventScroll: true });

    // Toasts rise above the dialog's footer so they never cover its button.
    const html = document.documentElement;
    const foot = dialogRef.current?.querySelector('.ds-dialog-foot');
    const previousOffset = html.style.getPropertyValue('--ds-toast-offset');
    if (foot) html.style.setProperty('--ds-toast-offset', `${foot.getBoundingClientRect().height}px`);

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === id) {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = openStack.lastIndexOf(id);
      if (at !== -1) openStack.splice(at, 1);
      if (foot) {
        if (previousOffset) html.style.setProperty('--ds-toast-offset', previousOffset);
        else html.style.removeProperty('--ds-toast-offset');
      }
      unlockPage();
      if (returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') {
        returnTo.focus({ preventScroll: true });
      }
    };
    // initialFocusRef is read once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id]);

  // Tab and Shift+Tab go round inside the dialog. Every step is moved
  // here rather than left to the browser, because Safari skips buttons
  // in its own Tab order and would otherwise leave the dialog.
  const trapTab = (e) => {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    e.preventDefault();
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement);
    let next;
    if (at === -1) next = e.shiftKey ? items.length - 1 : 0;
    else next = (at + (e.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next].focus();
  };

  // Phone: drag down to close. Not from inside a text box (that's for
  // selecting text), and not while the content is scrolled down.
  const onTouchStart = (e) => {
    if (!isPhoneWidth() || e.touches.length !== 1) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const body = bodyRef.current;
    if (body && body.contains(e.target) && body.scrollTop > 0) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };

  const onTouchMove = (e) => {
    const el = dialogRef.current;
    if (!drag.current || !el) return;
    const dy = e.touches[0].clientY - drag.current.y;
    drag.current.dy = dy;
    if (dy > 0) {
      el.classList.add('ds-dialog--dragging');
      el.style.transform = `translateY(${dy}px)`;
    } else {
      el.style.transform = '';
    }
  };

  const onTouchEnd = () => {
    const el = dialogRef.current;
    if (!drag.current || !el) return;
    const { dy } = drag.current;
    drag.current = null;
    el.classList.remove('ds-dialog--dragging');
    if (dy > SWIPE_CLOSE_PX) {
      // Carries on downwards from where the finger let go.
      el.style.transform = 'translateY(100%)';
      onCloseRef.current?.();
    } else {
      el.style.transform = '';
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={`ui-root ds-portal${shown ? ' ds-modal--shown' : ''}`}
      inert={!open}
      // A second tap on a dialog that is already closing must not pull
      // focus away from the button it has just been returned to.
      onMouseDown={(e) => { if (!open) e.preventDefault(); }}
    >
      <div className="ds-scrim" aria-hidden="true" onClick={() => onCloseRef.current?.()} />
      <div
        ref={dialogRef}
        className={`ds-dialog ${kind === 'panel' ? 'ds-panel' : 'ds-popup'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="ds-dialog-head">
          <h2 id={titleId} className="ds-dialog-title">{title}</h2>
          <IconButton label={closeLabel} onClick={() => onCloseRef.current?.()} />
        </div>
        <div ref={bodyRef} className="ds-dialog-body">{children}</div>
        {footer && <div className="ds-dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Slide-across panel: for adding or editing. Slides in from the right
// (full screen on phone): a big text box first, the choices below it.
export function SlidePanel(props) {
  return <Modal kind="panel" {...props} />;
}

// Centred pop-up: for explanations, like the Individual Performance
// System (full screen on phone).
export function Popup(props) {
  return <Modal kind="popup" {...props} />;
}
