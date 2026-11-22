import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { pushLayer } from './layers';
import { pushPanelEntry } from './panelHistory';
import { isPhoneWidth, lockPage, openerOf, returnFocus, trapTab, unlockPage } from './pageLock';
import { themeProps, useThemeScope } from './themeScope';
import { PANEL_MS, POPUP_MS, prefersReducedMotion } from './timing';
import { usePanelDraft } from './usePanelDraft';
import { useHidePhoneBar } from './phoneBar';
import './design.css';

// The slide-across panel and the centred pop-up (design reference:
// Panels; decisions: "Room to type", "Phone gestures"). Both:
// - close with the rotated crosshair, Escape, or a tap outside;
// - keep keyboard focus inside while open and return it afterwards;
// - are full screen on phone, where a swipe down closes them, and so does
//   the phone's Back (a panel or pop-up adds one history entry while open);
// - render into document.body inside their own .ui-root (rule 17), with
//   the page underneath made inert and unscrollable while open;
// - dim the page underneath strongly in dark and lightly in light.

const SWIPE_CLOSE_PX = 90;

// A panel's own Cancel (or any button that only closes it) keeps its draft,
// as the cross does: useDismissPanel() gives the panel's own close, or null
// outside a panel (tidy pass item 3).
const DismissContext = createContext(null);
export function useDismissPanel() {
  return useContext(DismissContext);
}
const KIND_CLASS = { panel: 'ds-panel', popup: 'ds-popup', sheet: 'ds-choice-sheet', drop: 'ds-choice-sheet ds-drop' };
const DOUBLE_CLICK_MS = 400;

