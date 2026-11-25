import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { BoldCrosshair, Button, ErrorMessage, Loading, PageHeader, SlidePanel, useHidePhoneBar, useIsPhone, useToast } from '../../components/design';
import { useOnline } from '../../lib/connection';
import { useSignOut } from '../../components/SignOut';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { useCoachRole } from '../../lib/coach/role';
import { fromTable, rowsOf, saveRows, screenKindOf, sessionsOlder, useCoachCopyShown, useCoachLoad, useCoachPartial, useCoachSomethingToShow, useCoachStore } from '../../lib/coach/store';
import { loadAdminClients, loadCoaches } from '../../lib/coach/actions';
import { takeFinanceOpening } from '../../lib/coach/earlyScreen';
import { deviceCopyAvailable, readExtra, writeExtra } from '../../lib/coach/deviceCopy';
import { callForBar, nextCallBar } from '../../lib/coach/model';
import { COACH_PAGES, coachTitle } from '../../lib/coach/navigation';
import { testCalls } from '../../lib/coach/calls';
import { barCalls, coachZoneOf } from '../../lib/coach/calendar';
// Network's people are moved across before anything that points at one (a lead's Referred by): the module says so to the
// store as it loads, so it is loaded with the frame, whichever page opens first.
import '../../lib/coach/networkData';
import { deviceZone } from '../../lib/time/index.js';
import { CoachPortalContext, InlineLink, TextLink, useCoachPortal, useGreyLines } from './parts';
import { CalSync } from './calSync';
import './coach.css';

// Clarity Coach, the coach portal (Phase 6a runs 1 and 2; mock-up M11, seq
// 77). Open only to coach accounts: anyone else is sent to their own
// Home, and the database's rules decide what each coach reads whatever a
// page shows. This file is the frame every coach page sits in: the header
// (the bold crosshair menu button, one search box, the bell), the slim
// next-call bar's slot, the menu, the phone bar, search and the bell.

// Each page shows straight away once its part has loaded, never through Suspense: React holds back what a Suspense
// boundary reveals by up to 300 ms, which held a coach's first screen up (coach first screen run; App.jsx's page() does
// the same for the client pages). The page the address opens on is asked for as soon as this file arrives (below).
function part(load) {
  let Loaded = null;
  let asked = null;
  const get = () => {
    if (!asked) {
      asked = load().then((m) => { Loaded = m.default; return m; });
      asked.catch(() => { asked = null; });
    }
    return asked;
  };
  const Lazy = lazy(get);
  function Page(props) {
    // A page whose part is still on its way draws nothing until it arrives, then itself, never through Suspense: the
    // frame now often shows before the page's part is in, and Suspense held the page back a further 300 ms after it
    // came (tidy follow-up 4, part 1). A part that won't load is handed to Suspense (Lazy), which reloads as before.
    const [Ready, setReady] = useState(() => Loaded);
    useEffect(() => {
      if (Ready) return undefined;
      let live = true;
      get().then(() => { if (live) setReady(() => Loaded); }, () => { if (live) setReady(() => Lazy); });
      return () => { live = false; };
    }, [Ready]);
    return Ready ? <Ready {...props} /> : null;
  }
  Page.preload = get;
  return Page;
}

