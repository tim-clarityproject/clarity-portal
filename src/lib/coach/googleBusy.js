// Your Personal and Family calendars from Google (Phase 6a run 8, item 2;
// migration 059). The rules in one place, pure, so every one is a unit test
// (tests/performance/coach-google-busy.test.mjs):
//
//   - Settings, My calendars lists every calendar on the coach's Google
//     account (`calendarRowsFrom`). The main one is kept in step both ways,
//     as since run 3 (connect/sync.js); every other one is OFF until the
//     coach switches it on.
//   - A calendar switched on is read for its events (`busyOnce`), READ ONLY:
//     nothing here, and nothing an adapter is asked from here, ever writes
//     to it. Each event becomes a busy time: its title and times only
//     (`busyRowsFrom`). An event marked free in Google, cancelled, or
//     declined by the coach is not busy.
//   - Busy times of the calendars switched on (`activeBusy`) show on the
//     coach's own calendar as soft filled tiles with their titles
//     (calendar.js's busyEntries) and block those times for booking pages,
//     Offer times and polls (calendar.js's busySpans; the database's
//     _cal_free_times for anything booked from outside). Other people only
//     ever get free start times.
//
// The rows are coach_google_calendars and coach_busy_times (059), the
// coach's alone. Each row's id is worked out from what it is (`stableId`),
// so two tabs or two devices make the same row and never two.
import { addDays, instantAt, isZone } from '../time/index.js';

export const TG = Object.freeze({ calendars: 'coach_google_calendars', busy: 'coach_busy_times' });

const DAY_MS = 86400000;
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const ms = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** How far a calendar is read: from yesterday to 13 weeks ahead (a booking page reaches 12 at most). */
export const BUSY_BACK_DAYS = 1;
export const BUSY_AHEAD_DAYS = 91;
/** The most busy times kept from one calendar, and from all of them (059 refuses the 5,001st). */
export const BUSY_PER_CALENDAR = 2000;
export const BUSY_MAX = 5000;
export const CALENDARS_MAX = 100;
const TITLE_MAX = 300;
const LONGEST_MS = 31 * DAY_MS;

/**
 * A UUID worked out from a text, the same every time and on every device
 * (four 32-bit FNV-1a hashes with different seeds, shaped as a version 5
 * UUID). Not for secrets: only so one calendar or one event is one row.
 */
