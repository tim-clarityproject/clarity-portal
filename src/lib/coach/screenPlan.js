import { getLocalDateKey } from '../dateFormatter';

// What a coach portal page's first screen asks for (coach first screen run, 24 Nov 2026): which page an address opens
// on, the days its calendar covers and the clients it names. Plain functions with no database, shared by the app's
// opening reads (earlyScreen.js) and store.js, and checked by tests/performance/coach-first-screen.test.mjs.

export const DAY_MS = 24 * 60 * 60 * 1000;
/** The sessions' split (057): the calendar's window starts 6 weeks back. */
export const CAL_BACK_DAYS = 42;
/** The tables that say each coach migration is there (049, 050, 051, 052, 059, 061), in order. */
export const PROBE_TABLES = ['client_profiles', 'coach_todos', 'coach_cal_items', 'coach_lead_stages', 'coach_google_calendars', 'agreements'];
export const SCREEN_NOT_YET_KEY = 'clarity-coach-screen-not-yet';

/**
 * Which page's first screen an address opens on: 'today', 'clients', 'client', 'calendar', 'finances' (the owner's
 * Overview, Money and Cash flow), or null (any other page).
 */
export function screenKindOf(pathname = '') {
  const p = String(pathname).replace(/\/+$/, '');
  if (p === '/coach') return 'today';
  if (/^\/coach\/finances(\/(money|cash-flow))?$/.test(p)) return 'finances';
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
  const own = [keyMs(from) - 2 * DAY_MS, keyMs(to) + 3 * DAY_MS];
  const both = [Math.min(own[0], nowMs - DAY_MS), Math.max(own[1], nowMs + 8 * DAY_MS)];
  // A day far from today (a link to 1900, say): the weeks shown alone, inside 060's 400 days (the break-it tester).
  return both[1] - both[0] > 390 * DAY_MS ? own : both;
}

/** The clients a page's address names (a client's page wants every one of that client's sessions with its first screen). */
export function profilesOf(pathname = '') {
  const m = /^\/coach\/clients\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(String(pathname));
  return m ? [m[1].toLowerCase()] : [];
}

// ---------------------------------------------------------------- Finances' first screen (Phase 6b run 2)

// What the owner's Finances (Overview, Money and Cash flow) draws first, read as the app opens and side by side: the
// small tables its figures come from (062's settings, targets, sectors, outgoings, deadlines and statements; 061's
// invoices, payments, credit notes and signed versions; 052's organisations' deals for repeating income). Each is the
// owner's own plain read, under its table's own rules. What needs names, leads or the whole calendar waits.
export const FINANCE_SCREEN_TABLES = ['finance_settings', 'finance_targets', 'finance_sectors', 'finance_outgoing_groups', 'finance_outgoings',
  'company_deadlines', 'associate_statements', 'invoices', 'payments', 'credit_notes', 'agreement_versions', 'organisation_deals'];
/** store.js's "062 isn't there yet" mark, remembered an hour. */
export const FINANCE_NOT_YET_KEY = 'clarity-coach-062-not-yet';
/** Associates' sessions for Finances: 3 months back (the 3-month average) to a year ahead (the forecast), in 058's pieces. */
export const FINANCE_BACK_MS = 100 * DAY_MS;
export const FINANCE_AHEAD_MS = 400 * DAY_MS;
export const ASSOC_PIECE_MS = 60 * DAY_MS;
/** The [from, to] instants of each of 058's reads that together cover from to to (it answers at most 63 days a call). */
export function assocPieces(from, to) {
  const out = [];
  for (let a = from; a < to; a += ASSOC_PIECE_MS) out.push([a, Math.min(to, a + ASSOC_PIECE_MS)]);
  return out;
}

const addMonth = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
/**
 * The months whose delivered minutes Finances reads (financeParts.jsx's minutesMonths, which it must match: checked by
 * tests/performance/coach-first-screen.test.mjs): this financial year so far, and the 3 before this month.
 */
export function financeMinuteMonths(todayKey, startMonth = 5) {
  const now = String(todayKey).slice(0, 7);
  const s = Number(startMonth) >= 1 && Number(startMonth) <= 12 ? Number(startMonth) : 5;
  const month = Number(now.slice(5, 7));
  const back = (month - s + 12) % 12;
  const fy = [];
  for (let i = back; i >= 0; i -= 1) fy.push(addMonth(now, -i));
  return [...new Set([addMonth(now, -3), addMonth(now, -2), addMonth(now, -1), ...fy])].sort();
}
