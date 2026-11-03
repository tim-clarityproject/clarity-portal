import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import BoldCrosshair from './BoldCrosshair';
import { Button } from './Button';
import Chevron from './Chevron';
import { pushLayer } from './layers';
import { FOCUSABLE } from './pageLock';
import { prefersReducedMotion } from './timing';
import './design.css';

// The portal's navigation (mock-up M3, approved 23 Oct; Phase 4 step 1).
// The menu never lists tools: it lists the areas, each opening its hub.
//
// - DesktopMenu: the bold crosshair in the header opens it from the left,
//   under the header: Pinned (up to 3), then Home, Personal,
//   Interpersonal, Strategic and My Account, each with one grey line,
//   then Log today and Breathe at the bottom.
// - PhoneBar: Home on the left, the bold crosshair in the middle (opens
//   TileMenu and turns 45 degrees while it is open), This week on the
//   right. Icons only, each named for screen readers.
// - TileMenu: the phone menu, rising from the bottom above the bar:
//   Pinned, the four area tiles in two columns, then Log today and
//   Breathe, all within the thumb's reach.
//
// Each link is a real link (href), so it can be opened in a new tab; a
// plain click calls onGo(item) instead. The area someone is in is marked
// aria-current. Escape closes the menu (the top layer) and focus goes
// back to the button that opened it. Every edge sits inside the phone's
// safe area.

const CLOSE_MS = 250; // --dur

function goHandler(onGo, item) {
  return (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onGo?.(item);
  };
}

// The menu is put in the page closed, then shown on the next frame so it
// fades and rises in; on close it fades out, then leaves the page.
function useShown(open) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) {
      let inner;
      const frame = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(frame); cancelAnimationFrame(inner); };
    }
    const t = setTimeout(() => { setShown(false); setMounted(false); }, prefersReducedMotion() ? 0 : CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);
  return [mounted || open, shown && open];
}

// While open: Escape closes, Tab stays inside the menu and its button,
// the page behind doesn't scroll, the first link takes focus, and focus
// goes back to the button on close.
function useMenuFocus({ open, onClose, panelRef, buttonRef }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false;
        const btn = buttonRef?.current;
        if (btn?.isConnected) btn.focus({ preventScroll: true });
      }
      return undefined;
    }
    wasOpen.current = true;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.querySelector('a[href], button:not([disabled])')?.focus({ preventScroll: true });
    });
    const removeLayer = pushLayer(() => onCloseRef.current?.());
    const onKey = (e) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const stops = [buttonRef?.current, ...panelRef.current.querySelectorAll(FOCUSABLE)]
        .filter((el) => el && el.getClientRects().length > 0);
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement);
      const next = at === -1
        ? stops[e.shiftKey ? stops.length - 1 : 0]
        : stops[(at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length];
      e.preventDefault();
      next.focus();
    };
    document.addEventListener('keydown', onKey);
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      removeLayer();
      document.removeEventListener('keydown', onKey);
      html.style.overflow = before;
    };
  }, [open, panelRef, buttonRef]);
}