// wide: a panel wide enough for a picture (M7b's Quick guide, 780px).
// draftKey: a panel with boxes to type in keeps what was typed when it is
//   closed with its cross, Escape, a tap outside, a swipe or the phone's
//   Back, and puts it back ("Draft restored") when it opens again; its own
//   button closing it (a save) lets the draft go (tidy pass item 3;
//   src/lib/panelDraft.js). Name the thing being added or edited, e.g.
//   `todo:new` or `todo:<id>`.
function Modal({ kind, open, onClose, title, titleAside = null, children, footer, initialFocusRef, closeLabel = 'Close', wide = false, className = '', draftKey = null }) {
  const ms = kind === 'panel' ? PANEL_MS : POPUP_MS;
  const titleId = useId();
  const scope = useThemeScope();
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  // Phone or laptop form, decided when it opens and kept until it closes.
  // (A dialog first rendered already open decides it straight away.)
  const [phoneForm, setPhoneForm] = useState(() => Boolean(open) && isPhoneWidth());
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
      if (!mounted) setPhoneForm(isPhoneWidth());
      setMounted(true);
      // Reopened mid-close after a swipe: forget where the finger left it.
      if (dialogRef.current) dialogRef.current.style.transform = '';
      return undefined;
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : ms);
    return () => clearTimeout(timer);
    // `mounted` is only read to tell a fresh open from a reopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ms]);

  // Shown only once it is in the page and its closed position has been
  // laid out, so the opening slide or fade always runs (a frame timer
  // alone could fire before the first render landed).
  useLayoutEffect(() => {
    if (!open || !mounted || shown) return undefined;
    void dialogRef.current?.offsetHeight;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [open, mounted, shown]);

  const active = open && mounted;
  const draft = usePanelDraft({ draftKey, open, shown, bodyRef });
  // Every way the panel closes itself keeps its draft first.
  const dismissRef = useRef(null);
  dismissRef.current = () => {
    draft.dismiss();
    onCloseRef.current?.();
  };
  const [dismissPanel] = useState(() => () => dismissRef.current());
  // When it opened: the second click of a double click on the button that
  // opened it must not land on the scrim and close it straight away.
  const openedAtRef = useRef(0);

  // A full-screen panel on a phone covers the phone bar, which steps back
  // meanwhile, so its height no longer lifts toasts (phoneBar.js).
  useHidePhoneBar(Boolean(active) && phoneForm && kind === 'panel');

  // While open: lock the page, move focus in, and on close give it back.
  useLayoutEffect(() => {
    if (!active) return undefined;
    const returnTo = openerOf(document.activeElement);
    openedAtRef.current = performance.now();
    lockPage();
    const removeLayer = pushLayer(() => dismissRef.current());
    // Full screen on a phone: Back closes it, not the page (run 6, item 4).
    const removeEntry = phoneForm && (kind === 'panel' || kind === 'popup') ? pushPanelEntry(() => dismissRef.current()) : null;
    const target = initialFocusRef?.current || dialogRef.current;
    target?.focus({ preventScroll: true });

    // Toasts rise above the dialog's footer so they never cover its button.
    // A full-screen panel with no footer (an explanation opened from another
    // panel) takes the toasts back down, so the footer of the panel under it
    // no longer lifts them over its last link (the UI tester, 22 Nov).
    const html = document.documentElement;
    const foot = dialogRef.current?.querySelector('.ds-dialog-foot');
    const previousOffset = html.style.getPropertyValue('--ds-toast-offset');
    const ownOffset = foot ? `${foot.getBoundingClientRect().height}px` : (phoneForm && kind === 'panel' ? '0px' : null);
    if (ownOffset) html.style.setProperty('--ds-toast-offset', ownOffset);

    return () => {
      removeLayer();
      removeEntry?.();
      if (ownOffset) {
        if (previousOffset) html.style.setProperty('--ds-toast-offset', previousOffset);
        else html.style.removeProperty('--ds-toast-offset');
      }
      unlockPage();
      returnFocus(returnTo);
    };
    // initialFocusRef is read once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Phone: drag down to close. Not from inside a text box (that's for
  // selecting text), and not while the content is scrolled down.
  const onTouchStart = (e) => {
    if (!phoneForm || e.touches.length !== 1) return;
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
      dismissRef.current();
    } else {
      el.style.transform = '';
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={`ui-root ds-portal${shown ? ' ds-modal--shown' : ''}`}
      {...themeProps(scope)}
      // A second tap on a dialog that is already closing must not pull
      // focus away from the button it has just been returned to.
      onMouseDown={(e) => { if (!open) e.preventDefault(); }}
    >
      <div
        className="ds-scrim"
        aria-hidden="true"
        // While it closes, the scrim stays over the page and takes any
        // further taps of a double or triple tap, so they never land on
        // whatever was under the dialog's button (break-it tester).
        onClick={() => {
          if (!open) return;
          if (performance.now() - openedAtRef.current < DOUBLE_CLICK_MS) return;
          dismissRef.current();
        }}
      />
      <div
        ref={dialogRef}
        className={`ds-dialog ${KIND_CLASS[kind]}${wide ? ' ds-panel--wide' : ''}${phoneForm ? ' ds-dialog--phone' : ''} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        inert={!open}
        onKeyDown={(e) => trapTab(e, dialogRef.current)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {(kind === 'sheet' || kind === 'drop') && phoneForm && <span className="ds-sheet-grab" aria-hidden="true" />}
        <div className="ds-dialog-head">
          {/* titleAside: the panel's eye, beside its title (rule 29d). */}
          <h2 id={titleId} className="ds-dialog-title">{title}{titleAside && <span className="ds-page-aside">{titleAside}</span>}</h2>
          <IconButton label={closeLabel} onClick={() => dismissRef.current()} />
        </div>
        <DismissContext.Provider value={dismissPanel}>
          <div ref={bodyRef} className="ds-dialog-body">{children}</div>
          {footer && <div className="ds-dialog-foot">{footer}</div>}
        </DismissContext.Provider>
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

// A small choice panel (M4 dashboard v46): a short dialog in the middle
// of the screen on a laptop, and a panel rising from the bottom on a
// phone, with the grab bar. For a quick choice that saves at once, like
// who can see something.
export function Sheet(props) {
  return <Modal kind="sheet" {...props} />;
}

// The panel under the header's My Mission pill (M1 mpanel): on a laptop
// it drops down just below the header, centred under the pill; on a phone
// it rises from the bottom like the Sheet, near the thumb.
export function DropPanel(props) {
  return <Modal kind="drop" {...props} />;
}
