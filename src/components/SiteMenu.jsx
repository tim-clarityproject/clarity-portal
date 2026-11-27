import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { refreshCoachRole, roleKnown } from '../lib/coach/role';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { DesktopMenu, PhoneBar, TileMenu } from './design/Navigation';
import PortalFrame from './design/Frame';
import { usePortalPreparing } from '../lib/portalPreparing';
import { useClientPreparing } from '../lib/clientPreparing';
import { useCoachName } from './design/coachContext';
import { usePhoneBarHidden } from './design/phoneBar';
import { isNavPhone } from './design/pageLock';
import { areaOf, DESKTOP_MENU, FRAME_MENU, menuAreas, menuCurrent, menuName, PREPARING_MENU, PRIVACY_PATH, TOOLS } from '../lib/navigation';
import { usePins } from '../lib/menuPins';
import { SignOutLink, useSignOut } from './SignOut';
import DesignHeader from './DesignHeader';
import Preparing from '../pages/Preparing';

// The portal's menus, wired to the app: the desktop's slim panel (option
// A, Tim, 9 Nov) and the phone's tile menu (mock-up M3; Phase 4 step 1),
// with the place someone is in marked, their pinned tools, and on the
// phone Log today and Breathe. The parts themselves are in src/components/design
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
  // The desktop menu's rows (option A), with the one someone is on marked.
  const row = menuCurrent(location.pathname);
  const desktop = useMemo(() => {
    const mark = (items) => items.map((it) => ({ ...it, current: it.key === row }));
    return { top: mark(DESKTOP_MENU.top), groups: DESKTOP_MENU.groups.map((g) => ({ ...g, items: mark(g.items) })), foot: mark(DESKTOP_MENU.foot) };
  }, [row]);
  const signOutFlow = useSignOut({ before: onClosed });
  const go = useCallback((to, state) => {
    onClosed();
    navigate(to, { replace: alreadyOn(to), ...(state ? { state } : {}) });
  }, [navigate, onClosed]);
  return {
    areas,
    desktop,
    signOutStart: signOutFlow.start,
    signOutBusy: signOutFlow.busy,
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
  const { signOutChoice } = menu;
  return (
    <>
      <DesktopMenu open={open} onClose={onClose} top={top} buttonRef={buttonRef} menu={menu.desktop} pins={menu.pins} onGo={menu.onGo} onSignOut={menu.signOutStart} signOutBusy={menu.signOutBusy} />
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
  // A page showing its own bottom button asks the bar to step back (M7).
  const stepBack = usePhoneBarHidden();

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
    <div className="ui-root ds-portal no-print" style={stepBack ? { display: 'none' } : undefined}>
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
      <TileMenu open={open} onClose={close} buttonRef={buttonRef} areas={menu.areas.filter((a) => !a.desktopOnly)} pins={menu.pins} onGo={menu.onGo} onLogToday={menu.onLogToday} onBreathe={menu.onBreathe} signOut={menu.signOut} />
      {menu.signOutChoice}
    </div>
  );
}

/**
 * The client portal's frame (25 Nov reference; polish 1, rules 18 to 21):
 * the menu column on a laptop and the crosshair's menu on a phone, round
 * every signed-in client page (ProtectedLayout). Home comes first, as the
 * example draws it; pinned tools, when there are any, are their own group
 * after Home, by their short names (walk item 7). A client whose portal is still being
 * prepared sees Home and My Account only (usePortalPreparing).
 */
// "A brand-new client" (polish 1): the menu shows Home and My Account only while the coach hasn't
// set anything up (src/lib/clientPreparing.js). Worked out here once the page has drawn, so a new
// client who opens any page first gets the two-item menu, and the first screen never waits for it.
function PreparingWatch({ userId }) {
  useClientPreparing(userId);
  return null;
}

// A client still being prepared can't open tools by typing an address (walk item 15, 27 Nov): every
// address but Home and My Account (its own pages, About, and Sign out's) shows the same "Your portal is
// still being prepared." page. Until the facts are known (the first visit on a device; after that the
// device's copy answers at once) nothing of the tool is drawn, so it can't be used for a moment.
const PREPARING_OPEN = ['/', '/welcome', '/my-account', '/edit-profile', '/about'];
export const openWhilePreparing = (pathname) => PREPARING_OPEN.some((p) => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)));

function PreparingGate({ userId, children }) {
  const { user } = useContext(AuthContext);
  const prep = useClientPreparing(userId);
  if (!prep.known) return <div className="ui-root" role="status" aria-label="Loading" />;
  if (!prep.preparing) return children;
  return (
    <div className="ui-root">
      <DesignHeader />
      <main className="plan-page" data-preparing="">
        <Preparing firstName={prep.firstName || user?.user_metadata?.first_name || ''} coachName={prep.coachName} />
      </main>
    </div>
  );
}

export function ClientFrame({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { pins: pinKeys } = usePins(user?.id);
  const preparing = usePortalPreparing();
  const row = menuCurrent(location.pathname);
  const signOutFlow = useSignOut();
  const menu = useMemo(() => {
    const source = preparing ? PREPARING_MENU : FRAME_MENU;
    const mark = (items) => items.map((it) => ({ ...it, current: it.key === row }));
    const pins = preparing ? [] : pinKeys.map((k) => ({ key: `pin-${k}`, name: menuName(k), to: TOOLS[k]?.to })).filter((p) => p.name && p.to);
    const [home, ...rest] = source.groups.map(mark);
    return {
      groups: [home, ...(pins.length ? [pins] : []), ...rest],
      foot: mark(source.foot),
      privacyHref: PRIVACY_PATH,
    };
  }, [preparing, pinKeys, row]);
  const onGo = useCallback((item) => navigate(item.to, { replace: alreadyOn(item.to) }), [navigate]);
  // Once per device, quietly: whether this person is a coach, so a client who opens a coach portal address is sent
  // Home at once (ProtectedLayout), never shown a blank page while it's asked.
  const userId = user?.id;
  useEffect(() => {
    if (!userId || roleKnown(userId)) return undefined;
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(() => refreshCoachRole(userId), { timeout: 5000 }) : window.setTimeout(() => refreshCoachRole(userId), 3000);
    return () => (typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback(idle) : window.clearTimeout(idle));
  }, [userId]);
  const [watchPreparing, setWatchPreparing] = useState(false);
  useEffect(() => {
    if (!userId) return undefined;
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(() => setWatchPreparing(true), { timeout: 3000 }) : window.setTimeout(() => setWatchPreparing(true), 1500);
    return () => (typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback(idle) : window.clearTimeout(idle));
  }, [userId]);
  return (
    <PortalFrame menu={{ ...menu, onGo, onSignOut: signOutFlow.start, signOutBusy: signOutFlow.busy }}>
      {watchPreparing && userId && <PreparingWatch key={userId} userId={userId} />}
      {userId && !openWhilePreparing(location.pathname) ? <PreparingGate key={`gate-${userId}`} userId={userId}>{children}</PreparingGate> : children}
      {signOutFlow.choice}
    </PortalFrame>
  );
}