export function stableId(text) {
  const s = String(text);
  const part = (seed) => {
    let h = (0x811c9dc5 ^ seed) >>> 0;
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };
  const hex = [part(0x1), part(0x2f), part(0x3b7), part(0x4d29)].join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const calendarRowId = (coachId, googleId) => stableId(`gcal|${coachId}|${googleId}`);
export const busyRowId = (calendarId, eventId) => stableId(`gbusy|${calendarId}|${eventId}`);

/** A calendar's name as the coach sees it in Google (their own name for it first). */
const nameOf = (c) => clean(c?.summaryOverride || c?.name || c?.summary).slice(0, 200) || 'Calendar';

/**
 * The coach's calendar rows after reading Google's list: a new calendar is
 * added switched OFF (the main one is never switched: it is kept in step as
 * calendar items), one already there keeps its switch, one gone from Google
 * goes (with its busy times). Names and order follow Google.
 * @param {{ id: string, summary?: string, summaryOverride?: string, primary?: boolean }[]} listed
 * @param {object[]} existing the coach's coach_google_calendars rows
 * @returns {{ rows: object[], save: object[], remove: object[] }} rows: every calendar now, in order
 */
export function calendarRowsFrom(listed, existing = [], coachId) {
  const seen = new Set();
  const list = (Array.isArray(listed) ? listed : []).filter((c) => {
    const id = typeof c?.id === 'string' ? c.id : '';
    if (!id || id.length > 1024 || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, CALENDARS_MAX);
  // The main calendar first, then Google's own order.
  list.sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
  const mine = (existing || []).filter((r) => r && r.coach_id === coachId);
  const byGoogle = new Map(mine.map((r) => [r.google_id, r]));
  const rows = [];
  const save = [];
  list.forEach((c, position) => {
    const was = byGoogle.get(c.id);
    const isMain = Boolean(c.primary);
    const next = {
      id: was?.id || calendarRowId(coachId, c.id), coach_id: coachId, google_id: c.id, name: nameOf(c), is_main: isMain,
      busy_on: isMain ? false : was?.busy_on === true, position,
    };
    rows.push(next);
    if (!was || was.name !== next.name || was.is_main !== next.is_main || was.busy_on !== next.busy_on || was.position !== next.position) save.push(was ? { ...was, ...next } : next);
  });
  const remove = mine.filter((r) => !seen.has(r.google_id));
  return { rows, save, remove };
}

/** The window a calendar is read for: { from, to }. */
export function busyWindow(now) {
  const t = ms(now);
  return { from: new Date(t - BUSY_BACK_DAYS * DAY_MS), to: new Date(t + BUSY_AHEAD_DAYS * DAY_MS) };
}

/**
 * Whether an event read from Google makes the coach busy: not cancelled, not
 * marked free ("Show as: Free"), and not declined by the coach.
 */
export function eventIsBusy(event) {
  if (!event || event.status === 'cancelled' || event.transparency === 'transparent') return false;
  const me = (event.attendees || []).find((a) => a && a.self);
  return !(me && me.responseStatus === 'declined');
}

/** An event's start and end as instants; an all-day one runs from midnight to midnight on the coach's own clock. */
export function eventSpan(event, coachZone) {
  const zone = isZone(coachZone) ? coachZone : 'Europe/London';
  const day = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const startDay = day(event?.start?.date);
  const endDay = day(event?.end?.date);
  if (startDay) {
    const last = endDay && endDay > startDay ? endDay : addDays(startDay, 1);
    return { start: instantAt(startDay, '00:00', zone), end: instantAt(last, '00:00', zone), allDay: true };
  }
  const start = new Date(event?.start?.dateTime ?? NaN);
  const end = new Date(event?.end?.dateTime ?? NaN);
  return { start, end, allDay: false };
}

/**
 * The busy times one calendar's events make: its title and times only,
 * nothing else of the event (no guests, place, notes or link). Events that
 * don't make the coach busy, have no usable times, or run over 31 days are
 * left out; the earliest 2,000 are kept.
 * @param {object[]} events Google's events (single times: recurring ones arrive one time each)
 * @param {{ id: string }} calendar the coach_google_calendars row
 */
export function busyRowsFrom(events, calendar, { coachId, coachZone }) {
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(events) ? events : []) {
    const eventId = typeof e?.id === 'string' ? e.id : '';
    if (!eventId || eventId.length > 1024 || seen.has(eventId) || !eventIsBusy(e)) continue;
    const span = eventSpan(e, coachZone);
    const a = span.start.getTime();
    const z = span.end.getTime();
    if (!Number.isFinite(a) || !Number.isFinite(z) || z <= a || z - a > LONGEST_MS) continue;
    seen.add(eventId);
    out.push({
      id: busyRowId(calendar.id, eventId), coach_id: coachId, calendar_id: calendar.id, event_id: eventId,
      title: clean(e.summary).slice(0, TITLE_MAX) || 'Busy', starts_at: span.start.toISOString(), ends_at: span.end.toISOString(), all_day: span.allDay,
    });
  }
  return out.sort((x, y) => ms(x.starts_at) - ms(y.starts_at)).slice(0, BUSY_PER_CALENDAR);
}

/** What changed between the rows kept and the rows wanted: { save, remove } (rows to save; rows to remove). */
export function busyDiff(kept = [], wanted = []) {
  const have = new Map((kept || []).map((r) => [r.id, r]));
  const want = new Set(wanted.map((r) => r.id));
  const same = (a, b) => a.title === b.title && ms(a.starts_at) === ms(b.starts_at) && ms(a.ends_at) === ms(b.ends_at) && Boolean(a.all_day) === Boolean(b.all_day);
  return {
    save: wanted.filter((r) => !have.has(r.id) || !same(have.get(r.id), r)).map((r) => (have.has(r.id) ? { ...have.get(r.id), ...r } : r)),
    remove: (kept || []).filter((r) => !want.has(r.id)),
  };
}

/**
 * The busy times that count now: those of the coach's calendars switched on
 * (never the main one), each with its calendar's name. Everything that shows
 * or blocks a time takes this list.
 */
export function activeBusy(busyTimes = [], calendars = [], coachId = null) {
  const on = new Map((calendars || []).filter((c) => c && c.busy_on === true && !c.is_main && (coachId == null || c.coach_id === coachId)).map((c) => [c.id, c]));
  return (busyTimes || []).filter((b) => b && on.has(b.calendar_id) && (coachId == null || b.coach_id === coachId)
    && Number.isFinite(ms(b.starts_at)) && Number.isFinite(ms(b.ends_at)) && ms(b.ends_at) > ms(b.starts_at))
    .map((b) => ({ ...b, calendar_name: on.get(b.calendar_id).name || 'Calendar' }));
}

/**
 * One round of reading the coach's other Google calendars. READ ONLY: it
 * asks the adapter for the calendars' list and each switched-on calendar's
 * events, and nothing else. It saves nothing itself: it returns the rows for
 * the page to hand to the store.
 * @param {object} a
 * @param {{ listCalendars?: Function, listBusy?: Function }} a.google the adapter (real or stand-in)
 * @param {object[]} a.calendars the coach's coach_google_calendars rows   @param {object[]} a.busyTimes their coach_busy_times rows
 * @returns {Promise<{ save: [string, object][], remove: [string, string][], calendars: object[], problem: string|null }>}
 */
export async function busyOnce({ google, calendars = [], busyTimes = [], coachId, coachZone, now }) {
  const out = { save: [], remove: [], calendars: calendars || [], problem: null };
  if (!google || typeof google.listCalendars !== 'function' || typeof google.listBusy !== 'function' || !coachId) return out;
  const mineBusy = (busyTimes || []).filter((b) => b && b.coach_id === coachId);
  try {
    const listed = await google.listCalendars();
    const plan = calendarRowsFrom(listed, calendars, coachId);
    out.calendars = plan.rows;
    for (const r of plan.save) out.save.push([TG.calendars, r]);
    const live = new Set(plan.rows.map((r) => r.id));
    // Busy times of a calendar gone from Google, or of no calendar now: gone too (before their calendar).
    for (const b of mineBusy) if (!live.has(b.calendar_id)) out.remove.push([TG.busy, b.id]);
    const win = busyWindow(now);
    let room = BUSY_MAX;
    for (const c of plan.rows) {
      const kept = mineBusy.filter((b) => b.calendar_id === c.id);
      if (c.is_main || !c.busy_on) {
        for (const b of kept) out.remove.push([TG.busy, b.id]);
        continue;
      }
      const events = await google.listBusy({ calendarId: c.google_id, timeMin: win.from.toISOString(), timeMax: win.to.toISOString() });
      const wanted = busyRowsFrom(events, c, { coachId, coachZone }).slice(0, Math.max(0, room));
      room -= wanted.length;
      const d = busyDiff(kept, wanted);
      for (const r of d.save) out.save.push([TG.busy, r]);
      for (const r of d.remove) out.remove.push([TG.busy, r.id]);
    }
    for (const r of plan.remove) out.remove.push([TG.calendars, r.id]);
  } catch {
    out.problem = BUSY_WORDS.problem;
  }
  return out;
}

/** The words of My calendars' Google part and of a busy tile. */
/** The two groups in My calendars (Settings and the calendar's panel): the portal's own calendars, then Google's. */
export const CALENDAR_GROUPS = Object.freeze({ portal: 'In the portal', google: 'From Google Calendar' });

export const BUSY_WORDS = Object.freeze({
  heading: CALENDAR_GROUPS.google,
  main: 'Kept in step with this calendar both ways',
  note: 'Shows as busy to everyone else',
  off: 'Switch a calendar on to show its events here and keep those times free of bookings.',
  others: 'Clients, associates and booking pages only ever see that the time is busy. The portal never changes these calendars.',
  none: 'Your Google calendars show here once Google Calendar is connected.',
  reading: 'Your Google calendars show here after the next sync.',
  problem: 'Google Calendar didn’t answer, so your other calendars may be out of date. They’ll be read again soon.',
  on: (name) => `${name} shows on your calendar and blocks those times.`,
  offSaved: (name) => `${name} no longer shows or blocks times.`,
});

/** Whether a busy time and a span overlap (for the tests and the panels). */
export const overlaps = (b, start, end) => ms(b.starts_at) < ms(end) && ms(b.ends_at) > ms(start);
