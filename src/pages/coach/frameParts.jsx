import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loading, useBackCloses, useToast } from '../../components/design';
import { isPhoneWidth } from '../../components/design/pageLock';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { findCalItems } from '../../lib/coach/store';
import { searchResults, withRecent } from '../../lib/coach/model';
import { menuFor, SETTINGS_SECTIONS } from '../../lib/coach/navigation';
import { coachZoneOf, searchItems } from '../../lib/coach/calendar';
import { boardSearchItems, boardsFor, LEAD_SEARCH_ACTIONS, leadSearchItems } from '../../lib/coach/crm';
import { networkPageOf } from '../../lib/coach/networkData';
import { NETWORK_SEARCH_ACTIONS, networkSearchItems, searchQuery } from '../../lib/coach/network';
import { deviceZone } from '../../lib/time/index.js';
import { useCoachPortal } from './parts';

// The coach portal's search (the overlay menu was removed in Polish 1, Stage A: the frame's menu column replaced it; moved here from CoachApp.jsx in tidy follow-up 4, part 1, item 1): their own
// part of the app, loaded once the frame has drawn (or the moment either is opened), so a first visit never waits for
// search's index, the CRM's leads and boards, or Network's counts before the frame and the page show. Nothing in them
// changed.

const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;

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

/** One box finds people, pages and actions as it is typed, with recent items before anything is typed. */
export function Search({ open, onClose }) {
  const { userId, isOwner, clients, groups, workshops, organisations, admin, adminReady, coaches, coach, calItems, calGuests, settings, todayKey, leads, leadStages, boards, partial } = useCoachPortal();
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
          {/* Only a first screen is here yet (a first visit): what was typed is looked for once the rest is in, never
              "Nothing matches" for someone whose row hasn't arrived (coach first screen run). */}
          {(partial || !adminReady) && q.trim() && <Loading label="Loading your search" />}
          {!((partial || !adminReady) && q.trim()) && groupsShown.length === 0 && <p className="cc-jump-none">Nothing matches “{q.trim()}”.</p>}
          {!((partial || !adminReady) && q.trim()) && groupsShown.map((g) => (
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
