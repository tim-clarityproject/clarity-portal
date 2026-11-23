import { Fragment, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { BoldCrosshair, Loading, PageHeader, SlidePanel, useBackCloses, useHidePhoneBar, useToast } from '../../components/design';
import { isPhoneWidth } from '../../components/design/pageLock';
import { useSignOut } from '../../components/SignOut';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { useCoachRole } from '../../lib/coach/role';
import { findCalItems, fromTable, rowsOf, saveRows, useCoachCopyShown, useCoachLoad, useCoachSomethingToShow, useCoachStore } from '../../lib/coach/store';
import { loadAdminClients, loadCoaches } from '../../lib/coach/actions';
import { deviceCopyAvailable, readExtra, writeExtra } from '../../lib/coach/deviceCopy';
import { callForBar, favouriteViews, nextCallBar, searchResults, withRecent } from '../../lib/coach/model';
import { COACH_PAGES, coachTitle, menuFor, SETTINGS_SECTIONS } from '../../lib/coach/navigation';
import { testCalls } from '../../lib/coach/calls';
import { todayTodos } from '../../lib/coach/day';
import { barCalls, coachZoneOf, searchItems } from '../../lib/coach/calendar';
import { boardSearchItems, boardsFor, LEAD_SEARCH_ACTIONS, leadSearchItems } from '../../lib/coach/crm';
// Network's people are moved across before anything that points at one (a lead's Referred by): the module says so to the
// store as it loads, so it is loaded with the frame, whichever page opens first.
import { networkPageOf } from '../../lib/coach/networkData';
import { menuCount, NETWORK_SEARCH_ACTIONS, networkSearchItems, searchQuery } from '../../lib/coach/network';
import { useNetworkCounts } from './networkParts';
import { deviceZone } from '../../lib/time/index.js';
import { CoachPortalContext, InlineLink, TextLink, useCoachPortal } from './parts';
import { CalSync } from './calSync';
import { AutomationWatch, EmailSync } from './crmParts';
import './coach.css';

// Clarity Coach, the coach portal (Phase 6a runs 1 and 2; mock-up M11, seq
// 77). Open only to coach accounts: anyone else is sent to their own
// Home, and the database's rules decide what each coach reads whatever a
// page shows. This file is the frame every coach page sits in: the header
// (the bold crosshair menu button, one search box, the bell), the slim
// next-call bar's slot, the menu, the phone bar, search and the bell.

const Today = lazy(() => import('./Today'));
const Clients = lazy(() => import('./Clients'));
const ClientPage = lazy(() => import('./ClientPage'));
const PastClients = lazy(() => import('./PastClients'));
const GroupPage = lazy(() => import('./GroupPage'));
const WorkshopPage = lazy(() => import('./WorkshopPage'));
const OrganisationPage = lazy(() => import('./OrganisationPage'));
const Settings = lazy(() => import('./Settings'));
const Todos = lazy(() => import('./Todos'));
const TodoListPage = lazy(() => import('./TodoListPage'));
const SessionPage = lazy(() => import('./SessionPage'));
const ClosePage = lazy(() => import('./ClosePage'));
const Calendar = lazy(() => import('./Calendar'));
const Leads = lazy(() => import('./Leads'));
const LeadPage = lazy(() => import('./LeadPage'));
const ColdLeads = lazy(() => import('./ColdLeads'));
const Automations = lazy(() => import('./Automations'));
const Boards = lazy(() => import('./Boards'));
const BoardPage = lazy(() => import('./BoardPage'));
const Network = lazy(() => import('./Network'));
const OpenForCalls = lazy(() => import('./OpenForCalls'));
const PollPage = lazy(() => import('./PollPage'));
const BriefPanel = lazy(() => import('./Brief').then((m) => ({ default: m.BriefPanel || m.default })));

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

/**
 * The menu and search cover the page on a phone and sit over it on a laptop: once closed (Back, Escape, the close button or
 * the scrim), focus goes back to what opened them, as the shared panels do, unless it has moved to another page meanwhile or
 * something else already took it (run 6, the UI tester: focus was left on the page's body).
 */
function useFocusBack(open) {
  const { pathname } = useLocation();
  const opener = useRef(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const from = document.activeElement;
    const at = pathname;
    opener.current = from && from !== document.body ? from : null;
    return () => {
      const el = opener.current;
      setTimeout(() => {
        const now = document.activeElement;
        if (!el || !el.isConnected || window.location.pathname !== at) return;
        if (!now || now === document.body || now === document.documentElement) el.focus({ preventScroll: true });
      }, 0);
    };
    // Recorded once per opening: the address it opened on is read as it opens.
  }, [open]);
}