const Today = part(() => import('./Today'));
const Clients = part(() => import('./Clients'));
const ClientPage = part(() => import('./ClientPage'));
const PastClients = part(() => import('./PastClients'));
const GroupPage = part(() => import('./GroupPage'));
const WorkshopPage = part(() => import('./WorkshopPage'));
const OrganisationPage = part(() => import('./OrganisationPage'));
const Settings = part(() => import('./Settings'));
const Todos = part(() => import('./Todos'));
const TodoListPage = part(() => import('./TodoListPage'));
const SessionPage = part(() => import('./SessionPage'));
const ClosePage = part(() => import('./ClosePage'));
const Calendar = part(() => import('./Calendar'));
const Leads = part(() => import('./Leads'));
const LeadReports = part(() => import('./LeadReports'));
const LeadPage = part(() => import('./LeadPage'));
const ColdLeads = part(() => import('./ColdLeads'));
const Automations = part(() => import('./Automations'));
const Boards = part(() => import('./Boards'));
const BoardPage = part(() => import('./BoardPage'));
const Network = part(() => import('./Network'));
const OpenForCalls = part(() => import('./OpenForCalls'));
const PollPage = part(() => import('./PollPage'));
const Finances = part(() => import('./Finances'));
const BriefPanel = lazy(() => import('./Brief').then((m) => ({ default: m.BriefPanel || m.default })));
// The menu and search (frameParts.jsx), and the automations and emails arriving (crmParts.jsx, the owner's): their own
// parts, asked for once the frame has drawn, so a first visit never waits for search's index, the CRM's code or
// Network's counts before the frame and its page show (tidy follow-up 4, part 1, item 1).
const frameParts = () => import('./frameParts');
const Menu = lazy(() => frameParts().then((m) => ({ default: m.Menu })));
const Search = lazy(() => frameParts().then((m) => ({ default: m.Search })));
const crmParts = () => import('./crmParts');
const AutomationWatch = lazy(() => crmParts().then((m) => ({ default: m.AutomationWatch })));
const EmailSync = lazy(() => crmParts().then((m) => ({ default: m.EmailSync })));

