import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import BoldCrosshair from './BoldCrosshair';
import { pushLayer } from './layers';
import { useBackCloses } from './panelHistory';
import './blocks.css';
import './frame.css';

// The frame and the menu (25 Nov design reference, "Frame and menu";
// example-pages-25nov.html; polish 1, rules 18 to 21). One part for the
// client portal and the coach portal alike.
//
// Laptop (from 1024px): the portal sits in one rounded panel with the page
// background as a margin all round. The panel is at least the window's
// height and grows with a long page, the whole page scrolling as one; the
// menu column stays in view. The menu shares the page's background and is
// divided from the content by a hairline the panel's full height.
//
// The menu: the crosshair at the top; items in plain words, grey, the page
// you're on in the text colour at 500, no shading and no bar; groups
// separated by gaps, not names; the foot holds My Account (Settings for
// coaches), Sign out (a real button) and a small Privacy. Every item is a
// real link (it opens in a new tab with a modifier or the middle button).
//
// Phone (under 1024px): edge to edge. The header holds the crosshair, which
// opens the menu, and My Mission when it's switched on (a 40px box with a
// thin line, DesignHeader's part). A page without DesignHeader gets the
// frame's own header with the crosshair alone.
//
// Focus mode (rule 21): inside a tool the menu goes. A tool asks with
// useFocusMode(true) (ToolFrame does), and the menu column and the phone
// header step back; the guided tools cover the page by themselves.

export const FrameContext = createContext({ inFrame: false, menuOpen: false, openMenu: () => {}, closeMenu: () => {} });

/** Inside the frame? And the phone menu's opener, for DesignHeader's crosshair. */
export function useFrame() {
  return useContext(FrameContext);
}

// Focus mode: several askers share one count, as the phone bar's.
let focusing = 0;
const focusListeners = new Set();
const focusEmit = () => focusListeners.forEach((fn) => fn());
function focusSubscribe(fn) { focusListeners.add(fn); return () => focusListeners.delete(fn); }

/** Hides the menu column and the phone header while `on` is true (a tool's steps). */
export function useFocusMode(on = true) {
  useEffect(() => {
    if (!on) return undefined;
    focusing += 1;
    focusEmit();
    return () => { focusing = Math.max(0, focusing - 1); focusEmit(); };
  }, [on]);
}

/**
 * My Mission's room on a laptop (UI tester F12): the box and Chat sit at the panel's top right, out of the page's
 * flow, so an opening's first line keeps clear of them, but only when they are drawn, only where they would meet that
 * line, and only as wide as they are: `--mission-room` on each opening is how far its first line must stop short of
 * its right edge (0 when the column ends before the box, as a 520px form's does), and a title that would wrap only
 * because of the box starts under it instead (`--mission-drop`), so it stays on one line. Read again when the page or the
 * box changes size or the page's parts change.
 */
const LAPTOP = '(min-width: 1024px)';
function useMissionRoom(mainRef) {
  useEffect(() => {
    const main = mainRef.current;
    if (!main || typeof window === 'undefined') return undefined;
    const wide = window.matchMedia(LAPTOP);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const openings = main.querySelectorAll('.ds-open');
      if (!openings.length) return;
      const corner = wide.matches ? main.querySelector('.hdr-frame') : null;
      const box = corner && corner.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(main).getPropertyValue('--mission-gap')) || 24;
      const set = (el, name, px) => { const v = `${px}px`; if (el.style.getPropertyValue(name) !== v) el.style.setProperty(name, v); };
      openings.forEach((open) => {
        let room = 0;
        let drop = 0;
        const first = open.firstElementChild;
        if (box && box.width > 0 && first) {
          set(open, '--mission-room', 0);
          set(open, '--mission-drop', 0);
          const o = open.getBoundingClientRect();
          const f = first.getBoundingClientRect();
          // Only where the box is level with the first line and reaches into the opening's width.
          if (f.top < box.bottom && f.top + Math.max(f.height, 1) > box.top) {
            room = Math.max(0, Math.ceil(o.right - (box.left - gap)));
            if (room) {
              // A first line that fits the column but not beside the box starts under it instead, still on one line.
              set(open, '--mission-room', room);
              if (first.getBoundingClientRect().height > f.height + 1) {
                room = 0;
                drop = Math.ceil(box.bottom + gap / 2 - f.top);
              }
            }
          }
        }
        set(open, '--mission-room', room);
        set(open, '--mission-drop', drop);
      });
    };
    const soon = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(soon) : null;
    sizes?.observe(main);
    const watchCorner = () => { const c = main.querySelector('.hdr-frame'); if (c) sizes?.observe(c); };
    watchCorner();
    // The page's parts change (a route, a page drawn after its data): measure before the next paint.
    const parts = new MutationObserver(() => { watchCorner(); measure(); });
    parts.observe(main, { childList: true, subtree: true });
    wide.addEventListener?.('change', soon);
    return () => { if (frame) cancelAnimationFrame(frame); sizes?.disconnect(); parts.disconnect(); wide.removeEventListener?.('change', soon); };
  }, [mainRef]);
}

export function useFocusModeOn() {
  return useSyncExternalStore(focusSubscribe, () => focusing > 0, () => false);
}

function plainClick(e) {
  return !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
}