function Menu({ open, onClose, onSignOut }) {
  const { isOwner, views, todos, todoLists, todayKey, boards } = useCoachPortal();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navRef = useRef(null);
  // Network shows how many people are due a catch-up (the owner's alone; asked only while the menu is open).
  const due = menuCount(useNetworkCounts(open).data);
  // On a phone the menu covers the page: Back closes it (run 6, item 4).
  useBackCloses(open, onClose, isPhoneWidth());
  useFocusBack(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    navRef.current?.querySelector('[aria-current="page"], button')?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Worked out when the to-dos change, never as the menu opens (scale check, 22 Nov: opening took 0.3 s for the owner).
  const todosToday = useMemo(() => todayTodos(todos, todayKey).work.length, [todos, todayKey]); // the working day only, as M11 counts it: After work sits apart
  const lists = useMemo(() => todoLists.filter((l) => !l.finished_at), [todoLists]);
  const menuBoards = useMemo(() => boardsFor(boards, { isOwner }), [boards, isOwner]);
  const favourites = useMemo(() => favouriteViews(views).filter((v) => v.list !== 'leads' || isOwner), [views, isOwner]);
  if (!open) return null;
  const go = (to) => { onClose(); navigate(to); };
  // Boards: the owner's own under it; an associate has the page only once a board is shared with them.
  const items = menuFor({ isOwner, live: LIVE, hasShared: menuBoards.length > 0 });
  const current = (to) => (to === '/coach' ? pathname === '/coach' : pathname === to || pathname.startsWith(`${to}/`));
  // To-dos shows how many are for today, with the coach's own lists under it (M11's menu).
  return (
    <>
      <div className="cc-scrim cc-scrim--menu" onClick={onClose} aria-hidden="true" />
      <nav className="cc-menu" aria-label="Menu">
        <div className="cc-menu-head">
          <button type="button" className="cc-round cc-round--mark" aria-expanded="true" aria-label="Close the menu" onClick={onClose}>
            <BoldCrosshair size={26} />
          </button>
        </div>
        <div className="cc-menu-nav" ref={navRef}>
          {items.filter((i) => i.key !== 'settings').map((i) => (i.key === 'boards' ? (
            <Fragment key={i.key}>
              <button type="button" className="cc-menu-item" aria-current={pathname === i.to ? 'page' : undefined} onClick={() => go(i.to)}>{i.label}</button>
              {menuBoards.map((b) => (
                <button key={b.id} type="button" className="cc-menu-item cc-menu-item--sub" aria-current={pathname === `/coach/boards/${b.id}` ? 'page' : undefined} onClick={() => go(`/coach/boards/${b.id}`)}>{b.name}</button>
              ))}
            </Fragment>
          ) : i.key === 'network' ? (
            <button key={i.key} type="button" className="cc-menu-item" aria-current={current(i.to) ? 'page' : undefined} aria-label={due.spoken ? `Network, ${due.spoken}` : undefined} onClick={() => go(i.to)}>
              {i.label}{due.count && <span className="cc-menu-n" aria-hidden="true">{due.count}</span>}
            </button>
          ) : i.key !== 'todos' ? (
            <button key={i.key} type="button" className="cc-menu-item" aria-current={current(i.to) ? 'page' : undefined} onClick={() => go(i.to)}>{i.label}</button>
          ) : (
            <Fragment key={i.key}>
              <button type="button" className="cc-menu-item" aria-current={pathname === i.to ? 'page' : undefined} aria-label={todosToday ? `To-dos, ${todosToday} for today` : undefined} onClick={() => go(i.to)}>
                {i.label}{todosToday > 0 && <span className="cc-menu-n" aria-hidden="true">{todosToday}</span>}
              </button>
              {lists.map((l) => (
                <button key={l.id} type="button" className="cc-menu-item cc-menu-item--sub" aria-current={pathname === `/coach/todos/lists/${l.id}` ? 'page' : undefined} onClick={() => go(`/coach/todos/lists/${l.id}`)}>{l.name}</button>
              ))}
            </Fragment>
          )))}
          {favourites.length > 0 && <p className="cc-menu-label">Favourite views</p>}
          {favourites.map((v) => (
            <button key={v.id} type="button" className="cc-menu-item" onClick={() => go(`/coach/${v.list === 'leads' ? 'leads' : 'clients'}?view=${v.id}`)}>{v.name}</button>
          ))}
          <button type="button" className="cc-menu-item" aria-current={current('/coach/settings') ? 'page' : undefined} onClick={() => go('/coach/settings')}>Settings</button>
        </div>
        <div className="cc-menu-foot">
          <button type="button" className="cc-menu-item cc-menu-item--out" onClick={() => { onClose(); onSignOut(); }}>Sign out</button>
        </div>
      </nav>
    </>
  );
}

/** One box finds people, pages and actions as it is typed, with recent items before anything is typed. */
function Search({ open, onClose }) {
  const { userId, isOwner, clients, groups, workshops, organisations, admin, coaches, coach, calItems, calGuests, settings, todayKey, leads, leadStages, boards } = useCoachPortal();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const recentKey = deviceKey('cache', userId, 'coach-recent');
  // On a phone search covers the page: Back closes it (run 6, item 4).
  useBackCloses(open, onClose, isPhoneWidth());
  useFocusBack(open);
  // Read as the box opens, in the same render (a state set after opening drew it twice: scale check, 22 Nov).
  const recent = useMemo(() => {
    if (!open) return [];
    const kept = readJson(recentKey);
    return Array.isArray(kept) ? kept : [];
  }, [open, recentKey]);
  // Network's people are never loaded whole: search asks for the few that match, as it is typed (the owner's alone).
  const [network, setNetwork] = useState([]);
  useEffect(() => {
    const typed = q.trim();
    if (!open || !isOwner || typed.length < 2) { setNetwork([]); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      Promise.all([networkPageOf(userId, searchQuery(typed, todayKey)), networkPageOf(userId, searchQuery(typed, todayKey, true))])
        .then(([active, archived]) => { if (live) setNetwork(networkSearchItems([...active.rows, ...archived.rows])); }).catch(() => { if (live) setNetwork([]); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [q, open, isOwner, userId, todayKey]);
  // Each opening starts empty and takes the keyboard at once, before anything
  // can be typed: the first letter is never lost, nor added to the last search.
  // The box is emptied as it closes, so it opens already empty, in one render.
  useLayoutEffect(() => {
    if (!open) { setQ(''); setAt(0); return; }
    inputRef.current?.focus();
  }, [open]);

  // The index is built once its data is there, quietly after the page has drawn, and again only when what it is
  // built from changes: never as the box opens or as a letter is typed (scale check, 22 Nov: opening took 0.5 s on a
  // laptop and 2.2 s on a phone for the owner, typing 0.7 s on a phone).
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (armed) return undefined;
    if (open) { setArmed(true); return undefined; }
    const idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(() => setArmed(true), { timeout: 3000 }) : window.setTimeout(() => setArmed(true), 1500);
    return () => (typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback(idle) : window.clearTimeout(idle));
  }, [open, armed]);
  const people = useMemo(() => {
    if (!armed) return [];
    const orgNames = new Map(organisations.map((o) => [o.id, o.name]));
    const orgName = (id) => orgNames.get(id) || '';
    const mine = new Set(clients.map((c) => c.id));
    return [
      ...clients.map((p) => ({ key: `c:${p.id}`, title: p.name, kind: p.status === 'past' ? 'Past client' : 'Client', also: `${orgName(p.organisation_id)} ${p.email || ''}`, to: `/coach/clients/${p.id}` })),
      // The owner finds associates' clients by name only, for admin.
      ...(isOwner ? admin.filter((a) => !mine.has(a.profile_id) && a.coach_id !== coach.id).map((a) => ({ key: `a:${a.profile_id}`, title: a.name, kind: `${a.coach_first_name}’s client`, admin: a.coach_first_name })) : []),
      ...groups.map((g) => ({ key: `g:${g.id}`, title: g.name, kind: 'Group', also: orgName(g.organisation_id), to: `/coach/groups/${g.id}` })),
      ...workshops.map((w) => ({ key: `w:${w.id}`, title: w.title, kind: 'Workshop', also: orgName(w.organisation_id), to: `/coach/workshops/${w.id}` })),
      ...(isOwner ? organisations.map((o) => ({ key: `o:${o.id}`, title: o.name, kind: 'Organisation', to: `/coach/organisations/${o.id}` })) : []),
      // Leads are the owner's alone: an associate's search never finds one (run 4).
      ...(isOwner ? leadSearchItems(leads, leadStages) : []),
      // Boards: the owner's own; an associate finds only the ones shared with them.
      ...boardSearchItems(boards, { isOwner }),
    ];
  }, [armed, clients, groups, workshops, organisations, admin, isOwner, coach, leads, leadStages, boards]);
  const fixed = useMemo(() => ({
    pages: [
      ...menuFor({ isOwner, live: LIVE, hasShared: boardsFor(boards, { isOwner }).length > 0 }).map((i) => ({ key: `p:${i.key}`, title: i.label, kind: 'Page', to: i.to })),
      ...(isOwner ? [{ key: 'p:automations', title: 'Automations', kind: 'Page', to: '/coach/leads/automations' }] : []),
      ...SETTINGS_SECTIONS.filter((x) => !x.owner || isOwner).map((x) => ({ key: `s:${x.key}`, title: x.label, kind: 'Settings', also: 'settings', to: `/coach/settings/${x.key}` })),
      { key: 'p:past', title: 'Past clients', kind: 'Page', to: '/coach/clients/past' },
    ],
    actions: [
      { key: 'a:client', title: 'Add client', to: '/coach/clients', state: { open: 'add' } },
      { key: 'a:team', title: 'Add team', to: '/coach/clients', state: { open: 'team' } },
      { key: 'a:group', title: 'Add group', to: '/coach/clients?tab=groups', state: { open: 'group' } },
      { key: 'a:workshop', title: 'Add workshop', to: '/coach/clients?tab=workshops', state: { open: 'workshop' } },
      { key: 'a:export', title: 'Export clients to a spreadsheet', to: '/coach/clients', state: { open: 'export' } },
      ...(isOwner ? [...LEAD_SEARCH_ACTIONS, ...NETWORK_SEARCH_ACTIONS, { key: 'a:board', title: 'New board', to: '/coach/boards', state: { open: 'board' } }, { key: 'a:automation', title: 'Add automation', to: '/coach/leads/automations', state: { open: 'add' } }] : []),
      { key: 'a:book', title: 'Book a call', to: '/coach/calendar/book' },
      { key: 'a:open', title: 'Set my open times', to: '/coach/calendar/open' },
      { key: 'a:offer', title: 'Offer times by email', to: '/coach/calendar/offer' },
      { key: 'a:poll', title: 'Start a poll', to: '/coach/calendar/polls/new' },
      ...(coaches.length > 1 && isOwner ? [{ key: 'a:coach', title: 'Add coach', to: '/coach/settings/coaches', state: { open: 'coach' } }] : []),
    ],
  }), [isOwner, boards, coaches]);
  // Calendar items, found by title, person or note; each opens its own day. The weeks on the device, and as it is
  // typed the database's own matches from the rest of the calendar (it is never read whole).
  const coachZone = coachZoneOf(settings, deviceZone());
  const localItems = useMemo(() => (armed ? searchItems({ items: calItems, guests: calGuests, coachZone, todayKey }) : []), [armed, calItems, calGuests, coachZone, todayKey]);
  const [farItems, setFarItems] = useState([]);
  useEffect(() => {
    const typed = q.trim();
    if (!open || typed.length < 2) { setFarItems([]); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      findCalItems(typed).then((rows) => {
        if (!live) return;
        const here = new Set(calItems.map((i) => i.id));
        setFarItems(searchItems({ items: rows.filter((r) => !here.has(r.id) && r.coach_id === coach.id), guests: calGuests, coachZone, todayKey }));
      }).catch(() => { if (live) setFarItems([]); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [q, open, calItems, calGuests, coach, coachZone, todayKey]);
  const all = useMemo(() => ({
    people: isOwner && network.length ? [...people, ...network] : people,
    pages: fixed.pages,
    actions: fixed.actions,
    recent,
    items: farItems.length ? [...localItems, ...farItems] : localItems,
  }), [people, network, isOwner, fixed, recent, localItems, farItems]);

  const groupsShown = useMemo(() => searchResults(q, all), [q, all]);
  const flat = groupsShown.flatMap((g) => g.items);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('.cc-jump-item--on')?.scrollIntoView({ block: 'nearest' }); }, [at]);
  if (!open) return null;

  const choose = (item) => {
    if (!item) return;
    onClose();
    if (item.admin) {
      toast.show(`${item.title} is ${item.admin}’s client, so only ${item.admin} opens their page.`);
      return;
    }
    if (item.kind && item.kind !== 'Page' && item.kind !== 'Settings') writeJson(recentKey, withRecent(recent, item));
    navigate(item.to, item.state ? { state: item.state } : undefined);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((n) => Math.min(flat.length - 1, n + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAt((n) => Math.max(0, n - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); choose(flat[at]); }
  };
  return (
    <>
      <div className="cc-scrim" onClick={onClose} aria-hidden="true" />
      <div className="cc-jump" role="dialog" aria-modal="true" aria-label="Search">
        <input ref={inputRef} className="cc-jump-input" type="search" aria-label="Search or type an action" placeholder="Search or type an action" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} role="combobox" aria-expanded="true" aria-controls="cc-jump-list" />
        <div className="cc-jump-list" id="cc-jump-list" ref={listRef} role="listbox" aria-label="Results">
          {groupsShown.length === 0 && <p className="cc-jump-none">Nothing matches “{q.trim()}”.</p>}
          {groupsShown.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <p className="cc-jump-label">{g.label}</p>
              {g.items.map((item) => {
                const i = flat.indexOf(item);
                return (
                  <button key={item.key} type="button" role="option" aria-selected={i === at} className={`cc-jump-item${i === at ? ' cc-jump-item--on' : ''}`} onMouseMove={() => { if (at !== i) setAt(i); }} onClick={() => choose(item)}>
                    <b>{item.title}</b>
                    {item.kind && <small>{item.kind}</small>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
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
  const { userId, notifications, todayKey } = useCoachPortal();
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
      footer={unread.length > 0 ? <div className="cc-panel-foot"><TextLink onClick={all}>Mark all as read</TextLink></div> : null}
    >
      {sorted.length === 0 && <p className="cc-quiet">Nothing new. Bookings, agreements and anything else that needs you will show here.</p>}
      {sorted.map((n) => (
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

function Blank() {
  return <div className="ui-root" role="status" aria-label="Loading" style={{ minHeight: '100dvh', background: 'var(--bg)' }} />;
}

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
  useEffect(() => { setMenu(false); setSearch(false); }, [pathname]);
  const closeMenu = useCallback(() => setMenu(false), []);
  const closeSearch = useCallback(() => setSearch(false), []);
  const closeBell = useCallback(() => setBell(false), []);
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
      <main className={`cc-main${firstLoad ? ' cc-main--first' : ''}`} id="cc-main" aria-busy={firstLoad || undefined}>
        {firstLoad && <Loading label="Loading Clarity Coach" className="ds-loading--page" />}
        {pages}
      </main>
      <nav className="cc-phonebar" aria-label="Clarity Coach">
        <button type="button" className="cc-round" aria-label="Today" aria-current={pathname === '/coach' ? 'page' : undefined} onClick={() => { setMenu(false); navigate('/coach'); }}>{HOME}</button>
        <button type="button" className="cc-round cc-round--mark" aria-label={menu ? 'Close the menu' : 'Menu'} aria-expanded={menu} onClick={() => setMenu((v) => !v)}><BoldCrosshair size={32} /></button>
        <button type="button" className="cc-round" aria-label="Calendar" aria-current={pathname.startsWith('/coach/calendar') ? 'page' : undefined} onClick={() => { setMenu(false); navigate('/coach/calendar'); }}>{CALENDAR}</button>
      </nav>
      <Menu open={menu} onClose={closeMenu} onSignOut={signOut.start} />
      <Search open={search} onClose={closeSearch} />
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
  useCoachLoad(coach ? userId : null);
  const todayKey = useToday();
  const now = useNow();

  const [coaches, setCoaches] = useState([]);
  const [admin, setAdmin] = useState([]);
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
      if (Array.isArray(keptCoaches) && !listsFresh.current.coaches) setCoaches(keptCoaches);
      if (Array.isArray(keptAdmin) && !listsFresh.current.admin) setAdmin(keptAdmin);
      setListsShown(true);
    });
    return () => { live = false; window.clearTimeout(enough); };
  }, [userId, coachId, isOwner]);
  useEffect(() => {
    if (!coachId) return undefined;
    let live = true;
    loadCoaches().then((list) => {
      if (!live) return;
      listsFresh.current.coaches = true;
      setCoaches(list);
      writeExtra(userId, 'coaches', list);
    }).catch(() => {});
    if (isOwner) {
      loadAdminClients().then((list) => {
        if (!live) return;
        listsFresh.current.admin = true;
        setAdmin(list);
        writeExtra(userId, 'admin', list);
      }).catch(() => {});
    }
    return () => { live = false; };
  }, [coachId, isOwner, turn, countTurn, userId]);

  useEffect(() => { document.title = coachTitle(pathname); }, [pathname]);

  const value = useMemo(() => {
    if (!coach) return null;
    const mine = (rows) => rows.filter((r) => r.coach_id === coach.id);
    // Each list is worked out once per change to its own table (store.js's fromTable), so a save to one table leaves
    // every other list, and the pages' own memos built on them, as they were (scale check, 22 Nov).
    const own = (table, then = null, name = '') => fromTable(state, table, `mine:${coach.id}${name}`, (rows) => (then ? then(mine(rows)) : mine(rows)));
    const all = (table, then = null, name = '') => fromTable(state, table, `all${name}`, (rows) => (then ? then(rows) : rows));
    return {
      userId, coach, isOwner, state, todayKey, coaches, admin, reloadCoaches, reloadRole: role.reload,
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
      networkColumns: own('network_columns', (rows) => rows.sort((x, y) => (x.position || 0) - (y.position || 0) || x.name.localeCompare(y.name)), ':sorted'),
      now,
    };
  }, [coach, isOwner, state, todayKey, coaches, admin, userId, reloadCoaches, role.reload, now]);

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
        <Route path="leads/cold" element={isOwner ? <ColdLeads /> : <Navigate to="/coach" replace />} />
        <Route path="leads/automations" element={isOwner ? <Automations /> : <Navigate to="/coach" replace />} />
        <Route path="leads/:id" element={isOwner ? <LeadPage /> : <Navigate to="/coach" replace />} />
        {/* Boards (run 4): the owner's own; an associate opens only a board the owner has shared, and can't change it. */}
        <Route path="network" element={isOwner ? <Network /> : <Navigate to="/coach" replace />} />
        <Route path="boards" element={<Boards />} />
        <Route path="boards/:id" element={<BoardPage />} />
        <Route path="business/*" element={<Navigate to="/coach/finances" replace />} />
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
  if (!coach) return <Navigate to="/welcome" replace />;

  const unread = notificationsUnread;
  const calls = barCallsNow;

  return (
    <CoachPortalContext.Provider value={value}>
      <CalSync>
      {/* Run 4: the automations nobody presses a button for, and emails arriving (both the owner's; neither ever sends anything). */}
      <AutomationWatch />
      <EmailSync />
      {/* The device's copy first (IndexedDB, read in a moment): until it is in, the frame and the page are drawn
          unseen (their parts still load), never empty for an instant before it (UI tester, scale check). */}
      <Frame pages={pages} calls={calls} now={now} unread={unread} hold={!copyShown || !listsShown} firstLoad={!somethingToShow} />
      </CalSync>
    </CoachPortalContext.Provider>
  );
}
