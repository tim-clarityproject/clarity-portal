import { getLocalDateKey } from '../dateFormatter';

// What a coach portal page's first screen asks for (coach first screen run, 24 Nov 2026): which page an address opens
// on, the days its calendar covers and the clients it names. Plain functions with no database, shared by the app's
// opening reads (earlyScreen.js) and store.js, and checked by tests/performance/coach-first-screen.test.mjs.

export const DAY_MS = 24 * 60 * 60 * 1000;
/** The sessions' split (057): the calendar's window starts 6 weeks back. */
export const CAL_BACK_DAYS = 42;
/** The tables that say each coach migration is there (049, 050, 051, 052, 059), in order. */
export const PROBE_TABLES = ['client_profiles', 'coach_todos', 'coach_cal_items', 'coach_lead_stages', 'coach_google_calendars'];
export const SCREEN_NOT_YET_KEY = 'clarity-coach-screen-not-yet';

/** Which page's first screen an address opens on: 'today', 'clients', 'client', 'calendar', or null (any other page). */
export function screenKindOf(pathname = '') {
  const p = String(pathname).replace(/\/+$/, '');
  if (p === '/coach') return 'today';
  if (p === '/coach/clients') return 'clients';
  if (/^\/coach\/clients\/[0-9a-f-]{36}$/i.test(p)) return 'client';
  if (p === '/coach/calendar') return 'calendar';
  return null;
}

// Date keys, as calendar.js counts them (UTC arithmetic on the key itself, never the device's clock).
const keyMs = (key) => Date.parse(`${key}T00:00:00Z`);
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const plusDays = (key, n) => keyOf(keyMs(key) + n * DAY_MS);
const mondayOf = (key) => plusDays(key, -((new Date(keyMs(key)).getUTCDay() + 6) % 7));

/**
 * The first and last day a calendar view shows, with weekends (calendar.js's viewRange, which it must match:
 * tests/performance/coach-first-screen.test.mjs checks the two against each other).
 */
export function viewDays(view, day) {
  if (view === 'day') return [day, day];
  if (view === 'schedule') return [day, plusDays(day, 27)];
  if (view === 'month') {
    const first = `${day.slice(0, 7)}-01`;
    const next = new Date(keyMs(first));
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = plusDays(keyOf(next.getTime()), -1);
    return [mondayOf(first), plusDays(mondayOf(last), 6)];
  }
  return [mondayOf(day), plusDays(mondayOf(day), 6)];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** The instants a first screen's calendar covers: a day either side of the next week, or the weeks the calendar shows. */
export function screenWindow(kind, nowMs, search = '', todayKey = getLocalDateKey()) {
  if (kind !== 'calendar') return [nowMs - DAY_MS, nowMs + 8 * DAY_MS];
  const params = new URLSearchParams(search || '');
  const asked = params.get('day');
  const day = asked && DAY_RE.test(asked) && keyOf(keyMs(asked)) === asked ? asked : todayKey;
  const view = params.get('view');
  // With no view in the address, the phone's Schedule and the laptop's week together (the page decides by its width).
  const ranges = ['day', 'week', 'month', 'schedule'].includes(view) ? [viewDays(view, day)] : [viewDays('week', day), viewDays('schedule', day)];
  const from = ranges.map((r) => r[0]).sort()[0];
  const to = ranges.map((r) => r[1]).sort().at(-1);
  // As store.js's ensureCalRange reads a view: two days before it and three after, so every zone sees whole days. The
  // next-call bar's own days (a day back, eight on) are always in it too, whichever weeks the calendar opens on.
  return [Math.min(keyMs(from) - 2 * DAY_MS, nowMs - DAY_MS), Math.max(keyMs(to) + 3 * DAY_MS, nowMs + 8 * DAY_MS)];
}

/** The clients a page's address names (a client's page wants every one of that client's sessions with its first screen). */
export function profilesOf(pathname = '') {
  const m = /^\/coach\/clients\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(String(pathname));
  return m ? [m[1].toLowerCase()] : [];
}
