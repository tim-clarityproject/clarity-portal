import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import BoldCrosshair from './BoldCrosshair';
import { pushLayer } from './layers';
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

/** The crosshair button that opens (and closes) the phone menu. */
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
      <BoldCrosshair />
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
  const signOut = menu?.onSignOut ? () => { setMenuOpen(false); menu.onSignOut(); } : undefined;
  return (
    <FrameContext.Provider value={ctx}>
      <div {...rootProps} className={`ui-root ds-frame-root${focus ? ' ds-frame-root--focus' : ''} ${className}`.trim()}>
        <div className="ds-frame">
          <aside className="ds-frame-side" aria-label="Menu column">
            <FrameMenu {...menu} />
          </aside>
          <div className="ds-frame-main">
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
            <FrameMenu {...menu} mark={false} onGo={go} onSignOut={signOut} label="Menu" />
          </div>
        )}
      </div>
    </FrameContext.Provider>
  );
}
