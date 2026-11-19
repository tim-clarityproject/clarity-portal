import { Fragment, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { BoldCrosshair, PageHeader, SlidePanel, useHidePhoneBar, useToast } from '../../components/design';
import { useSignOut } from '../../components/SignOut';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { useCoachRole } from '../../lib/coach/role';
import { rowsOf, saveRows, useCoachLoad, useCoachStore } from '../../lib/coach/store';
import { loadAdminClients, loadCoaches } from '../../lib/coach/actions';
import { callForBar, favouriteViews, nextCallBar, searchResults, withRecent } from '../../lib/coach/model';
import { COACH_MENU, COACH_PAGES, coachTitle, SETTINGS_SECTIONS } from '../../lib/coach/navigation';
import { testCalls } from '../../lib/coach/calls';
import { todayTodos } from '../../lib/coach/day';
import { CoachPortalContext, TextLink, useCoachPortal } from './parts';
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

const BELL = <svg className="cc-line-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" /></svg>;
const HOME = <svg className="cc-line-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z" /></svg>;
const CALENDAR = <svg className="cc-line-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4" /></svg>;

const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;

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
 * calls themselves arrive with the calendar (run 3); until then it is
 * given test calls on previews only.
 */
export function CallBar({ calls, now }) {
  const navigate = useNavigate();
  const call = callForBar(calls, now);
  const bar = nextCallBar(call, now);
  if (!bar) return null;
  return (
    <div className={`cc-callbar${bar.coral ? ' cc-callbar--soon' : ''}`} role="status">
      <div className="cc-callbar-in">
        <span className="cc-callbar-who"><b>{bar.name}</b> {bar.words}</span>
        <span className="cc-callbar-links">
          {bar.briefTo && <TextLink onClick={() => navigate(bar.briefTo)}>Open the brief</TextLink>}
          {bar.zoom && <a className="ds-link" href={bar.zoom} target="_blank" rel="noreferrer">Join on Zoom</a>}
        </span>
      </div>
    </div>
  );
}

function Menu({ open, onClose, onSignOut }) {
  const { isOwner, views, todos, todoLists, todayKey } = useCoachPortal();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    navRef.current?.querySelector('[aria-current="page"], button')?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const go = (to) => { onClose(); navigate(to); };
  const items = COACH_MENU.filter((i) => (!i.owner || isOwner) && (!i.later || !LIVE));
  const current = (to) => (to === '/coach' ? pathname === '/coach' : pathname === to || pathname.startsWith(`${to}/`));
  const favourites = favouriteViews(views);
  // To-dos shows how many are for today, with the coach's own lists under it (M11's menu).
  const today = todayTodos(todos, todayKey);
  const todosToday = today.work.length + today.afterWork.length;
  const lists = todoLists.filter((l) => !l.finished_at);
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
          {items.filter((i) => i.key !== 'settings').map((i) => (i.key !== 'todos' ? (
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
            <button key={v.id} type="button" className="cc-menu-item" onClick={() => go(`/coach/clients?view=${v.id}`)}>{v.name}</button>
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
  const { userId, isOwner, clients, groups, workshops, organisations, admin, coaches, coach } = useCoachPortal();
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const recentKey = deviceKey('cache', userId, 'coach-recent');
  const [recent, setRecent] = useState([]);
  // Each opening starts empty and takes the keyboard at once, before anything
  // can be typed: the first letter is never lost, nor added to the last search.
  useLayoutEffect(() => {
    if (!open) return;
    setQ(''); setAt(0);
    setRecent(Array.isArray(readJson(recentKey)) ? readJson(recentKey) : []);
    inputRef.current?.focus();
  }, [open, recentKey]);

  const all = useMemo(() => {
    const orgName = (id) => organisations.find((o) => o.id === id)?.name || '';
    const mine = new Set(clients.map((c) => c.id));
    const people = [
      ...clients.map((p) => ({ key: `c:${p.id}`, title: p.name, kind: p.status === 'past' ? 'Past client' : 'Client', also: `${orgName(p.organisation_id)} ${p.email || ''}`, to: `/coach/clients/${p.id}` })),
      // The owner finds associates' clients by name only, for admin.
      ...(isOwner ? admin.filter((a) => !mine.has(a.profile_id) && a.coach_id !== coach.id).map((a) => ({ key: `a:${a.profile_id}`, title: a.name, kind: `${a.coach_first_name}’s client`, admin: a.coach_first_name })) : []),
      ...groups.map((g) => ({ key: `g:${g.id}`, title: g.name, kind: 'Group', also: orgName(g.organisation_id), to: `/coach/groups/${g.id}` })),
      ...workshops.map((w) => ({ key: `w:${w.id}`, title: w.title, kind: 'Workshop', also: orgName(w.organisation_id), to: `/coach/workshops/${w.id}` })),
      ...(isOwner ? organisations.map((o) => ({ key: `o:${o.id}`, title: o.name, kind: 'Organisation', to: `/coach/organisations/${o.id}` })) : []),
    ];
    const pages = [
      ...COACH_MENU.filter((i) => (!i.owner || isOwner) && (!i.later || !LIVE)).map((i) => ({ key: `p:${i.key}`, title: i.label, kind: 'Page', to: i.to })),
      ...SETTINGS_SECTIONS.filter((s) => !s.owner || isOwner).map((s) => ({ key: `s:${s.key}`, title: s.label, kind: 'Settings', also: 'settings', to: `/coach/settings/${s.key}` })),
      { key: 'p:past', title: 'Past clients', kind: 'Page', to: '/coach/clients/past' },
    ];
    const actions = [
      { key: 'a:client', title: 'Add client', to: '/coach/clients', state: { open: 'add' } },
      { key: 'a:team', title: 'Add a team', to: '/coach/clients', state: { open: 'team' } },
      { key: 'a:group', title: 'Add group', to: '/coach/clients?tab=groups', state: { open: 'group' } },
      { key: 'a:workshop', title: 'Add workshop', to: '/coach/clients?tab=workshops', state: { open: 'workshop' } },
      { key: 'a:export', title: 'Export clients to a spreadsheet', to: '/coach/clients', state: { open: 'export' } },
      ...(coaches.length > 1 && isOwner ? [{ key: 'a:coach', title: 'Add coach', to: '/coach/settings/coaches', state: { open: 'coach' } }] : []),
    ];
    return { people, pages, actions, recent };
  }, [clients, groups, workshops, organisations, admin, isOwner, coaches, coach, recent]);

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
  const sorted = [...notifications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const unread = sorted.filter((n) => !n.read_at);
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

export default function CoachApp() {
  const { user } = useContext(AuthContext);
  const role = useCoachRole();
  const userId = user?.id || null;
  const coach = role.coach;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useHidePhoneBar(true); // the client portal's own phone bar steps back here

  const state = useCoachStore(coach ? userId : null);
  useCoachLoad(coach ? userId : null);
  const todayKey = useToday();
  const now = useNow();

  const [coaches, setCoaches] = useState([]);
  const [admin, setAdmin] = useState([]);
  const [turn, setTurn] = useState(0);
  const reloadCoaches = useCallback(() => setTurn((n) => n + 1), []);
  const coachId = coach?.id || null;
  const isOwner = role.isOwner;
  useEffect(() => {
    if (!coachId) return undefined;
    let live = true;
    loadCoaches().then((list) => { if (live) setCoaches(list); }).catch(() => {});
    if (isOwner) loadAdminClients().then((list) => { if (live) setAdmin(list); }).catch(() => {});
    return () => { live = false; };
  }, [coachId, isOwner, turn, state.rows.client_profiles]);

  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [bell, setBell] = useState(false);
  const signOut = useSignOut({ to: '/coach/sign-in' });
  useEffect(() => { setMenu(false); setSearch(false); }, [pathname]);
  useEffect(() => { document.title = coachTitle(pathname); }, [pathname]);

  const value = useMemo(() => {
    if (!coach) return null;
    const mine = (rows) => rows.filter((r) => r.coach_id === coach.id);
    const profiles = mine(rowsOf(state, 'client_profiles')).filter((p) => !p.merged_into);
    return {
      userId, coach, isOwner, state, todayKey, coaches, admin, reloadCoaches, reloadRole: role.reload,
      clients: profiles,
      groups: mine(rowsOf(state, 'coach_groups')),
      workshops: mine(rowsOf(state, 'workshops')),
      organisations: rowsOf(state, 'organisations'),
      tags: mine(rowsOf(state, 'coach_tags')).sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)),
      fields: mine(rowsOf(state, 'coach_fields')).filter((f) => f.applies_to === 'client').sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)),
      views: mine(rowsOf(state, 'coach_views')),
      notifications: mine(rowsOf(state, 'coach_notifications')),
      settings: rowsOf(state, 'coach_settings').find((s) => s.coach_id === coach.id) || { coach_id: coach.id },
      // The coaching day (run 2): the coach's own to-dos, lists, days, weeks and sessions.
      todos: mine(rowsOf(state, 'coach_todos')),
      todoLists: mine(rowsOf(state, 'coach_todo_lists')).sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)),
      todoHeadings: mine(rowsOf(state, 'coach_todo_headings')).sort((a, b) => (a.position || 0) - (b.position || 0)),
      days: mine(rowsOf(state, 'coach_days')),
      weeks: mine(rowsOf(state, 'coach_weeks')),
      sessions: mine(rowsOf(state, 'coach_sessions')),
      sessionPeople: rowsOf(state, 'coach_session_people'),
      sessionActions: mine(rowsOf(state, 'coach_session_actions')),
      sessionNotes: mine(rowsOf(state, 'coach_session_notes')),
      now,
    };
  }, [coach, isOwner, state, todayKey, coaches, admin, userId, reloadCoaches, role.reload, now]);

  if (role.loading) return <Blank />;
  if (!coach) return <Navigate to="/welcome" replace />;

  const unread = value.notifications.filter((n) => !n.read_at).length;
  const calls = LIVE ? [] : testCalls();
  const later = COACH_PAGES.filter((p) => p.later);

  return (
    <CoachPortalContext.Provider value={value}>
      <div className="ui-root cc-app">
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
        <main className="cc-main" id="cc-main">
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
              <Route path="business/*" element={<Navigate to="/coach/finances" replace />} />
              {!LIVE && <Route path="renewals/:id" element={<ComingSoon title="Renewal" />} />}
              <Route path="settings" element={<Settings />} />
              <Route path="settings/:section" element={<Settings />} />
              {!LIVE && later.filter((p) => !p.owner || isOwner).map((p) => <Route key={p.key} path={`${p.to.replace('/coach/', '')}/*`} element={<ComingSoon title={p.label} />} />)}
              <Route path="*" element={<Navigate to="/coach" replace />} />
            </Routes>
          </Suspense>
        </main>
        <nav className="cc-phonebar" aria-label="Clarity Coach">
          <button type="button" className="cc-round" aria-label="Today" aria-current={pathname === '/coach' ? 'page' : undefined} onClick={() => { setMenu(false); navigate('/coach'); }}>{HOME}</button>
          <button type="button" className="cc-round cc-round--mark" aria-label={menu ? 'Close the menu' : 'Menu'} aria-expanded={menu} onClick={() => setMenu((v) => !v)}><BoldCrosshair size={32} /></button>
          {!LIVE && <button type="button" className="cc-round" aria-label="Calendar" aria-current={pathname.startsWith('/coach/calendar') ? 'page' : undefined} onClick={() => { setMenu(false); navigate('/coach/calendar'); }}>{CALENDAR}</button>}
        </nav>
        <Menu open={menu} onClose={() => setMenu(false)} onSignOut={signOut.start} />
        <Search open={search} onClose={() => setSearch(false)} />
        <Bell open={bell} onClose={() => setBell(false)} />
        {signOut.choice}
      </div>
    </CoachPortalContext.Provider>
  );
}