/**
 * The menu's items. `groups`: arrays of { key, name, to, current, label? }
 * shown with a gap between groups. `foot`: the same, above Sign out.
 * `onGo(item)` runs on a plain click (the router's navigate); any other
 * click is the browser's own (a new tab). `onSignOut`: Sign out, a button.
 * `privacyHref`: the small Privacy link.
 */
export function FrameMenu({ groups = [], foot = [], onGo, onSignOut, signOutBusy = false, privacyHref = '/legal/privacy', mark = true, tabIndex, label = 'Menu', id }) {
  const link = (item) => (
    <a
      key={item.key}
      href={item.to}
      className="ds-mi"
      aria-current={item.current ? 'page' : undefined}
      aria-label={item.label}
      tabIndex={tabIndex}
      onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); onGo?.(item); }}
    >
      {item.name}
      {item.count ? <span className="ds-mi-n" aria-hidden="true">{item.count}</span> : null}
    </a>
  );
  return (
    <nav className="ds-menu" aria-label={label} id={id}>
      {mark && <span className="ds-menu-mark" aria-hidden="true"><BoldCrosshair /></span>}
      {groups.filter((g) => g.length).map((g, n) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="ds-mgroup" key={n}>{g.map(link)}</div>
      ))}
      <div className="ds-mfoot">
        {foot.map(link)}
        {onSignOut && (
          <button type="button" className="ds-mi ds-mi--out" onClick={onSignOut} disabled={signOutBusy} tabIndex={tabIndex}>Sign out</button>
        )}
        <a className="ds-mlegal" href={privacyHref} tabIndex={tabIndex}>Privacy</a>
      </div>
    </nav>
  );
}

/**
 * The crosshair button that opens the phone menu; while it's open the
 * button is the thin × of two crossed lines, as focus mode's close (walk
 * item 6), never the crosshair turned.
 */
export function MenuButton({ className = '' }) {
  const { menuOpen, openMenu, closeMenu } = useFrame();
  return (
    <button
      type="button"
      className={`ds-mbtn ${className}`.trim()}
      aria-label={menuOpen ? 'Close the menu' : 'Menu'}
      aria-expanded={menuOpen}
      aria-controls="ds-phone-menu"
      onClick={menuOpen ? closeMenu : openMenu}
    >
      {menuOpen ? <span className="ds-x" aria-hidden="true" /> : <BoldCrosshair />}
    </button>
  );
}

/**
 * The frame. `menu`: the FrameMenu's props. `children`: the page. On a
 * phone the menu opens over the page from the header's crosshair; Escape,
 * the crosshair or choosing an item closes it.
 */
export default function PortalFrame({ menu, children, className = '', rootProps = {} }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const focus = useFocusModeOn();
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const ctx = useMemo(() => ({ inFrame: true, menuOpen, openMenu, closeMenu }), [menuOpen, openMenu, closeMenu]);
  const sheetRef = useRef(null);
  const mainRef = useRef(null);
  useMissionRoom(mainRef);
  // The phone's Back closes the open menu and stays on the page, as every full-screen panel does (run 6 item 4).
  useBackCloses(menuOpen, closeMenu);
  // The phone menu: Escape closes it (the top layer), the page behind doesn't scroll, and it closes at laptop width.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const remove = pushLayer(() => setMenuOpen(false));
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = 'hidden';
    const wide = window.matchMedia('(min-width: 1024px)');
    const onWide = () => { if (wide.matches) setMenuOpen(false); };
    wide.addEventListener?.('change', onWide);
    requestAnimationFrame(() => sheetRef.current?.querySelector('[aria-current="page"], a[href]')?.focus({ preventScroll: true }));
    return () => { remove(); html.style.overflow = before; wide.removeEventListener?.('change', onWide); };
  }, [menuOpen]);
  const go = (item) => { setMenuOpen(false); menu?.onGo?.(item); };
  // The phone menu's own top row (walk item 21: the coach's Search and the bell), shown first in the phone menu only;
  // on a laptop they stay at the panel's top right. Its parts close the menu themselves (useFrame().closeMenu).
  const { phoneTop, ...menuProps } = menu || {};
  const signOut = menu?.onSignOut ? () => { setMenuOpen(false); menu.onSignOut(); } : undefined;
  return (
    <FrameContext.Provider value={ctx}>
      <div {...rootProps} className={`ui-root ds-frame-root${focus ? ' ds-frame-root--focus' : ''}${phoneTop ? ' ds-frame-root--ptop' : ''} ${className}`.trim()}>
        <div className="ds-frame">
          <aside className="ds-frame-side" aria-label="Menu column">
            <FrameMenu {...menuProps} />
          </aside>
          <div className="ds-frame-main" ref={mainRef}>
            <header className="ds-frame-phead">
              <MenuButton />
            </header>
            {children}
          </div>
        </div>
        {menuOpen && (
          <div className="ds-pmenu" id="ds-phone-menu" ref={sheetRef}>
            <div className="ds-pmenu-head">
              <MenuButton />
            </div>
            {phoneTop && <div className="ds-pmenu-top">{phoneTop}</div>}
            <FrameMenu {...menuProps} mark={false} onGo={go} onSignOut={signOut} label="Menu" />
          </div>
        )}
      </div>
    </FrameContext.Provider>
  );
}