/** The pinned tools at the top of either menu ("Pinned", then up to 3). */
export function MenuPins({ pins = [], onGo, tabIndex }) {
  if (!pins.length) return null;
  return (
    <div className="ds-menu-pins">
      <p className="ds-menu-pins-head" id="ds-menu-pins-head">Pinned</p>
      <ul aria-labelledby="ds-menu-pins-head">
        {pins.map((p) => (
          <li key={p.key}>
            <a href={p.to} onClick={goHandler(onGo, p)} tabIndex={tabIndex}>
              <span>{p.name}</span>
              <Chevron direction="right" size="sm" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Log today (the one coral button) and Breathe, at the foot of either menu. */
export function MenuActions({ onLogToday, onBreathe, tabIndex }) {
  return (
    <div className="ds-menu-actions">
      <Button variant="primary" onClick={onLogToday} tabIndex={tabIndex}>Log today</Button>
      <Button onClick={onBreathe} tabIndex={tabIndex}>Breathe</Button>
    </div>
  );
}

/**
 * The desktop menu. `top` is where the header ends (the menu and its
 * scrim start there). `buttonRef` is the header's menu button. `inline`
 * draws it in place, for the gallery.
 */
export function DesktopMenu({ open, onClose, top = 0, areas = [], pins = [], onGo, onLogToday, onBreathe, buttonRef, id = 'site-menu', inline = false }) {
  const panelRef = useRef(null);
  const [mounted, shown] = useShown(open);
  useMenuFocus({ open: open && !inline, onClose, panelRef, buttonRef });
  if (!mounted && !inline) return null;
  const tab = open || inline ? undefined : -1;
  const body = (
    <div className={`ds-dmenu-wrap${shown || inline ? ' ds-dmenu-wrap--open' : ''}${inline ? ' ds-dmenu-wrap--inline' : ''}`} style={inline ? undefined : { '--menu-top': `${top}px` }}>
      <div className="ds-dmenu-scrim" onClick={onClose} aria-hidden="true" />
      <nav id={id} ref={panelRef} className="ds-dmenu" aria-label="Menu" inert={open || inline ? undefined : true}>
        <MenuPins pins={pins} onGo={onGo} tabIndex={tab} />
        <ul className="ds-dmenu-areas">
          {areas.map((a, i) => (
            <li key={a.key} style={{ '--i': i }}>
              <a href={a.to} className="ds-dmenu-area" aria-current={a.current ? 'page' : undefined} onClick={goHandler(onGo, a)} tabIndex={tab}>
                <span className="ds-dmenu-name">{a.name}</span>
                <Chevron direction="right" />
                <span className="ds-dmenu-line">{a.line}</span>
              </a>
            </li>
          ))}
        </ul>
        <MenuActions onLogToday={onLogToday} onBreathe={onBreathe} tabIndex={tab} />
      </nav>
    </div>
  );
  if (inline) return <div className="ds-dmenu-demo">{body}</div>;
  return createPortal(<div className="ui-root ds-portal">{body}</div>, document.body);
}

function HomeIcon() {
  return (
    <svg className="ds-bar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5" />
    </svg>
  );
}

// This week: four rising lines (M3 barsI). Both icons are M3's own
// drawings, with the one icon set's 1.5px lines at any size.
function WeekIcon() {
  return (
    <svg className="ds-bar-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 20V14M10 20V9M15 20V12M20 20V5" />
    </svg>
  );
}

/**
 * The phone bar. `homeHref` and `weekHref` are real links; onGo gets
 * 'home' or 'week' for a plain tap. The centre button opens the menu.
 */
export const PhoneBar = forwardRef(function PhoneBar(
  { menuOpen, onMenu, onGo, homeHref = '/welcome', weekHref = '/performance-sprint', current, menuId = 'site-tile-menu', menuButtonRef, className = '' },
  ref,
) {
  return (
    <nav ref={ref} className={`ds-phone-bar bottom-tab-bar ${className}`.trim()} aria-label="Main">
      <a href={homeHref} className="ds-bar-btn" aria-label="Home" aria-current={current === 'home' ? 'page' : undefined} onClick={goHandler(onGo, 'home')}>
        <HomeIcon />
      </a>
      <button
        ref={menuButtonRef}
        type="button"
        className="ds-bar-menu"
        aria-label="Menu"
        aria-expanded={!!menuOpen}
        aria-controls={menuId}
        onClick={onMenu}
      >
        <BoldCrosshair />
      </button>
      <a href={weekHref} className="ds-bar-btn" aria-label="This week" aria-current={current === 'week' ? 'page' : undefined} onClick={goHandler(onGo, 'week')}>
        <WeekIcon />
      </a>
    </nav>
  );
});

/**
 * The phone menu, above the bar. `buttonRef` is the bar's centre button.
 * `inline` draws it in place, for the gallery.
 */
export function TileMenu({ open, onClose, areas = [], pins = [], onGo, onLogToday, onBreathe, buttonRef, id = 'site-tile-menu', inline = false }) {
  const panelRef = useRef(null);
  const [mounted, shown] = useShown(open);
  useMenuFocus({ open: open && !inline, onClose, panelRef, buttonRef });
  if (!mounted && !inline) return null;
  const tab = open || inline ? undefined : -1;
  const body = (
    <div className={`ds-tmenu-wrap${shown || inline ? ' ds-tmenu-wrap--open' : ''}${inline ? ' ds-tmenu-wrap--inline' : ''}`}>
      <div className="ds-tmenu-scrim" onClick={onClose} aria-hidden="true" />
      <nav id={id} ref={panelRef} className="ds-tmenu" aria-label="Menu" inert={open || inline ? undefined : true}>
        <MenuPins pins={pins} onGo={onGo} tabIndex={tab} />
        <ul className="ds-tmenu-tiles">
          {areas.map((a, i) => (
            <li key={a.key} style={{ '--i': i }}>
              <a href={a.to} className="ds-tmenu-tile" aria-current={a.current ? 'page' : undefined} onClick={goHandler(onGo, a)} tabIndex={tab}>
                <b>{a.name}</b>
                <small>{a.line}</small>
              </a>
            </li>
          ))}
        </ul>
        <MenuActions onLogToday={onLogToday} onBreathe={onBreathe} tabIndex={tab} />
      </nav>
    </div>
  );
  if (inline) return <div className="ds-tmenu-demo">{body}</div>;
  return createPortal(<div className="ui-root ds-portal">{body}</div>, document.body);
}
