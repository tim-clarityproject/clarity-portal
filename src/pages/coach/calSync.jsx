import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../lib/readShare';
import { deviceKey, readJson, removeKey, writeJson } from '../../lib/deviceStore';
import { deviceZone } from '../../lib/time/index.js';
import { coachPartialNow, coachState, newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import {
  calendarOfEvent, coachZoneOf, conflictWords, CONNECT_WORDS, MOVED_IN_GOOGLE, removedForSync, restoredForSync, seenMoved, SYNC_AFTER_SAVE_MS, SYNC_EVERY_MS, syncRowOver, syncWait, T,
} from '../../lib/coach/calendar';
import { chooseAdapters, googleStandIn, serverStatus, syncOnce, zoomOnce, zoomStandIn } from '../../lib/coach/connect/index.js';
import { busyOnce, TG } from '../../lib/coach/googleBusy';
import { askServer } from '../../lib/coach/connect/server.js';
import { supabase } from '../../lib/supabase';
import { TextLink, useCoachPortal } from './parts';
import './calSync.css';

// Keeping the portal's calendar in step with Google Calendar and Zoom
// (Phase 6a run 3, step 3). One loop for the whole coach portal, mounted by
// CoachApp: a round when the portal opens, every few minutes while the tab
// shows (never hidden), soon after a change is made here (once its Undo has
// passed), and when the connection comes back. A round that gets no answer
// backs off like the offline queue. Every rule is calendar.js's and the
// round itself is connect/sync.js's (syncOnce, zoomOnce): this file only
// runs it and hands its rows to the store.
//
// Which services it talks to is decided in one place (connect/index.js):
// the real one where the server says it is connected, otherwise nothing.
// On a build that isn't the live site a coach can switch a stand-in on in
// Settings, My calendars, so all of this can be walked with no key: the
// stand-in is kept on this device only and never talks to anything.
//
// Nothing here sends anything by itself: with the real Google Calendar an
// invite goes out through Google when a call with guests is saved, as the
// coach asked for by saving it.

const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;
const NOTHING = Object.freeze({
  on: false, invites: false, zoom: false, status: {}, standIns: {}, conflicts: [], problem: null, lastAt: null, reconnect: false,
  after: () => {}, setEditing: () => {}, removed: () => {}, restored: (rows) => rows, setStandIn: () => {}, connect: async () => null, disconnect: async () => false, refresh: () => {},
  google: false, soon: () => {},
});
const CalSyncContext = createContext(NOTHING);

/** The calendar's sync, for a page: { on, invites, conflicts, problem, after(), setEditing(id), removed(list), restored(rows), … }. */
export const useCalSync = () => useContext(CalSyncContext);

const metaKey = (userId) => deviceKey('cache', userId, 'coach-sync');
const standKey = (userId, name) => deviceKey('cache', userId, `coach-standin-${name}`);
const keepAt = (key) => ({ read: () => readJson(key), write: (state) => { writeJson(key, state); } });
const readMeta = (userId) => { const m = readJson(metaKey(userId)); return m && typeof m === 'object' ? { token: m.token ?? null, removed: Array.isArray(m.removed) ? m.removed : [], gone: Array.isArray(m.gone) ? m.gone : [], zoomSent: m.zoomSent && typeof m.zoomSent === 'object' ? m.zoomSent : {} } : { token: null, removed: [], gone: [], zoomSent: {} }; };

/** The stand-ins as this device keeps them now (made fresh each time, so every tab reads the same calendar). */
function standInsNow(userId) {
  const google = googleStandIn({ keep: keepAt(standKey(userId, 'google')) });
  // A stand-in started again (another device, a cleared browser) has never heard of an older event: it makes it anew.
  const update = google.updateEvent;
  google.updateEvent = async (id, event, options) => {
    try { return await update(id, event, options); } catch (error) { if (error?.code !== 'not_found' || event?.status === 'cancelled') throw error; return google.createEvent(event, options); }
  };
  return { google, zoom: zoomStandIn({ keep: keepAt(standKey(userId, 'zoom')) }) };
}

/**
 * The loop. Mounted once by CoachApp, inside the coach portal's own context.
 */
export function CalSync({ children }) {
  const p = useCoachPortal();
  const { userId, coach } = p;
  const coachZone = coachZoneOf(p.settings, deviceZone());
  const latest = useRef(null);
  latest.current = { coachZone, coachId: coach.id };

  const [status, setStatus] = useState({ google_calendar: false, zoom: false, google_ready: false });
  const [standIns, setStandIns] = useState(() => (LIVE ? {} : readJson(standKey(userId, 'on')) || {}));
  const [conflicts, setConflicts] = useState([]);
  const [problem, setProblem] = useState(null);
  // Connected before 059: Google needs the coach to connect once more (run 8's 5); Settings offers it.
  const [reconnect, setReconnect] = useState(false);
  const [lastAt, setLastAt] = useState(null);
  const editing = useRef(null);
  const running = useRef(false);
  const again = useRef(false);
  const failures = useRef(0);
  const timer = useRef(null);
  const roundRef = useRef(null);

  // Which services: the real ones the server says are connected; on a build that isn't live, a stand-in when switched on.
  const realGoogle = status.google_calendar === true;
  const realZoom = status.zoom === true;
  const useGoogle = realGoogle || (!LIVE && standIns.google === true);
  const useZoom = realZoom || (!LIVE && standIns.zoom === true);
  const on = useGoogle || useZoom;
  const wiring = useRef(null);
  wiring.current = { realGoogle, realZoom, useGoogle, useZoom, status };

  const refresh = useCallback(() => {
    // Only the live site's server ever has a key, so nothing else is asked.
    if (!LIVE) return;
    askServer({ kind: 'status' }).then(async (answer) => {
      const s = await serverStatus(async () => answer);
      setStatus({ ...s, google_ready: answer?.ok === true && answer.google_ready === true });
    }).catch(() => {});
  }, []);
  // Asked once the page has drawn with all its data (coach first screen run): never ahead of a first screen's own read.
  useEffect(() => { if (p.whole) refresh(); }, [refresh, userId, p.whole]);

  const schedule = useCallback((ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => roundRef.current?.(), ms);
  }, []);

  const round = useCallback(async () => {
    const w = wiring.current;
    if (!w.useGoogle && !w.useZoom) return;
    // Only a first screen here so far (a first visit; store.js): a round compares the whole calendar with Google's, so
    // it waits for the rest, and runs once it is in (the effect below).
    if (coachPartialNow(userId)) { again.current = true; return; }
    if (document.visibilityState === 'hidden' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return; // a hidden tab never asks; coming back does
    if (running.current) { again.current = true; return; }
    running.current = true;
    const work = async () => {
      const state = coachState(userId);
      const { coachId, coachZone: zone } = latest.current;
      const mine = (table) => rowsOf(state, table).filter((r) => r.coach_id === coachId);
      const items = mine(T.items);
      const guests = mine(T.guests);
      const sessions = mine(T.sessions);
      const meta = readMeta(userId);
      const stand = !LIVE && (standIns.google || standIns.zoom) ? standInsNow(userId) : { google: null, zoom: null };
      const chosen = chooseAdapters(w.status, { ask: askServer, standIns: { google: stand.google || { real: false }, zoom: stand.zoom || { real: false } } });
      const google = w.realGoogle ? chosen.google : (w.useGoogle ? stand.google : null);
      const zoom = w.realZoom ? chosen.zoom : (w.useZoom ? stand.zoom : null);
      // The real Google Calendar reads the coach's main calendar, which is Work; the stand-in's events name their own.
      const calendars = w.realGoogle ? {} : { personal: 'personal', family: 'family' };
      const res = google
        ? await syncOnce({ adapters: { google, zoom }, items, guests, sessions, syncToken: meta.token, removed: meta.removed, editingId: editing.current, now: new Date(), coachZone: zone, coachId, newId, calendarOf: (event) => calendarOfEvent(event, calendars) })
        : await zoomOnce({ zoom, items, removed: meta.removed, sent: meta.zoomSent });

      // The coach may have changed a row while the round was away: their newer change is kept (calendar.js's syncRowOver).
      const now = coachState(userId);
      const before = (table, id) => (state.rows[table] || {})[id] || null;
      const current = (table, id) => { const row = (now.rows[table] || {})[id]; return row && !now.marks[table]?.[id]?.gone ? row : null; };
      const save = res.save.map(([table, row]) => [table, syncRowOver(current(table, row.id), row, before(table, row.id))]).filter(([, row]) => row);
      if (save.length) await saveRows(userId, save);
      for (const [table, id] of res.remove) await removeRow(userId, table, id);

      // Run 8: the account's other calendars (Personal, Family, …), READ ONLY: their list, and the events of each one
      // the coach has switched on, kept as busy times (googleBusy.js). Nothing is ever written to them.
      let busyProblem = null;
      if (google) {
        const latestState = coachState(userId);
        const mineNow = (table) => rowsOf(latestState, table).filter((r) => r.coach_id === coachId);
        const busy = await busyOnce({ google, calendars: mineNow(TG.calendars), busyTimes: mineNow(TG.busy), coachId, coachZone: zone, now: new Date() });
        // Busy times go before their calendars; calendars are saved before their busy times.
        for (const [table, id] of busy.remove.filter(([t]) => t === TG.busy)) await removeRow(userId, table, id);
        // A switch flipped while Google was being read is the coach's newest choice: the round never puts the old one back
        // (the run 8 break-it tester: a calendar renamed in Google in the same round switched Family off again).
        const switchNow = new Map(rowsOf(coachState(userId), TG.calendars).filter((r) => r.coach_id === coachId).map((r) => [r.id, r.busy_on === true]));
        const calRows = busy.save.filter(([t]) => t === TG.calendars)
          .map(([t, r]) => [t, !r.is_main && switchNow.has(r.id) ? { ...r, busy_on: switchNow.get(r.id) } : r]);
        if (calRows.length) await saveRows(userId, calRows);
        const busyRows = busy.save.filter(([t]) => t === TG.busy);
        if (busyRows.length) await saveRows(userId, busyRows);
        for (const [table, id] of busy.remove.filter(([t]) => t === TG.calendars)) await removeRow(userId, table, id);
        busyProblem = busy.problem;
        setReconnect(busy.reconnect === true);
      }

      // What this round was told to delete is done (unless it stopped part-way); anything noted since stays for the next.
      const after = readMeta(userId);
      const told = new Set(meta.removed.map((r) => r.id));
      writeJson(metaKey(userId), {
        token: google ? res.syncToken ?? null : after.token,
        removed: res.problem ? after.removed : after.removed.filter((r) => !told.has(r.id)),
        gone: res.problem ? after.gone : [...after.gone, ...meta.removed].slice(-200),
        zoomSent: google ? after.zoomSent : res.sent,
      });
      setConflicts(res.conflicts || []);
      setProblem(res.problem || busyProblem || null);
      if (!res.problem) setLastAt(new Date().toISOString());
      return !res.problem && !busyProblem;
    };
    let ok = false;
    try {
      // One tab at a time on a device, so two tabs never both make the same event.
      ok = typeof navigator !== 'undefined' && navigator.locks?.request
        ? await navigator.locks.request(`clarity-coach-sync:${userId}`, { ifAvailable: true }, (lock) => (lock ? work() : true))
        : await work();
    } catch {
      ok = false;
    }
    running.current = false;
    failures.current = ok ? 0 : failures.current + 1;
    if (again.current) { again.current = false; schedule(ok ? 600 : syncWait(failures.current)); } else schedule(syncWait(failures.current));
  }, [userId, standIns, schedule]);
  roundRef.current = round;

  // On open, every few minutes while the tab shows, when it is shown again, and when the connection is back.
  useEffect(() => {
    if (!on) { clearTimeout(timer.current); return undefined; }
    schedule(800);
    const shown = () => { if (document.visibilityState === 'visible') schedule(400); };
    document.addEventListener('visibilitychange', shown);
    window.addEventListener('online', shown);
    return () => { clearTimeout(timer.current); document.removeEventListener('visibilitychange', shown); window.removeEventListener('online', shown); };
  }, [on, schedule]);

  // The rest of a first visit's data has come in (store.js's partial): a round held back for it runs now.
  const wasPartial = useRef(p.partial);
  useEffect(() => {
    const was = wasPartial.current;
    wasPartial.current = p.partial;
    if (was && !p.partial && on) schedule(400);
  }, [p.partial, on, schedule]);

  const onRef = useRef(on);
  onRef.current = on;
  /** A change was saved here: a round follows once its Undo has passed (`soon`: straight away). */
  const after = useCallback(({ soon = false } = {}) => { if (onRef.current) schedule(soon ? 500 : SYNC_AFTER_SAVE_MS); }, [schedule]);
  /** The item open in the edit panel (null when it closes): nothing changes under it. */
  const setEditing = useCallback((id) => {
    const was = editing.current;
    editing.current = id || null;
    if (was && !id && onRef.current) schedule(700); // closed: a change held back for it comes in
  }, [schedule]);
  /** Rows a plan removed here: what must go from Google and Zoom. */
  const removed = useCallback((removeList, items) => {
    const list = removedForSync(removeList, items);
    if (!list.length) return;
    const meta = readMeta(userId);
    writeJson(metaKey(userId), { ...meta, removed: [...meta.removed.filter((r) => !list.some((x) => x.id === r.id)), ...list] });
  }, [userId]);
  /** Rows an Undo is putting back: nothing of theirs is deleted any more, and one already deleted there starts again. */
  const restored = useCallback((saveList) => {
    const meta = readMeta(userId);
    const ids = new Set((saveList || []).filter(([t]) => t === T.items).map(([, r]) => r.id));
    if (!ids.size) return saveList;
    const rows = restoredForSync(saveList, meta.gone);
    writeJson(metaKey(userId), { ...meta, removed: meta.removed.filter((r) => !ids.has(r.id)), gone: meta.gone.filter((r) => !ids.has(r.id)) });
    return rows;
  }, [userId]);

  const api = useMemo(() => ({
    on,
    /** Guests really get invites: the real Google Calendar is connected. */
    invites: realGoogle,
    zoom: useZoom,
    status, standIns, conflicts, problem, lastAt, after, setEditing, removed, restored, reconnect,
    /** Google Calendar is in use (the real one, or a stand-in on a build that isn't live): My calendars lists its calendars. */
    google: useGoogle,
    /** A round soon (a calendar was just switched on, so its busy times are read straight away). */
    soon: () => { if (onRef.current) schedule(400); },
    /** Settings, My calendars, on a build that isn't live: a stand-in on or off. */
    setStandIn: (name, value) => {
      if (LIVE) return;
      const next = { ...standIns, [name]: value === true };
      writeJson(standKey(userId, 'on'), next);
      if (!value) { removeKey(standKey(userId, name)); if (name === 'google') { removeKey(metaKey(userId)); forgetGoogleCalendars(userId, coach.id); } }
      setStandIns(next);
    },
    /** Starts connecting the coach's own Google account: the address of Google's consent page, or null. */
    connect: async () => {
      const answer = await fetchConnect({ kind: 'start' });
      return answer?.ok === true && typeof answer.url === 'string' && /^https:\/\/accounts\.google\.com\//.test(answer.url) ? answer.url : null;
    },
    disconnect: async () => {
      const answer = await fetchConnect({ kind: 'disconnect' });
      if (answer?.ok !== true) return false;
      removeKey(metaKey(userId));
      forgetGoogleCalendars(userId, coach.id);
      refresh();
      return true;
    },
    refresh,
  }), [on, realGoogle, useGoogle, useZoom, schedule, status, standIns, conflicts, problem, lastAt, after, setEditing, removed, restored, userId, coach.id, refresh, reconnect]);

  // For the browser suites and a tester's console, never on the live site: the stand-ins and a round on demand.
  useEffect(() => {
    if (LIVE) return undefined;
    window.__clarityCalSync = { google: () => standInsNow(userId).google, zoom: () => standInsNow(userId).zoom, round: () => roundRef.current?.(), meta: () => readMeta(userId) };
    return () => { delete window.__clarityCalSync; };
  }, [userId]);

  return <CalSyncContext.Provider value={api}>{children}</CalSyncContext.Provider>;
}

/**
 * Google Calendar disconnected (or its stand-in switched off): the other calendars and their busy times go too, so
 * nothing read from an account that is no longer connected keeps blocking a time (run 8).
 */
function forgetGoogleCalendars(userId, coachId) {
  const state = coachState(userId);
  const mine = (table) => rowsOf(state, table).filter((r) => r.coach_id === coachId);
  (async () => {
    for (const b of mine(TG.busy)) await removeRow(userId, TG.busy, b.id);
    for (const c of mine(TG.calendars)) await removeRow(userId, TG.calendars, c.id);
  })().catch(() => {});
}

/** Asks the portal's server about connecting Google (api/coach-calendar-connect.js), with the coach's own sign-in. */
async function fetchConnect(body) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    const res = await apiFetch('/api/coach-calendar-connect', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * "Moved in Google Calendar", where a call that was moved there is shown
 * (its panel, the brief, its session), with "Got it" to take the mark off.
 * @param {{ item: object|null }} props the call's calendar item
 */
export function MovedInGoogle({ item }) {
  const { userId } = useCoachPortal();
  if (!item?.moved_in_google_at) return null;
  return (
    <div className="cc-moved" role="status">
      <p className="cc-quiet">{MOVED_IN_GOOGLE}.</p>
      <TextLink aria-label={`${CONNECT_WORDS.gotIt}: ${MOVED_IN_GOOGLE}`} onClick={() => saveRow(userId, T.items, seenMoved(item)).catch(() => {})}>{CONNECT_WORDS.gotIt}</TextLink>
    </div>
  );
}

/** The line shown in an item's panel while a change from Google waits for it. */
export function useConflictLine(itemId) {
  const sync = useCalSync();
  return itemId ? conflictWords(sync.conflicts, itemId) : null;
}

export { SYNC_EVERY_MS };