/** True once the frame has drawn (a frame, then a turn), so what can wait is asked for only then. */
function useAfterFrame() {
  const [after, setAfter] = useState(false);
  useEffect(() => {
    let timer = null;
    const frame = window.requestAnimationFrame(() => { timer = window.setTimeout(() => setAfter(true), 0); });
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, []);
  return after;
}

// The first screen's page for the address the portal opens on (Today, Clients, a client's page, the calendar or Finances).
if (typeof window !== 'undefined') {
  const opening = { today: Today, clients: Clients, client: ClientPage, calendar: Calendar, finances: Finances }[screenKindOf(window.location.pathname)];
  opening?.preload().catch(() => {});
}

const BELL = <svg className="cc-line-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /></svg>;
const HOME = <svg className="cc-line-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z" /></svg>;
const CALENDAR = <svg className="cc-line-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4" /></svg>;

const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;
const later = COACH_PAGES.filter((p) => p.later);

/** Today's day key, kept right when the day turns while the page is open. */
function useToday() {
  const [key, setKey] = useState(() => getLocalDateKey());
  useEffect(() => {
    const check = () => setKey(getLocalDateKey());
    const timer = setInterval(check, 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);
  return key;
}

/** The time now, to the half minute, for the next-call bar. */
function useNow(ms = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [ms]);
  return now;
}

/**
 * The slim next-call bar: from 10 minutes before a call until 10 minutes
 * in, coral from 5 minutes before, with Join on Zoom as a quiet link. The
 * calls are the coach's own, from their sessions and calendar items
 * (calendar.js's barCalls); the name, and "Open the brief", open a client
 * session's brief where they are. On previews only it can also be given
 * test calls (lib/coach/calls.js), for the suites.
 */
export function CallBar({ calls, now }) {
  const navigate = useNavigate();
  const [briefId, setBriefId] = useState(null);
  const [briefAsked, setBriefAsked] = useState(false);
  const call = callForBar(calls, now);
  const bar = nextCallBar(call, now);
  const brief = briefAsked ? <Suspense fallback={null}><BriefPanel sessionId={briefId} joinHref={bar?.zoom || null} onClose={() => setBriefId(null)} /></Suspense> : null;
  if (!bar) return brief;
  const open = bar.sessionId ? () => { setBriefAsked(true); setBriefId(bar.sessionId); } : (bar.briefTo ? () => navigate(bar.briefTo) : null);
  return (
    <>
      <div className={`cc-callbar${bar.coral ? ' cc-callbar--soon' : ''}`} role="status">
        <div className="cc-callbar-in">
          <span className="cc-callbar-who">{open ? <InlineLink aria-label={`${bar.name}: open the brief`} onClick={open}>{bar.name}</InlineLink> : <b>{bar.name}</b>} {bar.words}</span>
          <span className="cc-callbar-links">
            {open && <TextLink onClick={open}>Open the brief</TextLink>}
            {bar.zoom && <a className="ds-link" href={bar.zoom} target="_blank" rel="noreferrer">Join on Zoom</a>}
          </span>
        </div>
      </div>
      {brief}
    </>
  );
}

function whenWords(at, todayKey) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const p = (x) => String(x).padStart(2, '0');
  const key = getLocalDateKey(d);
  if (key === todayKey) return `Today, ${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
}

/** The bell: a side panel list, with Mark all as read. */
function Bell({ open, onClose }) {
  const { userId, notifications, todayKey, partial } = useCoachPortal();
  const navigate = useNavigate();
  const toast = useToast();
  const sorted = useMemo(() => [...notifications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [notifications]);
  const unread = useMemo(() => sorted.filter((n) => !n.read_at), [sorted]);
  const markRead = (rows, at) => saveRows(userId, rows.map((n) => ['coach_notifications', { ...n, read_at: at }])).catch(() => toast.error('That didn’t save. Check your connection and try again.'));
  const openOne = (n) => {
    if (!n.read_at) markRead([n], new Date().toISOString());
    onClose();
    const to = { workshop: `/coach/workshops/${n.item_id}`, client: `/coach/clients/${n.item_id}`, profile: '/coach/settings/you' }[n.item_kind];
    if (to && n.item_id) navigate(to);
  };
  const all = () => {
    if (!unread.length) return;
    const before = unread;
    markRead(before, new Date().toISOString());
    toast.saved({ message: 'All marked as read', long: true, onUndo: () => markRead(before, null) });
  };
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Notifications"
      footer={!partial && unread.length > 0 ? <div className="cc-panel-foot"><TextLink onClick={all}>Mark all as read</TextLink></div> : null}
    >
      {/* A first visit holds only the notifications not read yet until the rest is in: the list waits for it. */}
      {partial && <Loading label="Loading your notifications" />}
      {!partial && sorted.length === 0 && <p className="cc-quiet">Nothing new. Bookings, agreements and anything else that needs you will show here.</p>}
      {!partial && sorted.map((n) => (
        <button key={n.id} type="button" className={`cc-notice${n.read_at ? '' : ' cc-notice--new'}`} onClick={() => openOne(n)} aria-label={`${n.read_at ? '' : 'New. '}${n.title}`}>
          <span className="cc-notice-dot" aria-hidden="true" />
          <span>
            <b>{n.title}</b>
            {n.detail && <small>{n.detail}</small>}
          </span>
          <span className="cc-notice-when">{whenWords(n.created_at, todayKey)}</span>
        </button>
      ))}
    </SlidePanel>
  );
}

/** A page of a later run: shown on previews only, calmly. */
function ComingSoon({ title }) {
  return (
    <div className="cc-page">
      <div className="cc-col">
        <PageHeader title={title} />
        <p className="cc-quiet">Coming in this build. It isn’t ready to use yet.</p>
      </div>
    </div>
  );
}

// While the coach's role is asked for: the same turning crosshair and words the frame shows next, so there is never a
// plain page between the crosshair and "Loading Clarity Coach" (scale check point 3; tidy follow-up 3).
function Blank() {
  return <div className="ui-root cc-app"><main className="cc-main cc-main--first" aria-busy="true"><Loading label="Loading Clarity Coach" className="ds-loading--page" /></main></div>;
}

/** The coach's role couldn't be read (role.js's `failed`): the calm error, with Try again. */
function RoleProblem({ onRetry }) {
  const online = useOnline();
  // A way out as well as Try again: Sign out, as the menu offers (UI tester, tidy follow-up 4).
  const signOut = useSignOut({ to: '/coach/sign-in' });
  useEffect(() => { document.title = 'Clarity Coach'; }, []);
  return (
    <div className="ui-root cc-app">
      <main className="cc-main" id="cc-main">
        <div className="cc-page">
          <div className="cc-col cc-role-problem">
            <ErrorMessage>{online ? ROLE_PROBLEM : ROLE_OFFLINE}</ErrorMessage>
            <Button variant="primary" onClick={onRetry}>Try again</Button>
            <Button variant="text" onClick={signOut.start}>Sign out</Button>
          </div>
          {signOut.choice}
        </div>
      </main>
    </div>
  );
}
const ROLE_PROBLEM = 'Clarity Coach didn’t load. Check your connection and try again.';
const ROLE_OFFLINE = 'Clarity Coach needs a connection the first time it opens on this device, so try again when you’re back online.';

/**
 * The frame round every page: the header, the call bar, the page, the phone bar, the menu, search and the bell. Its
 * own state (which of the three is open) lives here, so opening one draws only this, never the page under it nor the
 * calendar's sync and the automations (scale check, 22 Nov: 0.1 s of script on a slowed phone for the owner).
 */
function Frame({ pages, calls, now, unread, hold = false, firstLoad = false }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [bell, setBell] = useState(false);
  const signOut = useSignOut({ to: '/coach/sign-in' });
  const afterFrame = useAfterFrame();
  useEffect(() => { setMenu(false); setSearch(false); }, [pathname]);
  const closeMenu = useCallback(() => setMenu(false), []);
  const closeSearch = useCallback(() => setSearch(false), []);
  const closeBell = useCallback(() => setBell(false), []);
  // On a phone every grey line under a row stays one line (tidy follow-up 3, run 6's 33).
  const mainRef = useRef(null);
  useGreyLines(mainRef, useIsPhone());
  return (
    <div className={`ui-root cc-app${hold ? ' cc-hold' : ''}`} inert={hold || undefined} aria-busy={hold || undefined}>
      <header className="cc-header">
        <div className="cc-header-in">
          <button type="button" className="cc-round cc-round--mark" aria-expanded={menu} aria-label="Open the menu" onClick={() => setMenu(true)}>
            <BoldCrosshair size={26} />
          </button>
          <button type="button" className="cc-search" aria-label="Search, or do anything" aria-haspopup="dialog" onClick={() => setSearch(true)}>
            <span>Search or do anything</span>
          </button>
          <button type="button" className="cc-round" aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} aria-haspopup="dialog" onClick={() => setBell(true)}>
            {BELL}
            {unread > 0 && <span className="cc-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
          </button>
        </div>
      </header>
      <CallBar calls={calls} now={now} />
      {/* data-first-screen: the page is drawn with its data (timed by tests/scale/trace-first.mjs and timing.mjs). */}
      <main ref={mainRef} className={`cc-main${firstLoad ? ' cc-main--first' : ''}`} id="cc-main" aria-busy={firstLoad || undefined} data-first-screen={!firstLoad && !hold ? 'ready' : undefined}>
        {firstLoad && <Loading label="Loading Clarity Coach" className="ds-loading--page" />}
        {pages}
      </main>
      <nav className="cc-phonebar" aria-label="Clarity Coach">
        <button type="button" className="cc-round" aria-label="Today" aria-current={pathname === '/coach' ? 'page' : undefined} onClick={() => { setMenu(false); navigate('/coach'); }}>{HOME}</button>
        <button type="button" className="cc-round cc-round--mark" aria-label={menu ? 'Close the menu' : 'Menu'} aria-expanded={menu} onClick={() => setMenu((v) => !v)}><BoldCrosshair size={32} /></button>
        <button type="button" className="cc-round" aria-label="Calendar" aria-current={pathname.startsWith('/coach/calendar') ? 'page' : undefined} onClick={() => { setMenu(false); navigate('/coach/calendar'); }}>{CALENDAR}</button>
      </nav>
      {/* Asked for once the frame has drawn with its page, or the moment one is opened before that. */}
      {((afterFrame && !firstLoad) || menu) && <Suspense fallback={null}><Menu open={menu} onClose={closeMenu} onSignOut={signOut.start} /></Suspense>}
      {((afterFrame && !firstLoad) || search) && <Suspense fallback={null}><Search open={search} onClose={closeSearch} /></Suspense>}
      <Bell open={bell} onClose={closeBell} />
      {signOut.choice}
    </div>
  );
}

export default function CoachApp() {
  const { user } = useContext(AuthContext);
  const role = useCoachRole();
  const userId = user?.id || null;
  const coach = role.coach;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useHidePhoneBar(true); // the client portal's own phone bar steps back here

  const state = useCoachStore(coach ? userId : null);
  const copyShown = useCoachCopyShown(coach ? userId : null);
  const somethingToShow = useCoachSomethingToShow(coach ? userId : null);
  // A first visit draws the page's own first screen before the rest of the data (store.js, 060): the kind of page
  // whose first screen alone is here, or null.
  const partial = useCoachPartial(coach ? userId : null);
  useCoachLoad(coach ? userId : null);
  const todayKey = useToday();
  const now = useNow();

  const [coaches, setCoaches] = useState([]);
  const [admin, setAdmin] = useState([]);
  // Whether the owner's list of every coach's clients is here (kept on the device, or read this visit): until it is,
  // Clients and search say they're loading rather than show the owner's own clients as everyone (coach first screen run).
  const [adminIn, setAdminIn] = useState(false);
  // Whether the coach list is here (kept on the device, or read this visit): Finances' first screen counts associates'
  // pay from it, so it waits for it (coach rule 49).
  const [coachesIn, setCoachesIn] = useState(false);
  const [turn, setTurn] = useState(0);
  const reloadCoaches = useCallback(() => setTurn((n) => n + 1), []);
  const coachId = coach?.id || null;
  const isOwner = role.isOwner;
  // The coaches and (the owner's) every coach's clients: once a visit, again when asked (reloadCoaches) and when the
  // coach's own clients come or go (a client moved). Never again for each change to a client, nor when the device's
  // copy first arrives (scale check, 22 Nov: 1,000 rows read twice on every page).
  const profileCount = Object.keys(state.rows.client_profiles || {}).length;
  const countSeen = useRef(null);
  const [countTurn, setCountTurn] = useState(0);
  useEffect(() => {
    const before = countSeen.current;
    countSeen.current = profileCount;
    if (before !== null && before !== 0 && profileCount !== 0 && before !== profileCount) setCountTurn((n) => n + 1);
  }, [profileCount]);
  // The two lists as this device last had them, shown with the device's copy and replaced by each load
  // (deviceCopy.js readExtra): a warm visit never shows "Your clients" and then "Everyone" (UI tester, scale check).
  const listsFresh = useRef({ coaches: false, admin: false });
  const [listsShown, setListsShown] = useState(() => !deviceCopyAvailable());
  useEffect(() => {
    if (!coachId || !userId) return undefined;
    let live = true;
    const enough = window.setTimeout(() => { if (live) setListsShown(true); }, 1500);
    Promise.all([readExtra(userId, 'coaches'), isOwner ? readExtra(userId, 'admin') : null]).then(([keptCoaches, keptAdmin]) => {
      if (!live) return;
      if (Array.isArray(keptCoaches) && !listsFresh.current.coaches) { setCoaches(keptCoaches); setCoachesIn(true); }
      if (Array.isArray(keptAdmin) && !listsFresh.current.admin) { setAdmin(keptAdmin); setAdminIn(true); }
      setListsShown(true);
    });
    return () => { live = false; window.clearTimeout(enough); };
  }, [userId, coachId, isOwner]);
  useEffect(() => {
    if (!coachId) return undefined;
    let live = true;
    // Finances' first screen asked for it as the app opened (earlyScreen.js): that answer, once, else read now.
    const early = takeFinanceOpening(userId, 'coachList');
    const read = early ? Promise.resolve(early).then((got) => (got && !got.error && Array.isArray(got.data) ? got.data : loadCoaches())) : loadCoaches();
    read.then((list) => {
      if (!live) return;
      listsFresh.current.coaches = true;
      setCoaches(list);
      setCoachesIn(true);
      writeExtra(userId, 'coaches', list);
    }).catch(() => { if (live) setCoachesIn(true); });
    return () => { live = false; };
  }, [coachId, turn, countTurn, userId]);
  // Every coach's clients (the owner's): with Clients' first screen, otherwise once the page has drawn with the rest.
  const whole = somethingToShow && !partial;
  const adminNow = isOwner && (whole || screenKindOf(pathname) === 'clients');
  useEffect(() => {
    if (!coachId || !adminNow) return undefined;
    let live = true;
    loadAdminClients().then((list) => {
      if (!live) return;
      listsFresh.current.admin = true;
      setAdmin(list);
      setAdminIn(true);
      writeExtra(userId, 'admin', list);
    }).catch(() => {});
    return () => { live = false; };
  }, [coachId, adminNow, turn, countTurn, userId]);

  useEffect(() => { document.title = coachTitle(pathname); }, [pathname]);

  const value = useMemo(() => {
    if (!coach) return null;
    const mine = (rows) => rows.filter((r) => r.coach_id === coach.id);
    // Each list is worked out once per change to its own table (store.js's fromTable), so a save to one table leaves
    // every other list, and the pages' own memos built on them, as they were (scale check, 22 Nov).
    const own = (table, then = null, name = '') => fromTable(state, table, `mine:${coach.id}${name}`, (rows) => (then ? then(mine(rows)) : mine(rows)));
    const all = (table, then = null, name = '') => fromTable(state, table, `all${name}`, (rows) => (then ? then(rows) : rows));
    return {
      userId, coach, isOwner, state, todayKey, coaches, coachesIn, admin, adminReady: !isOwner || adminIn, reloadCoaches, reloadRole: role.reload, partial, whole,
      clients: own('client_profiles', (rows) => rows.filter((p) => !p.merged_into), ':current'),
      groups: own('coach_groups'),
      workshops: own('workshops'),
      organisations: all('organisations'),
      tags: own('coach_tags', (rows) => rows.sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)), ':sorted'),
      fields: own('coach_fields', (rows) => rows.filter((f) => f.applies_to === 'client').sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)), ':client'),
      // A lead's own fields (049's coach_fields with applies_to 'lead'): Sector, Value, Renewal date and the coach's own.
      leadFields: own('coach_fields', (rows) => rows.filter((f) => f.applies_to === 'lead').sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)), ':lead'),
      views: own('coach_views'),
      notifications: own('coach_notifications'),
      settings: rowsOf(state, 'coach_settings').find((s) => s.coach_id === coach.id) || { coach_id: coach.id },
      // The coaching day (run 2): the coach's own to-dos, lists, days, weeks and sessions.
      todos: own('coach_todos'),
      todoLists: own('coach_todo_lists', (rows) => rows.sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)), ':sorted'),
      todoHeadings: own('coach_todo_headings', (rows) => rows.sort((a, b) => (a.position || 0) - (b.position || 0)), ':sorted'),
      days: own('coach_days'),
      weeks: own('coach_weeks'),
      sessions: own('coach_sessions'),
      sessionPeople: all('coach_session_people'),
      // 057: what the database counted of the sessions not on the device yet (null once they all are): every count of
      // sessions held takes it (day.js's withSessions), so it is whole from the first screen on.
      sessionsOlder: sessionsOlder(state),
      sessionActions: own('coach_session_actions'),
      sessionNotes: own('coach_session_notes'),
      // The calendar and booking (run 3; migration 051): the coach's own, kept on the device until 051 is there.
      calItems: own('coach_cal_items'),
      calGuests: own('coach_cal_guests'),
      callTypes: own('coach_call_types', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0) || x.name.localeCompare(y.name)), ':sorted'),
      openBlocks: own('coach_open_blocks'),
      polls: own('coach_polls'),
      pollPeople: own('coach_poll_people', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0)), ':sorted'),
      pollOptions: own('coach_poll_options'),
      pollVotes: all('coach_poll_votes'),
      bookingLinks: own('coach_booking_links'),
      bookings: own('coach_bookings'),
      leads: own('coach_leads'),
      reminderSends: own('coach_cal_reminder_sends'),
      // Your other Google calendars (run 8; migration 059): each with its switch, and the busy times of the ones switched on.
      googleCalendars: own('coach_google_calendars', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0)), ':sorted'),
      busyTimes: own('coach_busy_times'),
      // Leads, the CRM and Network's columns (run 4; migration 052): kept on the device until 052 is there. Network's
      // PEOPLE are never here: pages ask networkData.js for a page of them at a time.
      leadStages: own('coach_lead_stages', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0) || String(x.created_at || '').localeCompare(String(y.created_at || ''))), ':sorted'),
      leadEvents: own('coach_lead_events'),
      automations: own('coach_automations', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0) || String(x.created_at || '').localeCompare(String(y.created_at || ''))), ':sorted'),
      automationRuns: own('coach_automation_runs'),
      // The owner's boards; an associate is only ever handed the ones the owner has shared (read only).
      boards: all('coach_boards', (rows) => rows.filter((b) => !b.archived_at && (b.coach_id === coach.id || b.shared === true)).sort((x, y) => (x.position || 0) - (y.position || 0) || x.name.localeCompare(y.name)), ':shown'),
      boardStages: all('coach_board_stages', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0)), ':sorted'),
      boardItems: all('coach_board_items', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0)), ':sorted'),
      emails: own('coach_emails'),
      emailLinks: own('coach_email_links'),
      emailWaiting: own('coach_email_waiting'),
      emailAddresses: own('coach_email_addresses'),
      checkIns: own('client_check_ins'),
      orgDeals: all('organisation_deals'),
      orgGrowth: all('organisation_growth'),
      // Agreements, invoices and payments (Phase 6b run 1; migration 061): the coach's own agreements and versions, and
      // the invoices and payments the server writes (the owner reads every coach's, for Who needs attention).
      agreements: own('agreements'),
      agreementVersions: own('agreement_versions'),
      invoices: all('invoices'),
      payments: all('payments'),
      creditNotes: all('credit_notes'),
      invoiceReminders: all('invoice_reminders'),
      reminderPauses: own('invoice_reminder_pauses'),
      // Finances (Phase 6b run 2; migration 062): the owner's alone; an associate's store holds only their own statements.
      financeSettings: own('finance_settings', (rows) => rows[0] || null, ':one'),
      financeTargets: own('finance_targets'),
      financeSectors: own('finance_sectors', (rows) => rows.filter((r) => !r.archived).sort((x, y) => (x.position || 0) - (y.position || 0)), ':sorted'),
      outgoingGroups: own('finance_outgoing_groups', (rows) => rows.filter((r) => !r.archived).sort((x, y) => (x.position || 0) - (y.position || 0)), ':sorted'),
      outgoings: own('finance_outgoings'),
      bankChecks: own('bank_balance_checks'),
      deadlines: own('company_deadlines', (rows) => rows.sort((x, y) => String(x.due_on).localeCompare(String(y.due_on))), ':sorted'),
      packages: own('pricing_packages', (rows) => rows.filter((r) => !r.archived).sort((x, y) => (x.position || 0) - (y.position || 0)), ':sorted'),
      priceChanges: own('pricing_changes', (rows) => rows.sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || ''))), ':sorted'),
      discounts: own('discounts', (rows) => rows.filter((r) => !r.archived), ':shown'),
      purchaseOrders: own('purchase_orders'),
      statements: all('associate_statements'),
      networkColumns: own('network_columns', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0) || x.name.localeCompare(y.name)), ':sorted'),
      now,
    };
  }, [coach, isOwner, state, todayKey, coaches, coachesIn, admin, adminIn, userId, reloadCoaches, role.reload, now, partial, whole]);

  // Worked out when what they come from changes, not each time the menu, search or the bell opens (scale check, 22 Nov).
  const notificationsUnread = useMemo(() => (value ? value.notifications.filter((n) => !n.read_at).length : 0), [value?.notifications]);
  // The next-call bar: the coach's own calls (sessions and calendar items); on previews the suites can add test calls.
  const barCallsNow = useMemo(() => {
    if (!value) return [];
    const coachZone = coachZoneOf(value.settings, deviceZone());
    return [
      ...barCalls({ items: value.calItems, sessions: value.sessions, clients: value.clients, groups: value.groups, now, coachZone, settings: value.settings }),
      ...(LIVE ? [] : testCalls()),
    ];
    // (pathname: test calls on previews are read again on each page, as they were.)
  }, [value?.calItems, value?.sessions, value?.clients, value?.groups, value?.settings, now, pathname]);

  // The page itself is made once per owner or not: opening the menu, search or the bell re-renders this frame, and the
  // page under them (Today, Clients…) used to be drawn again with it (scale check, 22 Nov). A page still follows the
  // address and the coach's data through the router and CoachPortalContext.
  const pages = useMemo(() => (
    <Suspense fallback={null}>
      <Routes>
        <Route index element={<Today />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/past" element={<PastClients />} />
        <Route path="clients/:id" element={<ClientPage />} />
        <Route path="groups/:id" element={<GroupPage />} />
        <Route path="workshops/:id" element={<WorkshopPage />} />
        <Route path="organisations/:id" element={isOwner ? <OrganisationPage /> : <Navigate to="/coach/clients" replace />} />
        <Route path="todos" element={<Todos />} />
        <Route path="todos/lists/:id" element={<TodoListPage />} />
        <Route path="sessions/:id" element={<SessionPage />} />
        <Route path="clients/:id/close" element={<ClosePage />} />
        {/* Leads (run 4) are the owner's alone: an associate is sent to their own Today, whatever address they open. */}
        <Route path="leads" element={isOwner ? <Leads /> : <Navigate to="/coach" replace />} />
        <Route path="leads/reports" element={isOwner ? <LeadReports /> : <Navigate to="/coach" replace />} />
        <Route path="leads/cold" element={isOwner ? <ColdLeads /> : <Navigate to="/coach" replace />} />
        <Route path="leads/automations" element={isOwner ? <Automations /> : <Navigate to="/coach" replace />} />
        <Route path="leads/:id" element={isOwner ? <LeadPage /> : <Navigate to="/coach" replace />} />
        {/* Boards (run 4): the owner's own; an associate opens only a board the owner has shared, and can't change it. */}
        <Route path="network" element={isOwner ? <Network /> : <Navigate to="/coach" replace />} />
        <Route path="boards" element={<Boards />} />
        <Route path="boards/:id" element={<BoardPage />} />
        <Route path="business/*" element={<Navigate to="/coach/finances" replace />} />
        {/* Finances (Phase 6b run 2) are the owner's alone: an associate is sent to their own Today, as M11 does. */}
        <Route path="finances" element={isOwner ? <Finances /> : <Navigate to="/coach" replace />} />
        <Route path="finances/:tab" element={isOwner ? <Finances /> : <Navigate to="/coach" replace />} />
        <Route path="calendar" element={<Calendar />} />
        {/* Booking (run 3, step 4): Book a call is a side panel over the calendar; Offer times by email and a poll's times
            are picked on the calendar itself; Open for calls and a poll are their own pages. */}
        <Route path="calendar/book" element={<Calendar side="book" />} />
        <Route path="calendar/offer" element={<Calendar side="offer" />} />
        <Route path="calendar/polls/new" element={<Calendar side="poll" />} />
        <Route path="calendar/open" element={<OpenForCalls />} />
        <Route path="calendar/polls/:id" element={<PollPage />} />
        <Route path="calendar/*" element={<Navigate to="/coach/calendar" replace />} />
        {!LIVE && <Route path="renewals/:id" element={<ComingSoon title="Renewal" />} />}
        <Route path="settings" element={<Settings />} />
        <Route path="settings/:section" element={<Settings />} />
        {!LIVE && later.filter((p) => !p.owner || isOwner).map((p) => <Route key={p.key} path={`${p.to.replace('/coach/', '')}/*`} element={<ComingSoon title={p.label} />} />)}
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Routes>
    </Suspense>
  ), [isOwner]);

  if (role.loading) return <Blank />;
  // The role read got no answer, twice, and nothing is kept on this device: it isn't known whether this is a coach, so
  // the coach portal says so calmly, with Try again, and never sends a coach to the clients' Home (tidy follow-up 4).
  if (role.failed) return <RoleProblem onRetry={role.retry} />;
  if (!coach) return <Navigate to="/welcome" replace />;

  const unread = notificationsUnread;
  const calls = barCallsNow;

  return (
    <CoachPortalContext.Provider value={value}>
      <CalSync>
      {/* Run 4: the automations nobody presses a button for, and emails arriving (both the owner's; neither ever sends anything). */}
      {/* Once everything is in (never asked for while the first screen's own read is on its way). */}
      {value.whole && <Suspense fallback={null}><AutomationWatch /></Suspense>}
      {value.whole && <Suspense fallback={null}><EmailSync /></Suspense>}
      {/* The device's copy first (IndexedDB, read in a moment): until it is in, the frame and the page are drawn
          unseen (their parts still load), never empty for an instant before it (UI tester, scale check). */}
      {/* While only one page's first screen is here, any other page shows the crosshair until the rest is in. */}
      <Frame pages={pages} calls={calls} now={now} unread={unread} hold={!copyShown || !listsShown} firstLoad={!somethingToShow || Boolean(partial && screenKindOf(pathname) !== partial)} />
      </CalSync>
    </CoachPortalContext.Provider>
  );
}
