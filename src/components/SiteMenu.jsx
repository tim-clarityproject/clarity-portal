import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { DesktopMenu, PhoneBar, TileMenu, useCoachName } from './design';
import { isNavPhone } from './design/pageLock';
import { areaOf, menuAreas, TOOLS } from '../lib/navigation';
import { usePins } from '../lib/menuPins';
import { SignOutLink, useSignOut } from './SignOut';

// The portal's menus, wired to the app (mock-up M3; Phase 4 step 1): the
// areas with the one someone is in marked, their pinned tools, and Log
// today and Breathe. The parts themselves are in src/components/design
// (Navigation.jsx).
//
// Log today opens Home's own Log today (Phase 4 step 2).
export const LOG_TODAY = '/welcome#log-today';

// A second or third quick tap goes to the page the first tap already
// opened: it replaces that page instead of adding another, so Back leaves
// at once. The address is read at the tap, as the page may not have
// caught up yet.
export const alreadyOn = (to) => {
  const { pathname, search, hash } = window.location;
  return to === pathname || to === `${pathname}${search}${hash}` || to === `${pathname}${hash}`;
};

function useSiteMenu(onClosed) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const coachName = useCoachName();
  const { pins: pinKeys, refresh } = usePins(user?.id);
  const area = areaOf(location.pathname);
  const areas = useMemo(() => menuAreas(coachName).map((a) => ({ ...a, current: a.key === area })), [coachName, area]);
  const pins = useMemo(() => pinKeys.map((k) => ({ key: k, ...TOOLS[k] })), [pinKeys]);
  const signOutFlow = useSignOut({ before: onClosed });
  const go = useCallback((to, state) => {
    onClosed();
    navigate(to, { replace: alreadyOn(to), ...(state ? { state } : {}) });
  }, [navigate, onClosed]);
  return {
    areas,
    pins,
    refresh,
    onGo: (item) => go(item.to, item.state),
    onLogToday: () => go(LOG_TODAY),
    onBreathe: () => go('/breathe'),
    signOut: (tabIndex) => <SignOutLink onSignOut={signOutFlow.start} busy={signOutFlow.busy} tabIndex={tabIndex} />,
    signOutChoice: signOutFlow.choice,
  };
}

/** The desktop menu, opened by the header's bold crosshair (DesignHeader). */
export function SiteDesktopMenu({ open, onClose, top, buttonRef }) {
  const menu = useSiteMenu(onClose);
  const { refresh } = menu;
  // Fresh pins each time it opens (at most every half a minute).
  useLayoutEffect(() => { if (open) refresh(); }, [open, refresh]);
  // At phone width the phone bar's menu takes over.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onResize = () => { if (isNavPhone()) onClose(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, onClose]);
  const { signOutChoice, ...parts } = menu;
  return (
    <>
      <DesktopMenu open={open} onClose={onClose} top={top} buttonRef={buttonRef} {...parts} />
      {signOutChoice}
    </>
  );
}

/**
 * The phone bar and its menu, on every signed-in page (ProtectedLayout).
 * Measures the bar into --tabbar-height, so pages and panels that sit
 * above it (PhoneActionBar, toasts) never go under it.
 */
export function SitePhoneNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  // Open on the page it was opened on: moving to another page closes it.
  const [openOn, setOpenOn] = useState(null);
  const open = openOn === path;
  const setOpen = useCallback((v) => setOpenOn((was) => ((typeof v === 'function' ? v(was === path) : v) ? path : null)), [path]);
  const close = useCallback(() => setOpenOn(null), []);
  const menu = useSiteMenu(close);
  const { refresh } = menu;
  const barRef = useRef(null);
  const buttonRef = useRef(null);
  const current = path === '/welcome' ? 'home' : (path === '/performance-sprint' ? 'week' : null);

  useLayoutEffect(() => { if (open) refresh(); }, [open, refresh]);

  // The menu closes when the window grows to desktop width (the desktop
  // menu takes over there).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onResize = () => { if (!isNavPhone()) close(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, close]);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const measure = () => {
      document.documentElement.style.setProperty('--tabbar-height', `${el.getBoundingClientRect().height}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure);
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  const onGo = (which) => {
    close();
    const to = which === 'home' ? '/welcome' : '/performance-sprint';
    navigate(to, { replace: alreadyOn(to) });
  };

  return (
    <div className="ui-root ds-portal no-print">
      {/* Pages below the bar keep their last line clear of it (as the
          old tab bar did). */}
      <style>{`
        @media (max-width: 768px), (pointer: coarse) and (max-height: 500px) {
          body { padding-bottom: var(--tabbar-height, 86px); }
        }
      `}</style>
      <PhoneBar
        ref={barRef}
        menuButtonRef={buttonRef}
        menuOpen={open}
        onMenu={() => setOpen((o) => !o)}
        onGo={onGo}
        current={current}
      />
      <TileMenu open={open} onClose={close} buttonRef={buttonRef} {...menu} signOutChoice={undefined} areas={menu.areas.filter((a) => !a.desktopOnly)} />
      {menu.signOutChoice}
    </div>
  );
}
