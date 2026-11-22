// The calendar's and booking's rules (Phase 6a run 3; mock-up M11, seq 77;
// calendar-parity.md; time-zone-safeguards.md). The single source of every
// rule and word the calendar and booking pages use, as day.js is for the
// coaching day. Pure functions only: nothing here reads the database, the
// device or the clock by itself, so every rule is a unit test
// (tests/performance/coach-calendar.test.mjs).
//
// Every time goes through the one time library (src/lib/time). A time is a
// UTC instant with the place name of its anchor zone (the client's, for a
// client call); the coach's own clock is `coachZone`, passed in to every
// function that draws or reads a clock (coachZoneOf below).
//
// What a function saves comes back as a PLAN the page hands to the store:
//   { save: [[table, row]…], remove: [[table, id]…], undo: { save, remove },
//     words: the toast, problem: a calm line when nothing may be saved,
//     tell: a drafted note for the client, never sent }
import {
  addDays, clockChanges, clockChangeLine, clockWords, dayKeyWords, daysBetween, holidayLine, instantAt, isZone, onQuarterHour,
  publicHolidayFor, sameZone, seriesCalls, seriesRule, sociable, wallClock, weekdayOf, zoneLabel, zonePlace, morningOf, inTheMorning,
  hourBeforeReminderAt, dayWords as zoneDayWords, timeWords, EARLY_AND_LATE_LABEL, GAP_MINUTES, zoneCountry,
} from '../time/index.js';
import { clean, cut, firstName, minutesWords, parsePeople } from './model.js';
import { SENT_LINE, SESSION_LENGTHS, WEEK_KEYS, isLateCancellation, isLink, newSession, parseQuickAdd, workingDay } from './day.js';

const MIN = 60000;
const HOUR = 3600000;
const DAY_MS = 86400000;
const DAY_MINUTES = 1440;
const ms = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());
const iso = (t) => new Date(t).toISOString();
const p2 = (n) => String(n).padStart(2, '0');
const hhmm = (m) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
const minutesOfTime = (time) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(time || '')); return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null; };
const wallMinutes = (instant, zone) => { const w = wallClock(instant, zone); return w.hour * 60 + w.minute; };
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const partsOf = (day) => day.split('-').map(Number);

/** "Mia", "Mia and Paul", "Mia, Paul and Dana". */
export function joinNames(names) {
  const list = (names || []).filter(Boolean);
  if (list.length < 2) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// ---------------------------------------------------------------- the tables and the coach's own clock

export const T = Object.freeze({
  items: 'coach_cal_items', guests: 'coach_cal_guests', sessions: 'coach_sessions', todos: 'coach_todos', open: 'coach_open_blocks',
  polls: 'coach_polls', pollPeople: 'coach_poll_people', pollOptions: 'coach_poll_options', links: 'coach_booking_links', settings: 'coach_settings',
});
const DATA_KEY = { [T.items]: 'items', [T.guests]: 'guests', [T.sessions]: 'sessions', [T.todos]: 'todos', [T.open]: 'openBlocks', [T.polls]: 'polls', [T.pollPeople]: 'pollPeople', [T.pollOptions]: 'pollOptions', [T.links]: 'bookingLinks' };

export const HOME_ZONE = 'Europe/London';

/** The coach's own clock: the zone in Settings, otherwise the device's, otherwise the UK. Always a place name. */
export const coachZoneOf = (settings, device = null) => [settings?.time_zone, device, HOME_ZONE].find((z) => isZone(z));

const zoneOr = (zone, fallback = HOME_ZONE) => (isZone(zone) ? zone : fallback);

/**
 * What Undo restores for a plan: every row it saves goes back to how it was
 * (or is removed when the plan made it), and every row it removes comes back.
 * @param {{ save?: [string, object][], remove?: [string, string][] }} plan
 * @param {object} data the rows before: { items, guests, sessions, todos, openBlocks, polls, pollPeople, pollOptions, bookingLinks }
 * @returns {{ save: [string, object][], remove: [string, string][] }}
 */
export function undoOf(plan, data = {}) {
  const before = (table, id) => (data[DATA_KEY[table]] || []).find((r) => r.id === id) || null;
  const save = [];
  const remove = [];
  for (const [table, row] of plan.save || []) { const was = before(table, row.id); if (was) save.push([table, was]); else remove.push([table, row.id]); }
  for (const [table, id] of plan.remove || []) { const was = before(table, id); if (was) save.push([table, was]); }
  // Parents go back before their parts (a series before its edited times).
  save.sort((a, b) => Number(Boolean(a[1].series_id || a[1].travel_for || a[1].item_id)) - Number(Boolean(b[1].series_id || b[1].travel_for || b[1].item_id)));
  return { save, remove };
}

const plan = (data, { save = [], remove = [], ...rest }) => ({ save, remove, undo: undoOf({ save, remove }, data), problem: null, ...rest });
const refused = (problem) => ({ save: [], remove: [], undo: { save: [], remove: [] }, problem, words: '' });

// ---------------------------------------------------------------- kinds, colours and names

export const CALL_KINDS = ['client_call', 'chemistry', 'connection'];

/** A calendar item's kinds as people read them, with the colour each is drawn in. */
export const ITEM_KINDS = Object.freeze({
  client_call: { label: 'Client call', colour: 'client' },
  chemistry: { label: 'Chemistry Call', colour: 'chemistry' },
  connection: { label: 'Networking call', colour: 'connection' },
  own_time: { label: 'Your own time', colour: 'other' },
  admin: { label: 'Admin', colour: 'admin' },
  writing: { label: 'Writing', colour: 'writing' },
  event: { label: 'Event', colour: 'other' },
  travel: { label: 'Travel', colour: 'other' },
  other: { label: 'Other', colour: 'other' },
  hold: { label: 'Held for a poll', colour: 'hold' },
});

/**
 * The class each colour is drawn with (the tokens are in tokens.css; never a
 * colour in a page). `dashed`: life, personal and held items are an outline.
 */
export const COLOURS = Object.freeze({
  client: { className: 'cc-cal-tile--client', dashed: false, edged: false },
  chemistry: { className: 'cc-cal-tile--chemistry', dashed: false, edged: false },
  connection: { className: 'cc-cal-tile--connection', dashed: false, edged: true },
  admin: { className: 'cc-cal-tile--admin', dashed: false, edged: true },
  writing: { className: 'cc-cal-tile--writing', dashed: false, edged: true },
  other: { className: 'cc-cal-tile--other', dashed: false, edged: true },
  life: { className: 'cc-cal-tile--life', dashed: true, edged: false },
  hold: { className: 'cc-cal-tile--hold', dashed: true, edged: false },
  open: { className: 'cc-cal-tile--open', dashed: false, edged: false },
});

export const CALENDARS = [{ value: 'work', label: 'Work' }, { value: 'personal', label: 'Personal' }, { value: 'family', label: 'Family' }];
/** Whether one of My calendars is shown (each has a show switch; on unless switched off). */
export const calendarShown = (settings, key) => settings?.calendars?.[key] !== false;
export const PLACES = [{ value: 'zoom', label: 'Zoom' }, { value: 'in_person', label: 'In person' }, { value: 'phone', label: 'Phone' }];
const placeWord = (kind) => PLACES.find((p) => p.value === kind)?.label || '';

/** The colour a calendar item is drawn in: its calendar first (life is dashed), then its kind. */
export function colourOf(item) {
  if (item.kind === 'hold') return 'hold';
  if (item.calendar === 'personal' || item.calendar === 'family') return 'life';
  return ITEM_KINDS[item.kind]?.colour || 'other';
}

// ---------------------------------------------------------------- repeats (a rule in the anchor zone, never a list of dates)

const dow = (day) => weekdayOf(day) % 7; // 0 Sunday to 6 Saturday, as the rule's weekdays
const mondayOf = (day) => addDays(day, 1 - weekdayOf(day));
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "More options": how an item repeats. Custom opens the rule's own fields (interval, weekdays, an end date or a count). */
export const CAL_REPEATS = [
  { value: 'never', label: 'Doesn’t repeat', rule: null },
  { value: 'day', label: 'Every day', rule: { every: 'day' } },
  { value: 'weekday', label: 'Every weekday', rule: { every: 'weekday' } },
  { value: 'week', label: 'Every week', rule: { every: 'week' } },
  { value: 'week2', label: 'Every 2 weeks', rule: { every: 'week', interval: 2 } },
  { value: 'month', label: 'Every month on this date', rule: { every: 'month', by: 'date' } },
  { value: 'month_weekday', label: 'Every month on this weekday', rule: { every: 'month', by: 'weekday' } },
  { value: 'year', label: 'Every year', rule: { every: 'year' } },
  { value: 'custom', label: 'Custom', rule: null },
];
export const REPEAT_SCOPES = [{ value: 'one', label: 'This one' }, { value: 'following', label: 'This and following' }, { value: 'all', label: 'All of them' }];

/** Whether a repeat's rule is one the database keeps (051's coach_cal_repeat_ok). */
export function repeatOk(rule) {
  if (rule == null) return true;
  if (typeof rule !== 'object' || Array.isArray(rule) || !['day', 'weekday', 'week', 'month', 'year'].includes(rule.every)) return false;
  if ('interval' in rule && !(Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= 52)) return false;
  if ('weekdays' in rule && !(Array.isArray(rule.weekdays) && rule.weekdays.length <= 7 && rule.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) return false;
  if ('until' in rule && !(typeof rule.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rule.until))) return false;
  if ('by' in rule && !(['date', 'weekday'].includes(rule.by) && rule.every === 'month')) return false;
  if ('count' in rule && !(Number.isInteger(rule.count) && rule.count >= 1 && rule.count <= 730)) return false;
  return true;
}

/**
 * Which of CAL_REPEATS a rule is ('custom' for anything the short list can't
 * say). When it stops (an end day or a count) is its own choice in the
 * panel, so it never makes a rule 'custom': "Every weekday until Fri 18 Dec"
 * is still 'weekday' (Custom has no weekdays-only or "on this weekday" choice,
 * so reading those as Custom turned them into every day, or a day of the month).
 */
export function calRepeatValue(rule) {
  if (!rule || !rule.every) return 'never';
  const plain = !rule.weekdays?.length;
  const n = Number(rule.interval) || 1;
  if (!plain || n > 2 || (n === 2 && rule.every !== 'week')) return 'custom';
  if (rule.every === 'week') return n === 2 ? 'week2' : 'week';
  if (rule.every === 'month') return rule.by === 'weekday' ? 'month_weekday' : 'month';
  return rule.every;
}

const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['first', 'second', 'third', 'fourth', 'last'];

/** A repeat in words: "Every Monday and Tuesday", "Every 2 weeks", "Every month on the third Tuesday", with "until Fri 18 Dec" or "6 times". */
export function calRepeatWords(rule, firstDay) {
  if (!rule || !rule.every) return '';
  const n = Number(rule.interval) || 1;
  const [, , dd] = partsOf(firstDay);
  let words;
  if (rule.every === 'day') words = n > 1 ? `Every ${n} days` : 'Every day';
  else if (rule.every === 'weekday') words = 'Every weekday';
  else if (rule.every === 'week') {
    const days = (rule.weekdays?.length ? [...rule.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) : [dow(firstDay)]).map((d) => LONG_DAYS[d]);
    words = n > 1 ? `Every ${n} weeks on ${joinNames(days)}` : `Every ${joinNames(days)}`;
  } else if (rule.every === 'month') {
    const on = rule.by === 'weekday' ? `the ${ORDINALS[dd > 28 ? 4 : Math.ceil(dd / 7) - 1]} ${LONG_DAYS[dow(firstDay)]}` : `day ${dd}`;
    words = `Every ${n > 1 ? `${n} months` : 'month'} on ${on}`;
  } else words = n > 1 ? `Every ${n} years` : 'Every year';
  if (rule.count) return `${words}, ${rule.count} ${rule.count === 1 ? 'time' : 'times'}`;
  if (rule.until) return `${words}, until ${dayKeyWords(rule.until)}`;
  return words;
}

/**
 * The days a rule falls on from its first day `d0`, between two day keys
 * (in the item's anchor zone). The JavaScript twin of 051's
 * _cal_occurrences: a monthly repeat on the 31st falls on a shorter
 * month's last day, and a fifth weekday means the last one.
 * @returns {string[]} day keys, earliest first
 */
export function ruleDays(rule, d0, fromDay, toDay) {
  const n = Math.max(1, Number(rule.interval) || 1);
  const [y0, m0, dd0] = partsOf(d0);
  const start = rule.count ? d0 : (fromDay > d0 ? fromDay : d0);
  const end = rule.until && rule.until < toDay ? rule.until : toDay;
  const out = [];
  let nth = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const [y, m, dd] = partsOf(d);
    let ok = false;
    if (rule.every === 'day') ok = daysBetween(d0, d) % n === 0;
    else if (rule.every === 'weekday') ok = weekdayOf(d) < 6;
    else if (rule.every === 'week') ok = (daysBetween(mondayOf(d0), mondayOf(d)) / 7) % n === 0 && (rule.weekdays?.length ? rule.weekdays.includes(dow(d)) : dow(d) === dow(d0));
    else if (rule.every === 'month') {
      ok = ((y * 12 + m) - (y0 * 12 + m0)) % n === 0 && (rule.by === 'weekday'
        ? dow(d) === dow(d0) && (dd0 > 28 ? addDays(d, 7).slice(5, 7) !== d.slice(5, 7) : Math.ceil(dd / 7) === Math.ceil(dd0 / 7))
        : dd === Math.min(dd0, lastDayOf(y, m)));
    } else if (rule.every === 'year') ok = (y - y0) % n === 0 && m === m0 && dd === Math.min(dd0, lastDayOf(y, m));
    if (!ok) continue;
    nth += 1;
    if (rule.count && nth > rule.count) break;
    out.push(d);
  }
  return out;
}

/** The day and clock time a series first starts, in its own anchor zone. */
const firstOf = (item) => wallClock(new Date(item.starts_at), zoneOr(item.time_zone));

/**
 * Every time the items fall between two instants: a one-off once, a repeat
 * once for each day its rule gives (worked out in the item's anchor zone,
 * so 07:30 New York time stays 07:30 there whatever either country's clocks
 * do), less the times that were edited or deleted on their own ("this one").
 * @returns {{ item: object, key: string, on: string|null, startsAt: Date, endsAt: Date, repeats: boolean }[]} earliest first
 */
export function occurrences(items, from, to) {
  const a = ms(from);
  const z = ms(to);
  const list = (items || []).filter((i) => i && !Number.isNaN(ms(i.starts_at)) && !Number.isNaN(ms(i.ends_at)));
  const standIns = new Set(list.filter((i) => i.series_id && i.occurrence_on).map((i) => `${i.series_id}:${i.occurrence_on}`));
  const out = [];
  for (const i of list) {
    const s = ms(i.starts_at);
    const e = ms(i.ends_at);
    if (!i.repeat_rule) {
      if (!i.removed && s < z && e > a) out.push({ item: i, key: i.id, on: i.occurrence_on ?? null, startsAt: new Date(s), endsAt: new Date(e), repeats: Boolean(i.series_id) });
      continue;
    }
    if (s >= z) continue;
    const zone = zoneOr(i.time_zone);
    const first = wallClock(new Date(s), zone);
    const fromDay = addDays(wallClock(new Date(a), zone).date, -33);
    const toDay = wallClock(new Date(z), zone).date;
    for (const d of ruleDays(i.repeat_rule, first.date, fromDay, toDay)) {
      const at = instantAt(d, first.time, zone).getTime();
      if (!(at < z && at + (e - s) > a)) continue;
      if (standIns.has(`${i.id}:${d}`)) continue;
      out.push({ item: i, key: `${i.id}:${d}`, on: d, startsAt: new Date(at), endsAt: new Date(at + (e - s)), repeats: true });
    }
  }
  return out.sort((x, y) => x.startsAt - y.startsAt);
}

// ---------------------------------------------------------------- what to draw

export const ONE_LINE_UNDER = 45; // minutes: anything shorter sits on one line
export const FULL_TITLE_AFTER_MS = 300; // hovering a cut-off item shows its full title after 0.3 seconds
export const DEFAULT_TODO_MINUTES = 30;

/**
 * A client's own time inside their call's block: "9:00 am New York" (12-hour
 * for the US and Canada), and the day too when it differs from the coach's:
 * "Mon 16 Nov, 08:00 Sydney".
 */
export function clientTimeWords(instant, clientZone, coachZone) {
  const words = `${clockWords(instant, clientZone)} ${zonePlace(clientZone)}`;
  return wallClock(instant, clientZone).date === wallClock(instant, coachZone).date ? words : `${zoneDayWords(instant, clientZone)}, ${words}`;
}

/**
 * The last fact on a call's row (Today, Plan my day): for a client in another
 * zone their own time and city ("9:45 am Chicago", 12-hour for the US and
 * Canada, with their day when it differs), otherwise where it is ("Zoom").
 */
export function callPlaceWords(session, clientZone, coachZone) {
  const away = isZone(clientZone) && isZone(coachZone) && !sameZone(clientZone, coachZone);
  return away ? clientTimeWords(session.starts_at, clientZone, coachZone) : session.place || 'Zoom';
}

/** "09:45 to 12:00" on the coach's own clock. */
export const spanWords = (startsAt, endsAt, coachZone) => `${wallClock(startsAt, coachZone).time} to ${wallClock(endsAt, coachZone).time}`;

/** A join link, only ever an https address: the item's own, or a session's place when that is a link. */
export const joinLink = (item, session = null) => [item?.meeting_link, session?.place].find((v) => isLink(v)) || null;

const entry = (base, coachZone) => {
  const minutes = Math.round((base.endsAt - base.startsAt) / MIN);
  const allDay = Boolean(base.allDay);
  return {
    minutes, allDay, oneLine: !allDay && minutes < ONE_LINE_UNDER, dashed: COLOURS[base.colour].dashed, colourClass: COLOURS[base.colour].className,
    fromDay: allDay ? base.fromDay : wallClock(base.startsAt, coachZone).date,
    toDay: allDay ? base.toDay : wallClock(new Date(Math.max(base.startsAt.getTime(), base.endsAt.getTime() - 1)), coachZone).date,
    isCall: false, busy: true, done: false, clientZone: null, clientWords: '', sub: '', movedInGoogle: false, item: null, session: null, todo: null, block: null, booking: null, on: null, repeats: false,
    ...base,
  };
};

/**
 * Everything to draw between two of the coach's days: calendar items (each
 * time a repeat comes round), sessions that have no calendar item yet (run
 * 2's, added from a client's page), to-dos given a time, and Open for calls
 * blocks. Items of a calendar that is switched off are left out (they still
 * count as busy for booking: busySpans).
 * @param {{ items?, sessions?, todos?, openBlocks?, bookings?, clients?, groups?, callTypes? }} data
 * @param {{ fromDay: string, toDay: string, coachZone: string, settings?: object, showTodos?: boolean, showOpen?: boolean }} view
 * @returns {object[]} entries, earliest first: { key, type: 'item'|'session'|'todo'|'open', kind, colour, colourClass, dashed, title, sub,
 *   startsAt, endsAt, minutes, allDay, fromDay, toDay, oneLine, isCall, clientZone, clientWords, movedInGoogle, done, item, session, todo, block, booking, on, repeats }
 */
export function calendarEntries({ items = [], sessions = [], todos = [], openBlocks = [], bookings = [], clients = [], groups = [], callTypes = [] } = {}, { fromDay, toDay, coachZone, settings = null, showTodos = true, showOpen = false }) {
  const from = instantAt(fromDay, '00:00', coachZone);
  const to = instantAt(addDays(toDay, 1), '00:00', coachZone);
  const out = [];
  const timed = items.filter((i) => !i.all_day);
  for (const o of occurrences(timed, from, to)) {
    const i = o.item;
    if (!calendarShown(settings, i.calendar || 'work')) continue;
    const colour = colourOf(i);
    const isCall = CALL_KINDS.includes(i.kind);
    const booking = bookings.find((b) => b.item_id === i.id && b.status !== 'cancelled') || null;
    const type = booking ? callTypes.find((t) => t.id === booking.call_type_id) : null;
    const clientZone = isCall && isZone(i.time_zone) && !sameZone(i.time_zone, coachZone) ? i.time_zone : null;
    const sub = i.kind === 'hold' ? 'Held for a poll'
      : colour === 'life' ? (i.calendar === 'family' ? 'Family' : 'Personal')
        : i.group_id ? 'Group'
          : type ? type.name
            : isCall ? placeWord(i.place_kind || 'zoom')
              : i.kind === 'own_time' || i.kind === 'admin' || i.kind === 'writing' || i.kind === 'travel' ? '' : (placeWord(i.place_kind) || ITEM_KINDS[i.kind]?.label || '');
    out.push(entry({
      key: o.key, type: 'item', kind: i.kind, colour, title: i.title, sub, startsAt: o.startsAt, endsAt: o.endsAt, isCall, busy: i.busy !== false, clientZone,
      clientWords: clientZone ? clientTimeWords(o.startsAt, clientZone, coachZone) : '', movedInGoogle: Boolean(i.moved_in_google_at || booking?.moved_in_google_at),
      item: i, booking, on: o.on, repeats: o.repeats, session: i.session_id ? sessions.find((s) => s.id === i.session_id) || null : null,
    }, coachZone));
  }
  // All-day items and items over several days sit on their own days, whatever the zone (a conference on 23 and 24 Nov is those two days everywhere).
  for (const i of items.filter((x) => x.all_day && !x.removed)) {
    if (!calendarShown(settings, i.calendar || 'work')) continue;
    const zone = zoneOr(i.time_zone, coachZone);
    const first = i.starts_on || wallClock(i.starts_at, zone).date;
    const last = i.ends_on || wallClock(new Date(ms(i.ends_at) - 1), zone).date;
    const span = Math.max(0, daysBetween(first, last));
    const days = i.repeat_rule ? ruleDays(i.repeat_rule, first, addDays(fromDay, -span), toDay) : [first];
    for (const d of days) {
      const end = addDays(d, span);
      if (d > toDay || end < fromDay) continue;
      if (i.repeat_rule && items.some((x) => x.series_id === i.id && x.occurrence_on === d)) continue;
      const colour = colourOf(i);
      out.push(entry({
        key: i.repeat_rule ? `${i.id}:${d}` : i.id, type: 'item', kind: i.kind, colour, title: i.title, sub: colour === 'life' ? (i.calendar === 'family' ? 'Family' : 'Personal') : (ITEM_KINDS[i.kind]?.label || ''),
        startsAt: instantAt(d, '00:00', coachZone), endsAt: instantAt(addDays(end, 1), '00:00', coachZone), allDay: true, fromDay: d, toDay: end, busy: i.busy !== false, item: i, on: i.repeat_rule ? d : (i.occurrence_on ?? null), repeats: Boolean(i.repeat_rule || i.series_id),
      }, coachZone));
    }
  }
  // A session with no calendar item yet (added from a client's or a group's page) still shows as the call it is.
  const linked = new Set(items.map((i) => i.session_id).filter(Boolean));
  for (const s of sessions) {
    if (linked.has(s.id) || (s.outcome && s.outcome !== 'held')) continue;
    const startsAt = new Date(s.starts_at);
    const endsAt = new Date(startsAt.getTime() + (Number(s.minutes) || 60) * MIN);
    if (Number.isNaN(startsAt.getTime()) || !(startsAt < to && endsAt > from)) continue;
    const client = clients.find((c) => c.id === s.profile_id) || null;
    const group = groups.find((g) => g.id === s.group_id) || null;
    const clientZone = client && isZone(client.time_zone) && !sameZone(client.time_zone, coachZone) ? client.time_zone : null;
    out.push(entry({
      key: `session:${s.id}`, type: 'session', kind: 'client_call', colour: 'client', title: group?.name || client?.name || 'Session', sub: group ? 'Group' : (isLink(s.place) || !clean(s.place) ? 'Zoom' : 'In person'),
      startsAt, endsAt, isCall: true, clientZone, clientWords: clientZone ? clientTimeWords(startsAt, clientZone, coachZone) : '', session: s,
    }, coachZone));
  }
  if (showTodos) {
    for (const t of todos) {
      const start = minutesOfTime(t.planned_time);
      if (!t.planned_on || start == null || t.planned_on < fromDay || t.planned_on > toDay) continue;
      const startsAt = instantAt(t.planned_on, hhmm(start), coachZone);
      out.push(entry({
        key: `todo:${t.id}`, type: 'todo', kind: 'todo', colour: 'other', title: t.title, sub: 'To-do', startsAt, endsAt: new Date(startsAt.getTime() + (Number(t.minutes) || DEFAULT_TODO_MINUTES) * MIN),
        busy: false, done: Boolean(t.done_at), todo: t,
      }, coachZone));
    }
  }
  if (showOpen) {
    for (const b of openBlocks) {
      const startsAt = new Date(b.starts_at);
      const endsAt = new Date(b.ends_at);
      if (!(startsAt < to && endsAt > from)) continue;
      out.push(entry({ key: `open:${b.id}`, type: 'open', kind: 'open', colour: 'open', title: 'Open', sub: '', startsAt, endsAt, busy: false, block: b }, coachZone));
    }
  }
  return out.sort((a, b) => a.startsAt - b.startsAt || Number(b.allDay) - Number(a.allDay) || b.minutes - a.minutes || String(a.title).localeCompare(String(b.title)));
}

/**
 * The words inside a tile, as M11 draws them. A client call in another zone
 * leads with both clocks ("14:00, 9:00 am New York"; narrow, the client's
 * alone); held and life items say what they are; anything else its place and
 * its span ("Zoom, 12:30 to 13:30"). Under 45 minutes it is one line: the
 * title, then the start time only if it fits.
 * A call moved in Google Calendar says so on its own line (`moved`).
 * @returns {{ title: string, line: string, time: string, oneLine: boolean, moved?: string }}
 */
export function entryLines(e, { coachZone, narrow = false } = {}) {
  const start = e.allDay ? '' : wallClock(e.startsAt, coachZone).time;
  if (e.allDay) return { title: e.title, line: e.sub, time: '', oneLine: true };
  if (e.oneLine) return { title: e.title, line: '', time: start, oneLine: true };
  const span = spanWords(e.startsAt, e.endsAt, coachZone);
  let line;
  if (e.clientWords) line = narrow ? e.clientWords : `${start}, ${e.clientWords}`;
  else if (e.colour === 'hold' || e.colour === 'life' || e.type === 'open') line = e.type === 'open' ? span : e.sub;
  else if (narrow) line = e.sub || span;
  else line = e.sub ? `${e.sub}, ${span}` : span;
  return { title: e.title, line, time: start, oneLine: false, ...(e.movedInGoogle ? { moved: MOVED_IN_GOOGLE } : {}) };
}

/** What a screen reader hears for a tile: "Sam Okafor, Tue 17 Nov, 12:30 to 13:30, Zoom". */
export function entryLabel(e, coachZone) {
  const when = e.allDay ? (e.fromDay === e.toDay ? `${dayKeyWords(e.fromDay)}, all day` : `${dayKeyWords(e.fromDay)} to ${dayKeyWords(e.toDay)}`) : `${zoneDayWords(e.startsAt, coachZone)}, ${spanWords(e.startsAt, e.endsAt, coachZone)}`;
  return [e.title, when, e.clientWords, e.sub, e.done ? 'done' : '', e.movedInGoogle ? MOVED_IN_GOOGLE : ''].filter(Boolean).join(', ');
}

export const MOVED_IN_GOOGLE = 'Moved in Google Calendar';

/**
 * Calendar items as the header's search finds them: by title, person
 * (guests, the place) or note. Each opens its own day: a repeat's next time
 * from today, anything else the day it is on. Held times and removed times
 * are left out.
 * @returns {{ key: string, title: string, kind: string, also: string, to: string }[]}
 */
export function searchItems({ items = [], guests = [], coachZone, todayKey }) {
  return items.filter((i) => !i.removed && i.kind !== 'hold' && clean(i.title)).map((i) => {
    let at = new Date(i.starts_at);
    if (i.repeat_rule && wallClock(at, coachZone).date < todayKey) {
      const next = occurrences([i], instantAt(todayKey, '00:00', coachZone), instantAt(addDays(todayKey, 370), '00:00', coachZone))[0];
      if (next) at = next.startsAt;
    }
    const day = i.all_day && i.starts_on && !i.repeat_rule ? i.starts_on : wallClock(at, coachZone).date;
    const who = guests.filter((g) => g.item_id === i.id).map((g) => `${g.name || ''} ${g.email || ''}`).join(' ');
    return { key: `i:${i.id}`, title: i.title, kind: i.all_day ? dayKeyWords(day) : `${dayKeyWords(day)}, ${wallClock(at, coachZone).time}`, also: `${who} ${i.notes || ''} ${i.location || ''}`, to: `/coach/calendar?view=day&day=${day}` };
  });
}

// ---------------------------------------------------------------- the views

export const CAL_VIEWS = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'schedule', label: 'Schedule' }];
/** The view a screen starts on: Schedule on a phone, the week everywhere else. */
export const startingView = (phone) => (phone ? 'schedule' : 'week');
export const SCHEDULE_DAYS = 28;

/** "16 to 20 Nov", "30 Nov to 4 Dec", "28 Dec 2026 to 1 Jan 2027". */
export function daysTitle(fromDay, toDay) {
  const [y1, m1, d1] = partsOf(fromDay);
  const [y2, m2, d2] = partsOf(toDay);
  if (fromDay === toDay) return dayKeyWords(fromDay);
  if (y1 !== y2) return `${d1} ${MONTHS[m1 - 1]} ${y1} to ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  return m1 === m2 ? `${d1} to ${d2} ${MONTHS[m2 - 1]}` : `${d1} ${MONTHS[m1 - 1]} to ${d2} ${MONTHS[m2 - 1]}`;
}

/** The weeks a month's grid shows, Monday first: [[{ day, number, inMonth }]], with or without weekends. */
export function monthGrid(day, { weekends = true } = {}) {
  const [y, m] = partsOf(day);
  const first = `${y}-${p2(m)}-01`;
  const last = `${y}-${p2(m)}-${p2(lastDayOf(y, m))}`;
  const weeks = [];
  for (let monday = mondayOf(first); monday <= last; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: weekends ? 7 : 5 }, (_, i) => { const d = addDays(monday, i); return { day: d, number: partsOf(d)[2], inMonth: d >= first && d <= last }; }));
  }
  return weeks;
}

/**
 * The days a view shows and its title.
 * @param {'day'|'week'|'month'|'schedule'} view
 * @returns {{ fromDay: string, toDay: string, days: string[], title: string }}
 */
export function viewRange(view, day, { weekends = false } = {}) {
  const run = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
  if (view === 'day') return { fromDay: day, toDay: day, days: [day], title: dayKeyWords(day) };
  if (view === 'month') {
    const days = monthGrid(day, { weekends }).flat().map((c) => c.day);
    const [y, m] = partsOf(day);
    return { fromDay: days[0], toDay: days[days.length - 1], days, title: `${LONG_MONTHS[m - 1]} ${y}` };
  }
  if (view === 'schedule') { const days = run(day, SCHEDULE_DAYS); return { fromDay: day, toDay: days[days.length - 1], days, title: daysTitle(mondayOf(day), addDays(mondayOf(day), weekends ? 6 : 4)) }; }
  const days = run(mondayOf(day), weekends ? 7 : 5);
  return { fromDay: days[0], toDay: days[days.length - 1], days, title: daysTitle(days[0], days[days.length - 1]) };
}

/** The day a view moves to with Previous (-1) or Next (1): a day (skipping a hidden weekend), a week or a month on. */
export function stepView(view, day, direction, { weekends = false } = {}) {
  const dir = direction < 0 ? -1 : 1;
  if (view === 'month') {
    const [y, m, d] = partsOf(day);
    const t = new Date(Date.UTC(y, m - 1 + dir, 1));
    const yy = t.getUTCFullYear();
    const mm = t.getUTCMonth() + 1;
    return `${yy}-${p2(mm)}-${p2(Math.min(d, lastDayOf(yy, mm)))}`;
  }
  if (view !== 'day') return addDays(day, 7 * dir);
  let next = addDays(day, dir);
  while (!weekends && weekdayOf(next) > 5) next = addDays(next, dir);
  return next;
}

/** The mini month: its grid with today and the chosen day marked, and its title ("November 2026"). */
export function miniMonth(day, { todayKey = null, chosen = null } = {}) {
  const [y, m] = partsOf(day);
  return { title: `${LONG_MONTHS[m - 1]} ${y}`, heads: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], weeks: monthGrid(day).map((w) => w.map((c) => ({ ...c, today: c.day === todayKey, chosen: c.day === chosen, label: dayKeyWords(c.day, { long: true }) }))) };
}

const onDay = (e, day) => e.fromDay <= day && e.toDay >= day;
/** An entry that fills the all-day row: an all-day item, or one a day or longer. */
const isBanner = (e) => e.allDay || e.minutes >= DAY_MINUTES;

/**
 * One day's column: the all-day row, the timed tiles laid side by side
 * where they overlap, and the Open for calls blocks under them. Minutes are
 * from midnight on the coach's own clock; a tile that runs over midnight is
 * drawn in both days (`startsBefore`, `endsAfter`).
 * @returns {{ banners: object[], tiles: { entry, startMin, endMin, column, columns, startsBefore, endsAfter }[], open: { entry, startMin, endMin }[] }}
 */
export function layoutDay(entries, day, coachZone) {
  const todays = (entries || []).filter((e) => onDay(e, day));
  const piece = (e) => {
    const startsBefore = e.fromDay < day;
    const endsAfter = e.toDay > day;
    const startMin = startsBefore ? 0 : wallMinutes(e.startsAt, coachZone);
    const endMin = endsAfter ? DAY_MINUTES : Math.max(startMin + 15, wallMinutes(new Date(e.endsAt.getTime() - 1), coachZone) + 1);
    return { entry: e, startMin, endMin: Math.min(DAY_MINUTES, endMin), startsBefore, endsAfter };
  };
  const tiles = todays.filter((e) => !isBanner(e) && e.type !== 'open').map(piece).sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  // Tiles that overlap share the width: each takes the first free column, and a run of overlapping tiles has as many columns as it needs.
  let cluster = [];
  let clusterEnd = -1;
  const close = () => { const columns = Math.max(0, ...cluster.map((t) => t.column)) + 1; for (const t of cluster) t.columns = columns; cluster = []; };
  for (const t of tiles) {
    if (cluster.length && t.startMin >= clusterEnd) close();
    const taken = new Set(cluster.filter((o) => o.endMin > t.startMin).map((o) => o.column));
    let column = 0;
    while (taken.has(column)) column += 1;
    t.column = column;
    cluster.push(t);
    clusterEnd = Math.max(clusterEnd, t.endMin);
  }
  if (cluster.length) close();
  return { banners: todays.filter(isBanner), tiles, open: todays.filter((e) => e.type === 'open').map(piece) };
}

/**
 * The all-day row across a run of days: each all-day or several-day item as
 * one bar, in the first lane that is free.
 * @returns {{ entry, from: number, span: number, lane: number, startsBefore: boolean, endsAfter: boolean }[]}
 */
export function bannerRows(entries, days) {
  const first = days[0];
  const last = days[days.length - 1];
  const lanes = [];
  return (entries || []).filter((e) => isBanner(e) && e.fromDay <= last && e.toDay >= first)
    .sort((a, b) => a.fromDay.localeCompare(b.fromDay) || daysBetween(b.fromDay, b.toDay) - daysBetween(a.fromDay, a.toDay))
    .map((e) => {
      const shown = days.filter((d) => onDay(e, d));
      if (!shown.length) return null;
      const from = days.indexOf(shown[0]);
      const to = days.indexOf(shown[shown.length - 1]);
      let lane = lanes.findIndex((end) => end < from);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = to;
      return { entry: e, from, span: to - from + 1, lane, startsBefore: e.fromDay < first, endsAfter: e.toDay > last };
    }).filter(Boolean);
}

/** A day's entries in the order a list shows them: all-day first, then by start. */
export const entriesOn = (entries, day) => (entries || []).filter((e) => onDay(e, day) && e.type !== 'open').sort((a, b) => Number(isBanner(b)) - Number(isBanner(a)) || a.startsAt - b.startsAt);

/** A month cell: the first few of the day's entries and how many more ("2 more"). */
export function monthCell(entries, day, max = 3) {
  const all = entriesOn(entries, day);
  const more = Math.max(0, all.length - max);
  return { shown: all.slice(0, max), more, moreWords: more ? `${more} more` : '', label: `${dayKeyWords(day, { long: true })}, ${all.length === 1 ? '1 item' : `${all.length} items`}` };
}

/**
 * The Schedule: a scrolling list of what's next, a day at a time (the
 * phone's default view). Days with nothing are left out, except today.
 * Each row has the small square of its tile's colour (dashed for held and
 * life items, with an edge on grey and pale ones).
 * @returns {{ day, title, today: boolean, empty: string, rows: { entry, time, title, lines: string[], length: string, square: { className, dashed, edged } }[] }[]}
 */
export function scheduleDays(entries, { days, coachZone, todayKey }) {
  return days.map((day) => {
    const rows = entriesOn(entries, day).map((e) => ({
      entry: e, time: isBanner(e) ? 'All day' : (e.fromDay < day ? '00:00' : wallClock(e.startsAt, coachZone).time), title: e.title,
      // (A line that only repeats the title, "Writing" under Writing, is left out: 5e rule 29ap.)
      lines: [e.clientWords, e.sub || (e.type === 'item' ? ITEM_KINDS[e.kind]?.label : ''), e.movedInGoogle ? MOVED_IN_GOOGLE : ''].filter((l) => l && clean(l).toLowerCase() !== clean(e.title).toLowerCase()),
      length: isBanner(e) ? '' : minutesWords(e.minutes),
      square: { className: e.colourClass, dashed: e.dashed, edged: COLOURS[e.colour].edged },
    }));
    return { day, title: day === todayKey ? `Today, ${dayKeyWords(day)}` : dayKeyWords(day), today: day === todayKey, empty: rows.length ? '' : 'Nothing is planned today.', rows };
  }).filter((d) => d.rows.length || d.today);
}

/** Where the "now" line sits: the day and the minutes from midnight on the coach's own clock; null when that day isn't showing. */
export function nowLine(now, coachZone, days) {
  const w = wallClock(now, coachZone);
  const index = (days || []).indexOf(w.date);
  return index < 0 ? null : { day: w.date, index, minutes: w.hour * 60 + w.minute, time: w.time };
}

/**
 * The hours a week or day grid shows: 08:00 to 21:00, opened out to hold
 * every timed item on the days showing and the working hours themselves;
 * `whole` is midnight to midnight. Whole hours, so the hour labels line up.
 * @param {object[]} entries from calendarEntries
 * @param {{ days: string[], coachZone: string, hours?: object, whole?: boolean }} view `hours`: workingHours()'s shape (the editing mode's own, while it is open)
 * @returns {{ fromHour: number, toHour: number, fromMin: number, toMin: number }}
 */
export function hoursWindow(entries, { days = [], coachZone, hours = null, whole = false }) {
  let from = whole ? 0 : 8 * 60;
  let to = whole ? DAY_MINUTES : 21 * 60;
  if (!whole) {
    for (const day of days) {
      for (const t of layoutDay(entries, day, coachZone).tiles) { from = Math.min(from, t.startMin); to = Math.max(to, t.endMin); }
      const h = hours?.[weekKeyOf(day)];
      if (h) { from = Math.min(from, minutesOfTime(h.from) - 60); to = Math.max(to, minutesOfTime(h.to) + 60); }
    }
  }
  const fromHour = Math.max(0, Math.floor(from / 60));
  const toHour = Math.min(24, Math.ceil(to / 60));
  return { fromHour, toHour, fromMin: fromHour * 60, toMin: toHour * 60 };
}

// ---------------------------------------------------------------- two time columns

/** The second time column's own cities; Settings' list (Time zones) is added to them. */
export const SECOND_ZONES = ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Denver', 'America/Toronto', 'Asia/Dubai', 'Asia/Singapore'];

/** The zones the second column can be switched to: its own seven, then Settings' own list, never the coach's own zone. */
export function secondZoneChoices(settings, coachZone) {
  const seen = [];
  for (const z of [...SECOND_ZONES, ...(Array.isArray(settings?.time_zones) ? settings.time_zones : [])]) {
    if (isZone(z) && !sameZone(z, coachZone) && !seen.some((s) => sameZone(s, z))) seen.push(z);
  }
  return seen.map((z) => ({ value: z, label: zonePlace(z) }));
}

/**
 * The zone the second column starts on: the next client call outside the
 * coach's own zone; with none coming, the one chosen in Settings; otherwise
 * New York.
 */
export function startingSecondZone({ items = [], sessions = [], clients = [], settings = null, now, coachZone }) {
  const from = new Date(now);
  const coming = calendarEntries({ items, sessions, clients }, { fromDay: wallClock(from, coachZone).date, toDay: addDays(wallClock(from, coachZone).date, 60), coachZone, showTodos: false })
    .find((e) => e.isCall && e.kind === 'client_call' && e.clientZone && e.endsAt > from);
  if (coming) return coming.clientZone;
  return isZone(settings?.second_time_zone) && !sameZone(settings.second_time_zone, coachZone) ? settings.second_time_zone : SECOND_ZONES[0];
}

/** The heading over a time column: the place's name ("UK", "Chicago"), never letters. */
export const zoneColumnLabel = (zone) => zonePlace(zone);

/**
 * The hour labels down both columns for one of the coach's days. Each row is
 * an hour on the coach's own clock; the second column says what that moment
 * is in its own zone, so on a day either place changes its clocks an hour
 * repeats or is missed there (`jump`), and never drifts.
 * @returns {{ hour: number, minutes: number, coach: string, other: string, otherWords: string, otherDay: number, jump: boolean, skipped: boolean }[]}
 */
export function hourLabels(day, coachZone, otherZone, { fromHour = 0, toHour = 24 } = {}) {
  const out = [];
  let before = null;
  for (let hour = fromHour; hour < toHour; hour += 1) {
    const at = instantAt(day, `${p2(hour)}:00`, coachZone);
    const here = wallClock(at, coachZone);
    const there = otherZone ? wallClock(at, otherZone) : null;
    const total = there ? daysBetween(day, there.date) * DAY_MINUTES + there.hour * 60 + there.minute : null;
    out.push({
      hour, minutes: hour * 60, coach: `${p2(hour)}:00`, other: there ? there.time : '', otherWords: there ? clockWords(at, otherZone) : '', otherDay: there ? daysBetween(day, there.date) : 0,
      jump: before != null && total != null && total - before !== 60, skipped: here.hour !== hour,
    });
    before = total;
  }
  return out;
}

// ---------------------------------------------------------------- working hours, set on the calendar

export const HOURS_STEP = 15;
export const HOURS_HELP = 'Drag the top or bottom of each day to set your working hours.';
export const HOURS_SAVED = 'Working hours saved.';
const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const REFERENCE_MONDAY = '2026-11-16'; // any Monday: only its weekdays are read

/**
 * The working week as the calendar edits it, read exactly as day.js's
 * workingDay reads it (so Today's over-full line and booking follow the
 * same hours): { mon: { from, to } | null, … } with a day off as null.
 */
export function workingHours(settings) {
  return Object.fromEntries(WEEK_ORDER.map((key, i) => { const h = workingDay(settings, addDays(REFERENCE_MONDAY, i)); return [key, h ? { from: h.from, to: h.to } : null]; }));
}

/** The week key ('mon'…'sun') of a day. */
export const weekKeyOf = (day) => WEEK_ORDER[weekdayOf(day) - 1];

/**
 * A handle moved in the editing mode: the day's start or finish set to the
 * nearest quarter hour, never closer than 15 minutes to the other handle,
 * from 00:00 to 23:45. A day off gets 09:00 to 17:00 when a handle is put on it.
 * @param {object} hours workingHours()'s shape
 * @param {string} key 'mon'…'sun'
 * @param {'from'|'to'} edge
 * @param {number} minutes from midnight
 */
export function moveHours(hours, key, edge, minutes) {
  const day = hours[key] || { from: '09:00', to: '17:00' };
  const from = minutesOfTime(day.from);
  const to = minutesOfTime(day.to);
  const snapped = Math.round(minutes / HOURS_STEP) * HOURS_STEP;
  const next = edge === 'from' ? { from: hhmm(Math.min(Math.max(0, snapped), to - HOURS_STEP)), to: day.to } : { from: day.from, to: hhmm(Math.max(Math.min(DAY_MINUTES - HOURS_STEP, snapped), from + HOURS_STEP)) };
  return { ...hours, [key]: next };
}

/** An arrow key on a handle: 15 minutes earlier (-1) or later (1). */
export function nudgeHours(hours, key, edge, steps) {
  const day = hours[key] || { from: '09:00', to: '17:00' };
  return moveHours(hours, key, edge, minutesOfTime(day[edge]) + steps * HOURS_STEP);
}

/** What Done saves: the settings' working_hours (a day off is left out, as 049 keeps it). */
export const hoursToSave = (hours) => ({ working_hours: Object.fromEntries(WEEK_ORDER.filter((k) => hours[k]).map((k) => [k, { from: hours[k].from, to: hours[k].to }])) });

/** "Start 09:00", "Finish 18:30": a handle's words. */
export const hoursHandleWords = (edge, time) => `${edge === 'from' ? 'Start' : 'Finish'} ${time}`;

/** The softly hatched spans of a day, outside the working hours: minutes from midnight. A day off is hatched whole. */
export function outOfHours(settings, day) {
  const h = workingDay(settings, day);
  if (!h) return [{ fromMin: 0, toMin: DAY_MINUTES }];
  return [{ fromMin: 0, toMin: minutesOfTime(h.from) }, { fromMin: minutesOfTime(h.to), toMin: DAY_MINUTES }].filter((s) => s.toMin > s.fromMin);
}

// ---------------------------------------------------------------- making, moving and resizing

export const DRAG_STEP = 15; // dragging: quarter hours
export const TYPE_STEP = 5; // typed times: 5-minute steps
export const CLICK_MINUTES = 60; // a single click opens the quick add for an hour

/** Minutes snapped to a step (15 while dragging, 5 when typed). */
export const snapMinutes = (minutes, step = DRAG_STEP) => Math.round(minutes / step) * step;

/**
 * A time on the coach's own clock as instants: `startMin` minutes from the
 * day's midnight, for `minutes`. Minutes past midnight carry on into the
 * next day, so a call dragged across midnight keeps its length.
 * @returns {{ starts_at: string, ends_at: string }}
 */
export function timesAt({ day, startMin, minutes, coachZone }) {
  const dayShift = Math.floor(startMin / DAY_MINUTES);
  const start = instantAt(addDays(day, dayShift), hhmm(startMin - dayShift * DAY_MINUTES), coachZone);
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + Math.max(TYPE_STEP, minutes) * MIN).toISOString() };
}

/** Dragging on empty space: from where the drag began to where it ended, in quarter hours, at least 15 minutes; a click is an hour. */
export function dragTimes({ day, fromMin, toMin = null, coachZone }) {
  const a = snapMinutes(Math.min(fromMin, toMin ?? fromMin));
  const b = toMin == null ? a + CLICK_MINUTES : Math.max(a + DRAG_STEP, snapMinutes(Math.max(fromMin, toMin)));
  return timesAt({ day, startMin: Math.min(a, DAY_MINUTES - DRAG_STEP), minutes: b - a, coachZone });
}

/**
 * Times typed into Starts and Ends, in 5-minute steps. An end at or before
 * the start is the next day (23:30 to 00:30).
 * @returns {{ starts_at?: string, ends_at?: string, minutes?: number, line?: string, problem: string|null }}
 */
export function typedTimes({ day, from, to, coachZone }) {
  const a = minutesOfTime(from);
  const b = minutesOfTime(to);
  if (a == null || b == null) return { problem: 'Type a start and an end to carry on.' };
  if (a % TYPE_STEP || b % TYPE_STEP) return { problem: 'Times go in 5-minute steps. Choose the nearest one.' };
  const minutes = b > a ? b - a : b + DAY_MINUTES - a;
  return { ...timesAt({ day, startMin: a, minutes, coachZone }), minutes, line: lengthLine(minutes), problem: null };
}

/** "2 hours 15 minutes, in 5-minute steps.": the line under Starts and Ends. */
export const lengthLine = (minutes) => `${minutesWords(minutes)}, in 5-minute steps.`;

/** The start and end choices of the edit panel, every 5 minutes: "09:45". */
export const timeChoices = (fromMin = 0, toMin = DAY_MINUTES - TYPE_STEP) => Array.from({ length: Math.floor((toMin - fromMin) / TYPE_STEP) + 1 }, (_, i) => hhmm(fromMin + i * TYPE_STEP));

/** A blank calendar item with 051's own starting values. */
export function newItem({ id, coachId, kind = 'other', calendar = 'work', title, starts_at, ends_at, time_zone, ...extra }) {
  return {
    id, coach_id: coachId, kind, calendar, title: cut(clean(title), 200), starts_at, ends_at, time_zone, all_day: false, starts_on: null, ends_on: null, repeat_rule: null, series_id: null, occurrence_on: null,
    removed: false, split_from: null, location: null, place_kind: null, meeting_link: null, meeting_id: null, notes: null, attachments: [], reminders: [], busy: true, private: false, profile_id: null,
    group_id: null, session_id: null, poll_option_id: null, travel_for: null, google_event_id: null, google_calendar_id: null, google_etag: null, google_synced_at: null, moved_in_google_at: null, ...extra,
  };
}

/** An all-day item, or one over several days (travel, a conference): its first and last day, in its anchor zone. */
export function allDayItem({ firstDay, lastDay = firstDay, zone, ...rest }) {
  const last = lastDay < firstDay ? firstDay : lastDay;
  return newItem({ ...rest, time_zone: zone, starts_at: instantAt(firstDay, '00:00', zone).toISOString(), ends_at: instantAt(addDays(last, 1), '00:00', zone).toISOString(), all_day: true, starts_on: firstDay, ends_on: last });
}

const sessionMinutes = (minutes, was) => (SESSION_LENGTHS.includes(minutes) ? minutes : was);
const whoGets = (e) => (e.item?.group_id || e.session?.group_id ? 'Everyone invited' : firstName(e.title));

/**
 * The toast after a move or a resize: "Moved to Wed 14:00." or "Now 12:30
 * to 14:00.", and for a call who hears: "Sam gets the new time." when
 * invites go out through Google, otherwise "Tell Sam the new time." (the
 * drafted note is offered; nothing sends by itself).
 */
export function movedWords({ e, starts_at, ends_at, coachZone, invites = false }) {
  const moved = ms(starts_at) !== e.startsAt.getTime();
  const w = wallClock(starts_at, coachZone);
  const what = moved ? `Moved to ${SHORT_DAYS[w.weekday - 1]} ${w.time}` : `Now ${spanWords(starts_at, ends_at, coachZone)}`;
  if (!e.isCall || e.kind !== 'client_call') return `${what}.`;
  return invites ? `${what}. ${whoGets(e)} gets the new time.` : `${what}. Tell ${whoGets(e) === 'Everyone invited' ? 'everyone invited' : whoGets(e)} the new time.`;
}

/**
 * The note that tells a client their call has moved, drafted in the
 * client's own time and never sent from here: the page opens it for the
 * coach to send.
 * @returns {{ name: string, subject: string, body: string }}
 */
export function movedNote({ e, starts_at, coachFirstName = '', coachZone }) {
  const zone = e.item?.time_zone && isZone(e.item.time_zone) ? e.item.time_zone : (e.clientZone || coachZone);
  const when = (t) => `${zoneDayWords(t, zone)} at ${timeWords(t, zone)}`;
  const link = joinLink(e.item, e.session);
  return {
    name: e.title, subject: 'Our call has moved',
    body: [`Hi ${firstName(e.title)},`, `I’ve moved our call to ${when(starts_at)}. It was ${when(e.startsAt)}.`, link ? `The Zoom link stays the same: ${link}` : '', coachFirstName].filter(Boolean).join('\n\n'),
  };
}

/** The note for a call that was deleted. */
export function cancelledNote({ e, coachFirstName = '', coachZone }) {
  const zone = e.item?.time_zone && isZone(e.item.time_zone) ? e.item.time_zone : (e.clientZone || coachZone);
  return { name: e.title, subject: 'Our call is cancelled', body: [`Hi ${firstName(e.title)},`, `I’ve cancelled our call on ${zoneDayWords(e.startsAt, zone)} at ${timeWords(e.startsAt, zone)}. I’ll be in touch to find another time.`, coachFirstName].filter(Boolean).join('\n\n') };
}

const shiftWeekdays = (rule, days) => (rule?.weekdays?.length && days % 7 ? { ...rule, weekdays: rule.weekdays.map((d) => (((d + days) % 7) + 7) % 7).sort((a, b) => a - b) } : rule);
const unsynced = { google_event_id: null, google_etag: null, google_synced_at: null, moved_in_google_at: null };

/**
 * A change to one time of a repeat, as the rows to save.
 *   'one'        a row that stands in for that one time (series_id and occurrence_on);
 *   'following'  the series ends the day before (until), and a new series starts
 *                at this time (split_from), with the rule the patch gives when it
 *                gives one (Repeats changed in the panel; no rule: this time alone
 *                is left), keeping what is left of a count that wasn't changed; the
 *                times after it that were edited on their own are let go;
 *   'all'        the series itself moves by the same days and to the same clock
 *                time in its anchor zone (its edited times go when the day moves).
 * @param {{ series: object, on: string, scope: 'one'|'following'|'all', patch?: object, times?: { starts_at, ends_at }, items?: object[], newId: () => string }} a
 * @returns {{ save: [string, object][], remove: [string, string][] }}
 */
export function editRepeat({ series, on, scope, patch = {}, times = null, items = [], newId }) {
  const zone = zoneOr(series.time_zone);
  const first = firstOf(series);
  const length = ms(series.ends_at) - ms(series.starts_at);
  const was = instantAt(on, first.time, zone);
  const at = times || { starts_at: was.toISOString(), ends_at: new Date(was.getTime() + length).toISOString() };
  const standIns = items.filter((i) => i.series_id === series.id);
  if (scope === 'one') {
    const there = standIns.find((i) => i.occurrence_on === on);
    return { save: [[T.items, { ...series, ...unsynced, ...(there || {}), ...patch, id: there?.id || newId(), repeat_rule: null, series_id: series.id, occurrence_on: on, split_from: null, removed: false, starts_at: at.starts_at, ends_at: at.ends_at }]], remove: [] };
  }
  const dayShift = daysBetween(on, wallClock(at.starts_at, zone).date);
  if (scope === 'following' && on > first.date) {
    const gone = series.repeat_rule.count ? ruleDays(series.repeat_rule, first.date, first.date, addDays(on, -1)).length : 0;
    const asked = patch.repeat_rule !== undefined ? patch.repeat_rule : series.repeat_rule;
    const rule = asked ? shiftWeekdays({ ...asked, ...(asked.count && asked.count === series.repeat_rule.count ? { count: Math.max(1, asked.count - gone) } : {}) }, dayShift) : null;
    return {
      save: [
        [T.items, { ...series, repeat_rule: { ...series.repeat_rule, until: addDays(on, -1) } }],
        [T.items, { ...series, ...unsynced, ...patch, id: newId(), split_from: series.id, repeat_rule: rule, starts_at: at.starts_at, ends_at: at.ends_at }],
      ],
      remove: standIns.filter((i) => i.occurrence_on >= on).map((i) => [T.items, i.id]),
    };
  }
  // All of them: the first time moves by the same days, to the same clock time in the anchor zone.
  const start = times ? instantAt(addDays(first.date, dayShift), wallClock(at.starts_at, zone).time, zone) : new Date(series.starts_at);
  const end = new Date(start.getTime() + (times ? ms(at.ends_at) - ms(at.starts_at) : length));
  return {
    save: [[T.items, { ...series, ...patch, starts_at: start.toISOString(), ends_at: end.toISOString(), repeat_rule: shiftWeekdays(patch.repeat_rule !== undefined ? patch.repeat_rule : series.repeat_rule, dayShift) }]],
    remove: dayShift ? standIns.map((i) => [T.items, i.id]) : [],
  };
}

/**
 * Deleting one time of a repeat: 'one' keeps a row that says that time was
 * removed, 'following' ends the series the day before, 'all' removes it.
 */
export function deleteRepeat({ series, on, scope, items = [], newId }) {
  const first = firstOf(series);
  const standIns = items.filter((i) => i.series_id === series.id);
  if (scope === 'one') {
    const made = editRepeat({ series, on, scope: 'one', items, newId });
    return { save: [[T.items, { ...made.save[0][1], removed: true }]], remove: [] };
  }
  if (scope === 'following' && on > first.date) {
    return { save: [[T.items, { ...series, repeat_rule: { ...series.repeat_rule, until: addDays(on, -1) } }]], remove: standIns.filter((i) => i.occurrence_on >= on).map((i) => [T.items, i.id]) };
  }
  return { save: [], remove: [...standIns.map((i) => [T.items, i.id]), [T.items, series.id]] };
}

/** The to-do's row when it is given a time on the calendar (placed, moved or resized). */
const todoAt = (todo, { day, startMin, minutes }) => ({
  ...todo, planned_on: day, planned_time: hhmm(Math.min(DAY_MINUTES - DRAG_STEP, Math.max(0, snapMinutes(startMin)))), minutes: Math.min(480, Math.max(15, snapMinutes(minutes))), someday: false,
  first_planned_on: todo.first_planned_on || todo.planned_on || null,
});

/**
 * An entry moved or resized: the rows to save, what Undo restores, the
 * toast and, for a client call, the drafted note that tells the client.
 * Dragging gives `startMin` (from midnight of `day`, in quarter hours) and
 * `minutes`; a repeat needs its `scope`. A client call takes its session
 * and its travel time with it (the database does the same once 051 is there).
 * @param {object} e the entry, from calendarEntries
 * @param {{ day: string, startMin: number, minutes?: number, times?: { starts_at, ends_at } }} to
 * @param {{ coachZone, data, scope?, newId, invites?, coachFirstName?, busy? }} ctx
 */
export function moveEntry(e, to, { coachZone, data = {}, scope = 'one', newId, invites = false, coachFirstName = '', now = null }) {
  const minutes = to.minutes ?? e.minutes;
  if (e.type === 'todo') {
    const row = todoAt(e.todo, { day: to.day, startMin: to.startMin, minutes });
    const at = timesAt({ day: row.planned_on, startMin: minutesOfTime(row.planned_time), minutes: row.minutes, coachZone });
    return plan(data, { save: [[T.todos, row]], words: movedWords({ e, ...at, coachZone }) });
  }
  const at = to.times || timesAt({ day: to.day, startMin: to.startMin, minutes, coachZone });
  if (e.type === 'open') return placeOpen({ block: e.block, ...at }, { data, coachZone, newId, now });
  if (e.type === 'session') {
    if (e.session.recap_sent_at) return refused(SENT_LINE);
    const length = Math.round((ms(at.ends_at) - ms(at.starts_at)) / MIN);
    return plan(data, { save: [[T.sessions, { ...e.session, starts_at: at.starts_at, minutes: sessionMinutes(length, e.session.minutes) }]], words: movedWords({ e, ...at, coachZone, invites }), tell: movedNote({ e, starts_at: at.starts_at, coachFirstName, coachZone }) });
  }
  const i = e.item;
  if (e.session?.recap_sent_at) return refused(SENT_LINE);
  const tell = e.kind === 'client_call' ? movedNote({ e, starts_at: at.starts_at, coachFirstName, coachZone }) : null;
  const words = movedWords({ e, ...at, coachZone, invites });
  if (i.repeat_rule) return plan(data, { ...editRepeat({ series: i, on: e.on, scope, times: at, items: data.items || [], newId }), words, tell });
  const shift = ms(at.starts_at) - ms(i.starts_at);
  const length = Math.round((ms(at.ends_at) - ms(at.starts_at)) / MIN);
  const grew = ms(at.ends_at) - ms(i.ends_at);
  const save = [[T.items, { ...i, starts_at: at.starts_at, ends_at: at.ends_at }]];
  if (e.session) save.push([T.sessions, { ...e.session, starts_at: at.starts_at, minutes: sessionMinutes(length, e.session.minutes) }]);
  // Travel time either side moves with its call: the way there by the start, the way back by the end.
  for (const t of (data.items || []).filter((x) => x.travel_for === i.id)) {
    const by = ms(t.starts_at) >= ms(i.ends_at) ? grew : shift;
    save.push([T.items, { ...t, starts_at: iso(ms(t.starts_at) + by), ends_at: iso(ms(t.ends_at) + by) }]);
  }
  return plan(data, { save, words, tell });
}

/** An entry made longer or shorter from its bottom edge: `endMin` from the midnight of `endDay`, at least 15 minutes. */
export function resizeEntry(e, { endDay, endMin }, ctx) {
  const end = instantAt(addDays(endDay, Math.floor(snapMinutes(endMin) / DAY_MINUTES)), hhmm(snapMinutes(endMin) % DAY_MINUTES), ctx.coachZone);
  const minutes = Math.max(DRAG_STEP, Math.round((end - e.startsAt) / MIN));
  if (e.type === 'todo') return moveEntry(e, { day: e.fromDay, startMin: wallMinutes(e.startsAt, ctx.coachZone), minutes }, ctx);
  return moveEntry(e, { times: { starts_at: e.startsAt.toISOString(), ends_at: new Date(e.startsAt.getTime() + minutes * MIN).toISOString() } }, ctx);
}

/** An arrow key on a chosen entry: 15 minutes earlier or later (`minutes`), or a day back or on (`days`). */
export function nudgeEntry(e, { minutes = 0, days = 0 }, ctx) {
  const start = new Date(e.startsAt.getTime() + minutes * MIN);
  const w = wallClock(start, ctx.coachZone);
  return moveEntry(e, { day: addDays(w.date, days), startMin: w.hour * 60 + w.minute }, ctx);
}

/**
 * Duplicate: a copy on the next day showing (the same day when it is the
 * last one), at the same clock time. Never a to-do, and the copy has no
 * session, repeat or Google event of its own.
 */
export function duplicateEntry(e, { days, coachZone, data = {}, newId }) {
  if (e.type !== 'item') return refused('');
  const at = Math.max(0, days.indexOf(e.fromDay));
  const day = days[Math.min(days.length - 1, at + 1)] || e.fromDay;
  const shift = daysBetween(e.fromDay, day);
  const moved = e.allDay ? null : timesAt({ day, startMin: wallMinutes(e.startsAt, coachZone), minutes: e.minutes, coachZone });
  const copy = {
    ...e.item, ...unsynced, id: newId(), repeat_rule: null, series_id: null, occurrence_on: null, split_from: null, removed: false, session_id: null, poll_option_id: null, travel_for: null, meeting_link: null, meeting_id: null,
    ...(e.allDay ? { starts_on: day, ends_on: addDays(e.toDay, shift), starts_at: instantAt(day, '00:00', zoneOr(e.item.time_zone, coachZone)).toISOString(), ends_at: instantAt(addDays(e.toDay, shift + 1), '00:00', zoneOr(e.item.time_zone, coachZone)).toISOString() } : moved),
    kind: e.item.kind === 'hold' ? 'other' : e.item.kind,
  };
  return plan(data, { save: [[T.items, copy]], words: `Duplicated to ${SHORT_DAYS[weekdayOf(day) - 1]}.` });
}

export const TODO_BACK = 'Back on your to-do list.';
export const DELETED = 'Deleted';
/** What the edit panel's quiet button says: a to-do comes off the calendar, anything else is deleted. */
export const removeLabel = (e) => (e.type === 'todo' ? 'Remove from calendar' : 'Delete');

/**
 * Delete (calendar items only), or Remove from calendar for a to-do, which
 * stays on the to-do list with its day and loses only its time. A deleted
 * client call takes its session with it when nothing has been written up,
 * its travel time and its guests; a repeat needs its `scope`.
 */
export function deleteEntry(e, { data = {}, scope = 'one', newId, coachFirstName = '', coachZone }) {
  if (e.type === 'todo') return plan(data, { save: [[T.todos, { ...e.todo, planned_time: null }]], words: TODO_BACK });
  if (e.type === 'open') return plan(data, { remove: [[T.open, e.block.id]], words: 'Removed' });
  const tell = e.kind === 'client_call' ? cancelledNote({ e, coachFirstName, coachZone }) : null;
  const sessionGone = (s) => (s && !s.outcome && !s.recap_sent_at ? [[T.sessions, s.id]] : []);
  if (e.type === 'session') return e.session.recap_sent_at ? refused(SENT_LINE) : plan(data, { remove: sessionGone(e.session), words: DELETED, tell });
  const i = e.item;
  if (i.repeat_rule) return plan(data, { ...deleteRepeat({ series: i, on: e.on, scope, items: data.items || [], newId }), words: DELETED, tell });
  // One edited time of a series: it stays as a row that says that time was removed, so the series doesn't bring it back.
  if (i.series_id) return plan(data, { save: [[T.items, { ...i, removed: true }]], words: DELETED, tell });
  const parts = (data.items || []).filter((x) => x.travel_for === i.id).map((x) => [T.items, x.id]);
  const guests = (data.guests || []).filter((g) => g.item_id === i.id).map((g) => [T.guests, g.id]);
  return plan(data, { remove: [...guests, ...parts, [T.items, i.id], ...sessionGone(e.session)], words: DELETED, tell });
}

// ---------------------------------------------------------------- to-dos on the calendar

/**
 * A to-do dragged onto the calendar from the to-dos panel: it gets the day,
 * the time and a length (its own estimate, otherwise 30 minutes), and stays
 * the same coach_todos row, ticked in either place.
 */
export function placeTodo(todo, { day, startMin, minutes = null }, { data = {} } = {}) {
  const row = todoAt(todo, { day, startMin, minutes: minutes ?? (Number(todo.minutes) || DEFAULT_TODO_MINUTES) });
  return plan(data, { save: [[T.todos, row]], words: `Placed at ${row.planned_time}.` });
}

/** The to-dos still to place: not done, with no time yet, today's and carried-over ones first. */
export function todosToPlace(todos, todayKey) {
  return (todos || []).filter((t) => !t.done_at && !t.after_work && minutesOfTime(t.planned_time) == null && (!t.planned_on || t.planned_on <= addDays(todayKey, 7)))
    .sort((a, b) => Number(Boolean(b.important)) - Number(Boolean(a.important)) || String(a.planned_on || '9999').localeCompare(String(b.planned_on || '9999')) || (Number(a.position) || 0) - (Number(b.position) || 0));
}

/** The one-line tile (anything under 45 minutes): the tick for a to-do, the title, then the start time only if it fits. */
export const oneLineParts = (e, { coachZone, fits = true } = {}) => ({ tick: e.type === 'todo', title: e.title, time: fits ? wallClock(e.startsAt, coachZone).time : '' });

export const SHOW_TODOS = 'Show to-dos';
export const HIDE_TODOS = 'Hide to-dos';
export const TODOS_TO_PLACE = 'To-dos to place';

// ---------------------------------------------------------------- the quick add

/** "What is it?": the quick add's kinds, with the calendar item each makes (a to-do also goes on To-dos; a client call goes on to Book a call). */
export const QUICK_KINDS = [
  { value: 'own', label: 'Your own time', kind: 'own_time', guests: false },
  { value: 'net', label: 'Networking call', kind: 'connection', guests: true },
  { value: 'event', label: 'Event', kind: 'event', guests: true },
  { value: 'todo', label: 'To-do', kind: null, guests: false },
  { value: 'call', label: 'Client call', kind: 'client_call', guests: true },
];
export const QUICK_TITLE = 'Add title';
export const NEEDS_TITLE = 'Type a title to carry on.';
/** The quick add's button: a client call goes on to Book a call. */
export const quickSaveLabel = (kind) => (kind === 'call' ? 'Book the call' : 'Save');

const clockFrom = (h, m, half) => {
  let hour = Number(h);
  if (half) { const pm = /p/i.test(half); if (hour < 1 || hour > 12) return null; hour = (hour % 12) + (pm ? 12 : 0); }
  const minute = Number(m || 0);
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
};

/**
 * The natural-language quick add: "Coffee with Dan Thu 10:00", "Writing
 * tomorrow 9-11", "Lunch Fri 12:30 for 45m". The times, "am" and "pm", a
 * range and "for 45m" are read here (in 5-minute steps); the day words and
 * everything else are day.js's parseQuickAdd, so the two never disagree.
 * @param {string} text
 * @param {{ todayKey: string, defaultDay?: string }} ctx
 * @returns {{ title: string, day: string, from: string|null, to: string|null, minutes: number, allDay: boolean, kind: string, repeat_rule: object|null }}
 */
export function parseCalQuickAdd(text, { todayKey, defaultDay = null } = {}) {
  let rest = ` ${String(text || '').replace(/\s+/g, ' ')} `;
  let from = null;
  let to = null;
  let minutes = null;
  // "for 45m", "for 1h 30m", "90 min", "2 hours"
  rest = rest.replace(/\s(?:for )?(\d{1,2})\s?h(?:ours?|rs?)?(?:\s?([0-5]?\d)\s?m(?:in(?:s|utes)?)?)?(?=\s)|\s(?:for )?(\d{1,3})\s?m(?:in(?:s|utes)?)?(?=\s)/gi, (all, h, hm, m) => {
    const n = h != null ? Number(h) * 60 + (Number(hm) || 0) : Number(m);
    if (minutes != null || n < TYPE_STEP || n > DAY_MINUTES || n % TYPE_STEP) return all;
    minutes = n;
    return ' ';
  });
  // A range: "9-11", "9:30 to 11", "2pm-3.30pm"
  rest = rest.replace(/\s(?:from )?(\d{1,2})(?:[:.]([0-5]\d))?\s?(am|pm)?\s?(?:-|–|to)\s?(\d{1,2})(?:[:.]([0-5]\d))?\s?(am|pm)?(?=\s)/i, (all, h1, m1, half1, h2, m2, half2) => {
    const b = clockFrom(h2, m2, half2);
    let a = clockFrom(h1, m1, half1 || (half2 && Number(h1) <= 12 ? half2 : null));
    if (a != null && b != null && a >= b && !half1 && half2) a = clockFrom(h1, m1, 'am'); // "11-1pm"
    if (a == null || b == null || a >= b || a % TYPE_STEP || b % TYPE_STEP) return all; // off the 5-minute step: left as words
    from = a; to = b;
    return ' ';
  });
  // One time: "10:00", "at 3pm", "9.30am"
  if (from == null) {
    rest = rest.replace(/\s(?:at )?(\d{1,2})(?:[:.]([0-5]\d))?\s?(am|pm)(?=\s)|\s(?:at )?([01]?\d|2[0-3])[:.]([0-5]\d)(?=\s)/i, (all, h, m, half, h24, m24) => {
      const a = h != null ? clockFrom(h, m, half) : clockFrom(h24, m24, null);
      if (a == null || a % TYPE_STEP) return all; // "9:07" isn't a time the calendar keeps: it stays in the title
      from = a;
      return ' ';
    });
  }
  const read = parseQuickAdd(rest, { todayKey, defaultDay: defaultDay || todayKey });
  const allDay = from == null;
  if (!allDay && to == null) to = from + (minutes ?? CLICK_MINUTES);
  const title = read.title;
  const kind = /^(writing|write)\b/i.test(title) ? 'writing' : /^admin\b/i.test(title) ? 'admin' : /\b(coffee|lunch|breakfast|dinner|drinks?|catch[- ]up|call) with\b/i.test(title) ? 'connection' : 'own_time';
  return {
    title, day: read.planned_on || defaultDay || todayKey, from: allDay ? null : hhmm(from), to: allDay ? null : hhmm(Math.min(to, DAY_MINUTES) % DAY_MINUTES), minutes: allDay ? 0 : to - from, allDay, kind,
    repeat_rule: read.repeat_rule,
  };
}

/** The chips under the quick add, saying how it was read: "Thu 19 Nov", "10:00 to 11:00", "Every week". */
export function calQuickAddChips(parsed) {
  if (!parsed || !parsed.title) return [];
  return [dayKeyWords(parsed.day), parsed.allDay ? 'All day' : `${parsed.from} to ${parsed.to}`, parsed.repeat_rule ? calRepeatWords(parsed.repeat_rule, parsed.day) : ''].filter(Boolean);
}

/**
 * What the quick add saves: a calendar item (with its guests), or for a
 * to-do a coach_todos row with the day, time and length (so it shows on
 * To-dos too). A client call isn't made here: it goes on to Book a call.
 * @param {{ title, kind: 'own'|'net'|'event'|'todo'|'call', starts_at, ends_at, people? }} quick
 * @param {{ coachId, coachZone, newId, todo?: object, data?, invites?, itemKind? }} ctx `todo`: a blank to-do row (todoActions' blankTodo)
 */
export function quickAddPlan({ title, kind = 'own', starts_at, ends_at, people = [], allDay = null, repeat_rule = null }, { coachId, coachZone, newId, todo = null, data = {}, invites = false, itemKind = null }) {
  const name = cut(clean(title), 200);
  if (!name) return refused(NEEDS_TITLE);
  if (kind === 'call') return refused('');
  if (kind === 'todo') {
    const w = wallClock(starts_at, coachZone);
    const row = todoAt({ ...todo, id: todo?.id || newId(), coach_id: coachId, title: name }, { day: w.date, startMin: w.hour * 60 + w.minute, minutes: Math.round((ms(ends_at) - ms(starts_at)) / MIN) });
    return plan(data, { save: [[T.todos, row]], words: 'Added. It’s on your to-do list too.' });
  }
  const base = { id: newId(), coachId, kind: itemKind || QUICK_KINDS.find((k) => k.value === kind)?.kind || 'own_time', title: name, repeat_rule };
  const item = allDay ? allDayItem({ ...base, firstDay: allDay.firstDay, lastDay: allDay.lastDay, zone: coachZone }) : newItem({ ...base, starts_at, ends_at, time_zone: coachZone });
  const guests = guestRows(people, { itemId: item.id, coachId, newId, clients: data.clients || [] });
  const g = guests.length;
  return plan(data, { save: [[T.items, item], ...guests.map((r) => [T.guests, r])], words: g && invites ? `Added. ${g === 1 ? '1 person gets' : `${g} people get`} an invite.` : 'Added' });
}

// ---------------------------------------------------------------- Who's invited?

export const INVITED_LABEL = 'Who’s invited?';
export const INVITED_EXAMPLE = 'Paste names and emails, e.g. Dan Reid <dan@brightwater.co>';

/**
 * "Who's invited?": a pasted list read by model.js's parsePeople, with the
 * count, any address to check and any name without an email.
 * @returns {{ people: {name, email}[], count: number, countWords: string, toCheck: string[], noEmail: string[], duplicates: number, lines: string[] }}
 */
export function invited(text) {
  const { people, duplicates, unread } = parsePeople(text);
  const toCheck = unread.filter((u) => u.includes('@'));
  const noEmail = unread.filter((u) => !u.includes('@'));
  const lines = [];
  if (toCheck.length) lines.push(`Check ${toCheck.length === 1 ? 'this address' : 'these addresses'}: ${toCheck.join(', ')}.`);
  if (noEmail.length) lines.push(`${joinNames(noEmail)} ${noEmail.length === 1 ? 'has' : 'have'} no email yet. Add one to invite them.`);
  if (duplicates) lines.push(`${duplicates === 1 ? '1 duplicate was' : `${duplicates} duplicates were`} taken out.`);
  return { people, count: people.length, countWords: people.length === 1 ? '1 person' : `${people.length} people`, toCheck, noEmail, duplicates, lines };
}

/** People already in the portal (clients, contacts, coaches) found by typing a name or an email: [{ name, email, profile_id?, contact_id?, guest_coach_id? }]. */
export function pickPeople(query, { clients = [], contacts = [], coaches = [] } = {}, max = 6) {
  const q = clean(query).toLowerCase();
  if (!q) return [];
  const all = [
    ...clients.map((c) => ({ name: c.name, email: c.email || '', profile_id: c.id })),
    ...contacts.map((c) => ({ name: c.name, email: c.email || '', contact_id: c.id })),
    ...coaches.map((c) => ({ name: c.display_first_name || c.name || '', email: c.email || '', guest_coach_id: c.id })),
  ].filter((p) => p.name);
  const starts = all.filter((p) => p.name.toLowerCase().split(' ').some((w) => w.startsWith(q)));
  const holds = all.filter((p) => !starts.includes(p) && (p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)));
  return [...starts, ...holds].slice(0, max);
}

/** The guests' rows for an item, each tied to a client of the same email when there is one. */
export function guestRows(people, { itemId, coachId, newId, clients = [] }) {
  return (people || []).map((p, position) => ({
    id: newId(), item_id: itemId, coach_id: coachId, name: clean(p.name) || null, email: p.email ? String(p.email).toLowerCase() : null,
    profile_id: p.profile_id || clients.find((c) => c.email && p.email && String(c.email).toLowerCase() === String(p.email).toLowerCase())?.id || null,
    guest_coach_id: p.guest_coach_id || null, contact_id: p.contact_id || null, reply: 'none', replied_at: null, invited_at: null, position,
  }));
}

export const REPLIES = { none: 'No reply yet', yes: 'Yes', no: 'No', maybe: 'Maybe' };
/** "2 yes, 1 maybe, 1 no reply yet": the replies on an item. */
export function replyWords(guests) {
  const n = (r) => (guests || []).filter((g) => (g.reply || 'none') === r).length;
  return [n('yes') && `${n('yes')} yes`, n('maybe') && `${n('maybe')} maybe`, n('no') && `${n('no')} no`, n('none') && `${n('none')} no reply yet`].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------- booking: the rules

export const MAX_CALLS_A_DAY = 5;
export const BOOKING_LENGTHS = SESSION_LENGTHS;

/** Settings' Booking limits, each read as its leading whole number and kept inside its bounds (as 051's _cal_setting). */
export function bookingLimits(settings) {
  const read = (key, start, low, high) => { const m = /^\s*(\d{1,4})/.exec(String(settings?.booking?.[key] ?? '')); return Math.min(high, Math.max(low, m ? Number(m[1]) : start)); };
  return { gap: read('gap', GAP_MINUTES, 0, 120), perDay: read('per_day', MAX_CALLS_A_DAY, 1, 20), notice: read('notice', 24, 0, 720), ahead: read('ahead', 4, 1, 12) };
}

/** The Booking limits as Settings shows them: "15 minutes", "5", "24 hours", "4 weeks". */
export function bookingLimitWords(settings) {
  const l = bookingLimits(settings);
  return { gap: `${l.gap} ${l.gap === 1 ? 'minute' : 'minutes'}`, per_day: String(l.perDay), notice: `${l.notice} ${l.notice === 1 ? 'hour' : 'hours'}`, ahead: `${l.ahead} ${l.ahead === 1 ? 'week' : 'weeks'}` };
}
export const BOOKING_LIMIT_ROWS = [
  { key: 'gap', label: 'Gap between calls', unit: 'minutes between calls', min: 0, max: 120, step: 5 },
  { key: 'per_day', label: 'Calls a day, at most', unit: 'calls a day', min: 1, max: 20, step: 1 },
  { key: 'notice', label: 'Notice needed', unit: 'hours of notice', min: 0, max: 720, step: 1 },
  { key: 'ahead', label: 'Open this far ahead', unit: 'weeks ahead', min: 1, max: 12, step: 1 },
];

/** "30 minutes, 24 hours’ notice, 4 weeks ahead": a call type's page in Settings. */
export const callTypeLine = (t) => `${t.minutes} minutes, ${t.notice_hours} ${t.notice_hours === 1 ? 'hour’s' : 'hours’'} notice, ${t.ahead_weeks} ${t.ahead_weeks === 1 ? 'week' : 'weeks'} ahead`;
/** "30 minutes, Zoom": under a booking page's title. */
export const callPlaceLine = (minutes, placeKind) => `${minutes} minutes, ${placeWord(placeKind || 'zoom')}`;
/** "Times from 24 hours ahead, up to 4 weeks.": the foot of a booking page. */
export const bookingFootLine = (noticeHours, aheadWeeks) => `Times from ${noticeHours} ${noticeHours === 1 ? 'hour' : 'hours'} ahead, up to ${aheadWeeks} ${aheadWeeks === 1 ? 'week' : 'weeks'}.`;

/** The hours a client books inside on a day: Settings' "Open for bookings" when it is filled in, otherwise the working day (as 051). */
export function bookingHoursOn(settings, day) {
  const own = settings?.booking_hours && typeof settings.booking_hours === 'object' && Object.keys(settings.booking_hours).length ? settings.booking_hours : null;
  if (!own) { const h = workingDay(settings, day); return h ? { from: h.from, to: h.to } : null; }
  const h = own[WEEK_KEYS[dow(day)]];
  return h && minutesOfTime(h.from) != null && minutesOfTime(h.to) != null && h.to > h.from ? { from: h.from, to: h.to } : null;
}

/**
 * Everything that takes the coach's time between two instants, for booking
 * and Open for calls: each time a busy item falls (personal and family ones
 * too: other people only ever learn that the time is taken), and sessions
 * with no calendar item yet. Free items and to-dos never block.
 * @returns {{ start: Date, end: Date, isCall: boolean, title: string, id: string }[]}
 */
export function busySpans({ items = [], sessions = [], from, to, skipItemId = null }) {
  const out = occurrences(items, from, to).filter((o) => o.item.busy !== false && o.item.id !== skipItemId)
    .map((o) => ({ start: o.startsAt, end: o.endsAt, isCall: CALL_KINDS.includes(o.item.kind), title: o.item.title, id: o.item.id }));
  const linked = new Set(items.map((i) => i.session_id).filter(Boolean));
  for (const s of sessions) {
    if (linked.has(s.id) || (s.outcome && s.outcome !== 'held')) continue;
    const start = new Date(s.starts_at);
    const end = new Date(start.getTime() + (Number(s.minutes) || 60) * MIN);
    if (start < new Date(to) && end > new Date(from)) out.push({ start, end, isCall: true, title: 'a session', id: s.id });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The starts a call can be booked at, earliest first: the same answer the
 * database gives (051's _cal_free_times), so a page can show times before
 * 051 is there and never offers one the database would refuse.
 *   - inside the Open for calls blocks (`source: 'open'`: booking pages and
 *     links for people outside) or the weekly hours (`'hours'`: clients);
 *   - never over something busy, and never within the gap of another call
 *     (15 minutes, or the call type's own when longer);
 *   - never past the calls-a-day limit (5, counted on the coach's own day),
 *     inside the notice needed, further ahead than allowed, or while away;
 *   - only on a quarter hour in the CLIENT's own time (India, Newfoundland
 *     and Nepal included), and only 07:00 to 20:00 in the booker's own time
 *     unless they chose "Show early and late times".
 * @returns {Date[]}
 */
export function freeTimes({
  source = 'hours', minutes, from, to, now, coachZone, clientZone = coachZone, bookerZone = clientZone, settings = null, items = [], sessions = [], openBlocks = [], away = [],
  callType = null, noticeHours = null, aheadWeeks = null, earlyAndLate = false, skipItemId = null,
}) {
  if (!minutes || minutes < 15) return [];
  const limits = bookingLimits(settings);
  const before = Math.max(callType?.gap_before ?? 0, limits.gap) * MIN;
  const after = Math.max(callType?.gap_after ?? 0, limits.gap) * MIN;
  const perDay = Math.min(callType?.day_limit ?? MAX_CALLS_A_DAY, limits.perDay);
  const notice = noticeHours ?? callType?.notice_hours ?? limits.notice;
  const ahead = aheadWeeks ?? callType?.ahead_weeks ?? limits.ahead;
  const len = minutes * MIN;
  const lo = Math.ceil(Math.max(ms(from), ms(now) + notice * HOUR) / (15 * MIN)) * 15 * MIN;
  const hi = Math.min(ms(to), ms(now) + ahead * 7 * DAY_MS, lo + 45 * DAY_MS);
  if (hi < lo + len) return [];
  const windows = [];
  if (source === 'open') {
    for (const b of openBlocks) if (ms(b.starts_at) < hi && ms(b.ends_at) > lo && (b.call_type_id == null || b.call_type_id === (callType?.id ?? null))) windows.push([ms(b.starts_at), ms(b.ends_at)]);
  } else {
    for (let d = wallClock(new Date(lo), coachZone).date; d <= wallClock(new Date(hi), coachZone).date; d = addDays(d, 1)) {
      const h = bookingHoursOn(settings, d);
      if (h) windows.push([instantAt(d, h.from, coachZone).getTime(), instantAt(d, h.to, coachZone).getTime()]);
    }
  }
  const busy = busySpans({ items, sessions, from: lo - DAY_MS, to: hi + DAY_MS, skipItemId });
  const calls = {};
  for (const o of busy) if (o.isCall) { const d = wallClock(o.start, coachZone).date; calls[d] = (calls[d] || 0) + 1; }
  const out = [];
  for (let s = lo; s <= hi - len; s += 15 * MIN) {
    if (!windows.some(([a, z]) => s >= a && s + len <= z)) continue;
    if (busy.some((o) => (o.isCall ? o.start < s + len + after && o.end > s - before : o.start < s + len && o.end > s))) continue;
    const d = wallClock(new Date(s), coachZone).date;
    if ((calls[d] || 0) >= perDay) continue;
    if (away.some((x) => d >= x.starts_on && d <= x.ends_on)) continue;
    if (!onQuarterHour(s, clientZone)) continue;
    if (!earlyAndLate && !sociable(s, bookerZone, { minutes })) continue;
    out.push(new Date(s));
  }
  return out;
}

/**
 * Why a start can't be booked on the coach's calendar, as one calm line, or
 * null when it can: used when the coach places a call by hand.
 */
export function callProblem({ start, minutes, clientZone, coachZone, settings = null, items = [], sessions = [], skipItemId = null }) {
  const s = ms(start);
  const len = minutes * MIN;
  const limits = bookingLimits(settings);
  if (!onQuarterHour(s, clientZone)) return `Calls start on a quarter hour in ${zoneLabel(clientZone)}. Choose the nearest one.`;
  const busy = busySpans({ items, sessions, from: s - DAY_MS, to: s + len + DAY_MS, skipItemId });
  const clash = busy.find((o) => o.start < s + len && o.end > s);
  if (clash) return `That overlaps ${clash.title}. Choose another time.`;
  const near = busy.find((o) => o.isCall && o.start < s + len + limits.gap * MIN && o.end > s - limits.gap * MIN);
  if (near) return `That’s within ${limits.gap} minutes of ${near.title}. Choose a time with a gap either side.`;
  const day = wallClock(start, coachZone).date;
  if (busy.filter((o) => o.isCall && wallClock(o.start, coachZone).date === day).length >= limits.perDay) return `That day already has ${limits.perDay} calls. Choose another day.`;
  return null;
}

/** Free starts grouped by the booker's own days: [{ day, label: "Wed 18", title: "Wed 18 Nov", starts: Date[] }]. */
export function freeDays(starts, zone) {
  const days = [];
  for (const s of starts) {
    const w = wallClock(s, zone);
    let d = days[days.length - 1];
    if (!d || d.day !== w.date) { d = { day: w.date, label: `${SHORT_DAYS[w.weekday - 1]} ${w.day}`, title: dayKeyWords(w.date), starts: [] }; days.push(d); }
    d.starts.push(s);
  }
  return days;
}

export { EARLY_AND_LATE_LABEL };
/** The times a booking page shows for a day: only 07:00 to 20:00 the visitor's time unless "Show early and late times" is on; `hidden` says how many it holds back. */
export function sociableStarts(starts, zone, minutes, earlyAndLate = false) {
  const shown = earlyAndLate ? starts : starts.filter((s) => sociable(s, zone, { minutes }));
  return { shown, hidden: starts.length - shown.length };
}

/** The button under the times: "Book Wed 18 Nov, 11:30 am". */
export const bookButtonWords = (start, zone) => `Book ${zoneDayWords(start, zone)}, ${clockWords(start, zone)}`;

/** A booking page's time for the coach beside the visitor's: both days when they differ. */
export const bothTimes = (instant, zone, otherZone) => (sameZone(zone, otherZone) ? `${zoneDayWords(instant, zone)}, ${timeWords(instant, zone)}`
  : wallClock(instant, zone).date === wallClock(instant, otherZone).date ? `${zoneDayWords(instant, zone)}, ${timeWords(instant, zone)} · ${timeWords(instant, otherZone)}`
    : `${zoneDayWords(instant, zone)}, ${timeWords(instant, zone)} (${zoneDayWords(instant, otherZone)}, ${timeWords(instant, otherZone)})`);

/**
 * What a booking page says for each answer of booking_make, booking_move
 * and the client's own functions: what happened, then what to do.
 */
export const BOOKING_WORDS = Object.freeze({
  booked: 'Booked. Your invite is on its way.',
  moved: 'Moved. Your invite is updated.',
  cancelled: 'Your call is cancelled.',
  taken: 'That time has just been taken. Choose another.',
  not_found: 'This link isn’t working. Ask for a new one.',
  closed: 'This page is closed at the moment. Ask for a new link.',
  used: 'This link has already been used. Ask for a new one.',
  expired: 'This link has run out. Ask for a new one.',
  name: 'Type your name to carry on.',
  email: 'That email doesn’t look right. Check it and try again.',
  zone: 'Choose your time zone to carry on.',
  too_long: 'That’s too long to send. Shorten your answers and try again.',
  quarter: 'Calls start on a quarter hour. Choose one of the times shown.',
  hours: 'That time is early or late where you are. Choose “Show early and late times” to book it.',
  too_many: 'You already have 3 calls booked. Move or cancel one first.',
  full: 'Booking is full for today. Try again tomorrow.',
  no_coach: 'You don’t have a coach to book with yet.',
  none_left: 'Your sessions are all booked or used. Ask your coach about more.',
  not_ready: 'Booking isn’t open yet. Try again soon.',
  no_times: 'There are no free times on this day. Choose another day.',
  pick: 'Choose a time to carry on.',
});
export const bookingWords = (status) => BOOKING_WORDS[status] || 'That didn’t work. Try again in a moment.';

/** "That’s Thanksgiving in the US.": the line shown before a booking on a public holiday in the client's country is confirmed; null on any other day. */
export async function holidayLineFor(instant, clientZone, options) {
  return holidayLine(await publicHolidayFor(instant, clientZone, options));
}

// ---- a client moving or cancelling their own session

/**
 * What a client is told before they move or cancel a session with under 24
 * hours' notice (050's late cancellation): going on uses the session.
 * Null with more notice than that.
 * @param {'move'|'cancel'} what
 */
export function lateLine(startsAt, now, what = 'move') {
  if (!isLateCancellation(startsAt, now)) return null;
  return {
    line: `This session is in under 24 hours, so ${what === 'cancel' ? 'cancelling it' : 'moving it'} uses one of your sessions.`,
    go: what === 'cancel' ? 'Cancel it anyway' : 'Move it anyway', stay: 'Keep my session',
  };
}

// ---- single-use links

export const LINK_PURPOSES = [
  { value: 'sponsor', label: 'Sponsor call', callName: 'Sponsor call', minutes: 30 },
  { value: 'three', label: 'Three-way', callName: 'Three-way meeting', minutes: 60 },
  { value: 'extra', label: 'Extra session', callName: 'Extra session', minutes: 60 },
  { value: 'net', label: 'Networking', callName: 'Networking call', minutes: 30 },
  { value: 'other', label: 'Other', callName: 'Call', minutes: 30 },
];

/** A single-use link's state: 'open', 'used', 'expired' (its last day has passed on the coach's own calendar) or 'closed' (revoked). */
export function linkState(link, todayKey) {
  if (link.revoked_at) return 'closed';
  if (link.used_at) return 'used';
  return link.expires_on && link.expires_on < todayKey ? 'expired' : 'open';
}
export const LINK_STATE_WORDS = { open: 'Open', used: 'Used', expired: 'Run out', closed: 'Closed' };

/** A new single-use link's row; its key is the link itself. */
export function newLink({ id, key, coachId, purpose, forName = null, forEmail = null, callName = null, profileId = null, minutes = 30, placeKind = 'zoom', noticeHours = 24, aheadWeeks = 4, expiresOn = null }) {
  return {
    id, coach_id: coachId, key, purpose: cut(clean(purpose), 120), for_name: clean(forName) || null, for_email: clean(forEmail).toLowerCase() || null, call_name: clean(callName) || null, profile_id: profileId,
    minutes, place_kind: placeKind, notice_hours: noticeHours, ahead_weeks: aheadWeeks, expires_on: expiresOn, used_at: null, booking_id: null, revoked_at: null,
  };
}
/** "Link copied. It works once, for Dana." */
export const linkCopiedWords = (forName) => (firstName(forName) ? `Link copied. It works once, for ${firstName(forName)}.` : 'Link copied. It works once.');
/** "2 open, for Dana Whitfield and Paul Garner": Settings' Single-use links row. */
export function openLinksLine(links, todayKey) {
  const open = (links || []).filter((l) => linkState(l, todayKey) === 'open');
  if (!open.length) return 'None open';
  const names = open.map((l) => clean(l.for_name)).filter(Boolean);
  return `${open.length} open${names.length ? `, for ${joinNames(names)}` : ''}`;
}

// ---- Book a call

export const HOW_OFTEN = [{ value: 0, label: 'Just this once' }, { value: 1, label: 'Every week' }, { value: 2, label: 'Every 2 weeks' }, { value: 4, label: 'Every 4 weeks' }];
export const SERIES_MAX = 26;
export const bookCallLabel = (n) => (n === 1 ? 'Book the call' : `Book ${n} calls`);
/** "60 minutes is suggested, from Jordan’s agreement." */
export const suggestedLengthLine = (minutes, name) => `${minutes} minutes is suggested, from ${firstName(name)}’s agreement.`;

/**
 * The zone a call is anchored to: a client's own for a client call; for a
 * three-way or a group call the zone of whoever booked it, or the
 * organisation's main office; the coach's own only when nothing else is known.
 */
export function anchorZone({ client = null, booker = null, organisation = null, coachZone }) {
  return [client?.time_zone, booker?.time_zone, organisation?.time_zone, coachZone].find((z) => isZone(z));
}

/**
 * A series' starts: a rule in the client's zone ("every 2 weeks, 07:30 New
 * York time"), each call worked out from the rule, so the time never drifts
 * for the client when either country's clocks change. `every` 0 is one call.
 * @returns {{ rule: object|null, starts: Date[] }}
 */
export function seriesStarts({ first, clientZone, every = 0, count = 1 }) {
  const at = new Date(first);
  if (!every || count <= 1) return { rule: null, starts: [at] };
  const w = wallClock(at, clientZone);
  const rule = seriesRule({ every, time: w.time, zone: clientZone, from: w.date });
  const n = Math.min(SERIES_MAX, count);
  return { rule, starts: seriesCalls(rule, { from: at, to: new Date(at.getTime() + (n * every * 7 + 2) * DAY_MS), limit: n }).map((c) => c.at) };
}

/**
 * The calls of a series that clash with something busy, each as M11's line:
 * "Thu 17 Dec at 15:30 clashes with Supervision with Maya."
 * @returns {{ at: Date, with: string, words: string }[]}
 */
export function seriesClashes(starts, minutes, { items = [], sessions = [], coachZone }) {
  const out = [];
  for (const at of starts) {
    const s = ms(at);
    const clash = busySpans({ items, sessions, from: s - DAY_MS, to: s + DAY_MS }).find((o) => o.start < s + minutes * MIN && o.end > s);
    if (clash) out.push({ at: new Date(s), with: clash.title, words: `${zoneDayWords(at, coachZone)} at ${wallClock(at, coachZone).time} clashes with ${clash.title}.` });
  }
  return out;
}
export const CLASH_ACTION = 'Choose another time for that one';

/** A suggested time in Book a call: "Thu 19 Nov, 15:30" and, for a client elsewhere, "9:30 am for Jordan in Chicago" (with their day when it differs). */
export function suggestionWords(at, { coachZone, clientZone = null, name = '' }) {
  const when = `${zoneDayWords(at, coachZone)}, ${wallClock(at, coachZone).time}`;
  if (!clientZone || sameZone(clientZone, coachZone)) return { when, theirs: '' };
  const day = wallClock(at, clientZone).date === wallClock(at, coachZone).date ? '' : `${zoneDayWords(at, clientZone)}, `;
  return { when, theirs: `${day}${clockWords(at, clientZone)} for ${firstName(name) || 'them'} in ${zonePlace(clientZone)}` };
}

/** The first few free times worth suggesting: at least an hour apart. */
export function suggestTimes(starts, n = 3) {
  const out = [];
  for (const s of starts) { if (!out.length || s - out[out.length - 1] >= HOUR) out.push(s); if (out.length >= n) break; }
  return out;
}

export const TRAVEL_LABEL = 'Travel time each way';
export const TRAVEL_HELP = 'Blocked in your calendar either side.';
/** The travel time either side of a call in person: two items that belong to it and move with it. */
export function travelItems(item, minutes, newId) {
  if (!minutes) return [];
  const one = (starts, ends) => newItem({ id: newId(), coachId: item.coach_id, kind: 'travel', title: 'Travel', starts_at: iso(starts), ends_at: iso(ends), time_zone: item.time_zone, travel_for: item.id });
  return [one(ms(item.starts_at) - minutes * MIN, ms(item.starts_at)), one(ms(item.ends_at), ms(item.ends_at) + minutes * MIN)];
}

/**
 * Book a call: the rows to save. Each call is its own calendar item,
 * anchored to `zone` (the client's own, or the booker's for a three-way or
 * a group), with its own session when it is with a client or a group (so
 * sessions left counts it), its guests, and travel time either side when it
 * is in person. A series' starts come from seriesStarts.
 * @param {{ starts: Date[], minutes: number, zone: string, title: string, client?: object, group?: object, engagementId?: string, sessionKind?: string,
 *   kind?: string, placeKind?: string, location?: string, travelMinutes?: number, people?: object[], notes?: string }} call
 * @param {{ coachId, newId, data?, invites?: boolean }} ctx
 */
export function bookCallPlan({ starts, minutes, zone, title, client = null, group = null, engagementId = null, sessionKind = null, kind = 'client_call', placeKind = 'zoom', location = null, travelMinutes = 0, people = [], notes = null }, { coachId, newId, data = {}, invites = false }) {
  if (!starts?.length) return refused(BOOKING_WORDS.pick);
  if (!isZone(zone)) return refused(BOOKING_WORDS.zone);
  const save = [];
  for (const start of starts) {
    const itemId = newId();
    let sessionId = null;
    if ((client || group) && kind === 'client_call' && SESSION_LENGTHS.includes(minutes)) {
      sessionId = newId();
      save.push([T.sessions, newSession({ id: sessionId, coachId, profileId: client?.id || null, groupId: group?.id || null, engagementId, kind: sessionKind, startsAt: iso(start), minutes, place: placeKind === 'in_person' ? clean(location) || 'In person' : null })]);
    }
    const item = newItem({
      id: itemId, coachId, kind, title: title || group?.name || client?.name || 'Call', starts_at: iso(start), ends_at: iso(ms(start) + minutes * MIN), time_zone: zone, place_kind: placeKind,
      location: clean(location) || null, notes, profile_id: group ? null : client?.id || null, group_id: group?.id || null, session_id: sessionId,
    });
    save.push([T.items, item]);
    if (placeKind === 'in_person') for (const t of travelItems(item, travelMinutes, newId)) save.push([T.items, t]);
    for (const g of guestRows(people, { itemId, coachId, newId, clients: data.clients || [] })) save.push([T.guests, g]);
  }
  const n = starts.length;
  const words = !invites ? (n === 1 ? 'Booked.' : `Booked ${n} calls.`) : placeKind === 'zoom' ? (n === 1 ? 'Booked. The call has its own Zoom link and invite.' : 'Booked. Each call has its own Zoom link and invite.') : 'Booked. The invite is on its way.';
  return plan(data, { save, words });
}

// ---------------------------------------------------------------- Open for calls

export const OPEN_WEEKS = 4; // this week and the four after it
export const OPEN_TITLE = 'Open for calls';
export const COPY_LAST_WEEK = 'Copy last week';

/** "People book 30-minute calls inside these times, with 24 hours’ notice." */
export const openLine = (minutes = 30, noticeHours = 24) => `People book ${minutes}-minute calls inside these times, with ${noticeHours} ${noticeHours === 1 ? 'hour’s' : 'hours’'} notice.`;

/** The last moment an Open for calls block may end: the end of the fourth week after this one, on the coach's own calendar. */
export const openUntil = (now, coachZone) => instantAt(addDays(mondayOf(wallClock(now, coachZone).date), (OPEN_WEEKS + 1) * 7), '00:00', coachZone);

/**
 * An Open for calls block made, moved or resized: it never overlaps
 * something busy ("That overlaps Training."), goes up to 4 weeks ahead, and
 * joins any block of the same call type it touches or overlaps into one.
 * @param {{ block?: object, starts_at: string, ends_at: string, call_type_id?: string }} a `block`: the one being moved, when it exists
 * @param {{ data: { openBlocks, items, sessions }, coachZone, coachId?, newId, now }} ctx
 */
export function placeOpen({ block = null, starts_at, ends_at, call_type_id = block?.call_type_id ?? null }, { data = {}, coachZone, coachId = block?.coach_id, newId, now = null }) {
  const s = ms(starts_at);
  const e = ms(ends_at);
  if (!(e - s >= DRAG_STEP * MIN)) return refused('An open time is at least 15 minutes. Drag a little further.');
  const busy = busySpans({ items: data.items || [], sessions: data.sessions || [], from: s, to: e }).find((o) => o.start < e && o.end > s);
  if (busy) return refused(`That overlaps ${busy.title}.`);
  if (now != null && e <= ms(now)) return refused('That time has passed. Choose a later one.');
  if (now != null && e > openUntil(now, coachZone).getTime()) return refused('Open times go up to 4 weeks ahead. Choose a nearer week.');
  // Touching blocks join up: the earliest keeps its row and the others go.
  const others = (data.openBlocks || []).filter((b) => b.id !== block?.id && (b.call_type_id ?? null) === call_type_id);
  let from = s;
  let to = e;
  const joined = [];
  for (let again = true; again;) {
    again = false;
    for (const b of others) {
      if (joined.includes(b) || ms(b.starts_at) > to || ms(b.ends_at) < from) continue;
      joined.push(b); from = Math.min(from, ms(b.starts_at)); to = Math.max(to, ms(b.ends_at)); again = true;
    }
  }
  const keep = block || joined[0] || null;
  const row = { ...(keep || { id: newId(), coach_id: coachId, time_zone: coachZone, call_type_id }), starts_at: iso(from), ends_at: iso(to), call_type_id };
  return plan(data, { save: [[T.open, row]], remove: joined.filter((b) => b.id !== row.id).map((b) => [T.open, b.id]), words: `Open ${zoneDayWords(from, coachZone)}, ${spanWords(from, to, coachZone)}.` });
}

/** Dragging on empty space in Open for calls. */
export const dragOpen = ({ day, fromMin, toMin }, ctx) => placeOpen({ ...dragTimes({ day, fromMin, toMin, coachZone: ctx.coachZone }) }, ctx);

/**
 * Copy last week: each block of the week before, at the same clock time
 * this week (worked out on the block's own clock, so a clock change between
 * the two weeks never shifts it). One that would overlap something busy is
 * left out, and said.
 * @param {string} monday the Monday of the week being filled
 */
export function copyLastWeek({ monday, data = {}, coachZone, coachId, newId, now = null }) {
  const from = instantAt(addDays(monday, -7), '00:00', coachZone);
  const to = instantAt(monday, '00:00', coachZone);
  const last = (data.openBlocks || []).filter((b) => ms(b.starts_at) >= from && ms(b.starts_at) < to);
  if (!last.length) return refused('Last week had no open times to copy.');
  let blocks = [...(data.openBlocks || [])];
  const save = new Map();
  const remove = new Set();
  const left = [];
  for (const b of last) {
    const zone = zoneOr(b.time_zone, coachZone);
    const a = wallClock(b.starts_at, zone);
    const start = instantAt(addDays(a.date, 7), a.time, zone);
    const made = placeOpen({ starts_at: start.toISOString(), ends_at: iso(start.getTime() + (ms(b.ends_at) - ms(b.starts_at))), call_type_id: b.call_type_id ?? null }, { data: { ...data, openBlocks: blocks }, coachZone, coachId, newId, now });
    if (made.problem) { left.push(made.problem); continue; }
    for (const [, row] of made.save) { save.set(row.id, row); blocks = [...blocks.filter((x) => x.id !== row.id), row]; }
    for (const [, id] of made.remove) { remove.add(id); save.delete(id); blocks = blocks.filter((x) => x.id !== id); }
  }
  if (!save.size) return refused(left[0] || 'Last week had no open times to copy.');
  const was = new Set((data.openBlocks || []).map((b) => b.id));
  return plan(data, {
    save: [...save.values()].map((r) => [T.open, r]), remove: [...remove].filter((id) => was.has(id)).map((id) => [T.open, id]),
    words: left.length ? `Copied from last week. ${left.length === 1 ? '1 time was' : `${left.length} times were`} left out, because something is in the way.` : 'Copied from last week.',
  });
}

// ---------------------------------------------------------------- polls, and Offer times by email

export const POLL_MIN = 2;
export const POLL_MAX = 5;
export const POLL_HELD_LINE = 'The times stay held in your calendar until you confirm one.';
/** The poll bar while picking: "Pick 2 to 5 times", then "3 picked". */
export const pollPickWords = (n) => (n ? `${n} picked` : 'Pick 2 to 5 times');
/** Why a pick can't be added or the poll can't go yet; null when it can. */
export function pollProblem(picked, { adding = false } = {}) {
  if (adding && picked.length >= POLL_MAX) return 'Up to 5 times in one poll.';
  if (!adding && picked.length < POLL_MIN) return 'Pick at least 2 times.';
  return null;
}

/**
 * A new poll: its row, the people asked (each with their own link's key),
 * the times offered, and each time held in the calendar (a dashed "hold"
 * item, busy until one is confirmed).
 * @param {{ title, minutes, placeKind, zone, people: { name, email, profile_id?, time_zone? }[], starts: Date[] }} poll `zone`: the anchor, the booker's own
 */
export function newPollPlan({ title, minutes = 60, placeKind = 'zoom', zone, people = [], starts = [] }, { coachId, newId, data = {} }) {
  const problem = pollProblem(starts) || (starts.length > POLL_MAX ? 'Up to 5 times in one poll.' : null);
  if (problem) return refused(problem);
  const pollId = newId();
  const names = joinNames(people.map((p) => firstName(p.name)));
  const save = [[T.polls, { id: pollId, coach_id: coachId, title: cut(clean(title), 200) || 'Poll', minutes, place_kind: placeKind, time_zone: zone, status: 'open', confirmed_option_id: null, confirmed_item_id: null, notes: null }]];
  people.forEach((p, position) => save.push([T.pollPeople, { id: newId(), poll_id: pollId, coach_id: coachId, name: clean(p.name), email: p.email ? String(p.email).toLowerCase() : null, profile_id: p.profile_id || null, time_zone: zoneOr(p.time_zone, zone), vote_key: newId(), voted_at: null, position }]));
  [...starts].sort((a, b) => a - b).forEach((start, position) => {
    const optionId = newId();
    const times = { starts_at: iso(start), ends_at: iso(ms(start) + minutes * MIN) };
    save.push([T.pollOptions, { id: optionId, poll_id: pollId, coach_id: coachId, ...times, position }]);
    save.push([T.items, newItem({ id: newId(), coachId, kind: 'hold', title: names || clean(title) || 'Held', ...times, time_zone: zone, poll_option_id: optionId })]);
  });
  return plan(data, { save, words: names ? `The poll is ready for ${names}. The times stay held.` : 'The poll is ready. The times stay held.', pollId });
}

/** The tabs over a poll's times: "Your times", then "As Mia sees it" for each person (their own zone). */
export const pollTabs = (people, coachZone) => [{ value: 'me', label: 'Your times', zone: coachZone }, ...(people || []).map((p) => ({ value: p.id, label: `As ${firstName(p.name)} sees it`, zone: zoneOr(p.time_zone, coachZone) }))];

/**
 * A poll's times with who can make each: "Mia can, Paul can’t", and
 * "Everyone can" on a time that suits them all (the best first when sorted
 * by `yes`).
 * @returns {{ option, when: string, votes: string, everyone: boolean, yes: number }[]}
 */
export function pollRows({ options = [], people = [], votes = [], zone }) {
  return [...options].sort((a, b) => ms(a.starts_at) - ms(b.starts_at)).map((option) => {
    const said = people.map((p) => ({ p, v: votes.find((x) => x.option_id === option.id && x.person_id === p.id) }));
    const answered = said.filter((s) => s.v);
    const everyone = people.length > 0 && said.every((s) => s.v?.can === true);
    const words = answered.length ? answered.map((s) => `${firstName(s.p.name)} ${s.v.can ? 'can' : 'can’t'}`).join(', ') : 'No answers yet';
    return { option, when: `${zoneDayWords(option.starts_at, zone)}, ${timeWords(option.starts_at, zone)}`, votes: everyone ? `${words}. Everyone can` : words, everyone, yes: said.filter((s) => s.v?.can === true).length };
  });
}

/**
 * Confirm: the chosen time becomes the call (its held item turns into a
 * real one, with everyone asked as its guests) and every other held time is
 * released at once.
 */
export function confirmPollPlan({ poll, option, people = [], kind = null }, { data = {}, newId }) {
  const holds = (data.items || []).filter((i) => i.kind === 'hold' && (data.pollOptions || []).some((o) => o.poll_id === poll.id && o.id === i.poll_option_id));
  const held = holds.find((i) => i.poll_option_id === option.id);
  const withClient = people.find((p) => p.profile_id);
  const item = { ...(held || newItem({ id: newId(), coachId: poll.coach_id, title: poll.title, starts_at: option.starts_at, ends_at: option.ends_at, time_zone: poll.time_zone })), kind: kind || (withClient ? 'client_call' : 'other'), title: poll.title, place_kind: poll.place_kind || 'zoom', poll_option_id: null };
  return plan(data, {
    // The poll goes first: a poll another tab has just settled refuses it (054), so nothing else of this confirm is saved.
    save: [[T.polls, { ...poll, status: 'confirmed', confirmed_option_id: option.id, confirmed_item_id: item.id }], [T.items, item], ...guestRows(people, { itemId: item.id, coachId: poll.coach_id, newId, clients: data.clients || [] }).map((g) => [T.guests, g])],
    remove: holds.filter((i) => i.id !== item.id).map((i) => [T.items, i.id]),
    words: `Confirmed for ${zoneDayWords(option.starts_at, zoneOr(poll.time_zone))}. The other times are free again.`,
  });
}

/** Cancel a poll: it is marked cancelled and every held time is released. */
export function cancelPollPlan({ poll }, { data = {} }) {
  const holds = (data.items || []).filter((i) => i.kind === 'hold' && (data.pollOptions || []).some((o) => o.poll_id === poll.id && o.id === i.poll_option_id));
  return plan(data, { save: [[T.polls, { ...poll, status: 'cancelled' }]], remove: holds.map((i) => [T.items, i.id]), words: 'The poll is cancelled. Its times are free again.' });
}

/**
 * The note that asks one person for their times, drafted in THEIR zone and
 * never sent from here (the page opens it in the coach's email app).
 * @param {{ person, poll, options, link: string, coachFirstName?: string }} a `link`: the person's own poll page
 */
export function pollNote({ person, poll, options = [], link, coachFirstName = '' }) {
  const zone = zoneOr(person.time_zone, zoneOr(poll.time_zone));
  const times = [...options].sort((a, b) => ms(a.starts_at) - ms(b.starts_at)).map((o) => `${zoneDayWords(o.starts_at, zone)}, ${clockWords(o.starts_at, zone)}`);
  return {
    name: person.name, email: person.email || '', subject: `Times for ${poll.title}`,
    body: [`Hi ${firstName(person.name)},`, `Which of these would work for ${poll.title}? They are in ${zoneLabel(zone)}.`, times.join('\n'), `Tick the ones you can make here: ${link}`, coachFirstName].filter(Boolean).join('\n\n'),
  };
}

export const OFFER_TIMES = 'Offer times by email';
export const OFFER_ZONE_LABEL = 'Their time zone';
/** What a picked free time says in its cell: "7:00 am New York". */
export const offerCellWords = (instant, zone) => `${clockWords(instant, zone)} ${zonePlace(zone)}`;

/**
 * Offer times by email: the picked times written in the READER's own zone
 * (12-hour for the US and Canada, the day in words), ready to copy into an
 * email. Nothing is sent and nothing is held.
 * @returns {{ text: string, words: string, problem: string|null }}
 */
export function offerTimesText({ starts = [], minutes = 60, zone }) {
  if (!starts.length) return { text: '', words: '', problem: 'Pick a free time first.' };
  const lines = [...starts].sort((a, b) => a - b).map((s) => `${zoneDayWords(s, zone)}, ${clockWords(s, zone)}`);
  return {
    text: [`Would any of these work for a ${minutes}-minute call? They are in ${zoneLabel(zone)}.`, ...lines].join('\n'),
    words: `Copied ${starts.length} ${starts.length === 1 ? 'time' : 'times'} in ${zoneLabel(zone)}.`, problem: null,
  };
}

// ---------------------------------------------------------------- Google Calendar: what is read back, and what is pushed

const REPLY_FROM_GOOGLE = { accepted: 'yes', declined: 'no', tentative: 'maybe', needsAction: 'none' };
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** A repeat's rule as the RRULE Google keeps ("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"), from the item's first day; null for none. */
export function rruleFrom(rule, firstDay) {
  if (!rule || !rule.every) return null;
  const parts = [];
  const n = Number(rule.interval) || 1;
  if (rule.every === 'weekday') parts.push('FREQ=WEEKLY', 'BYDAY=MO,TU,WE,TH,FR');
  else {
    parts.push(`FREQ=${{ day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[rule.every]}`);
    if (n > 1) parts.push(`INTERVAL=${n}`);
    if (rule.every === 'week' && rule.weekdays?.length) parts.push(`BYDAY=${[...rule.weekdays].sort((a, b) => a - b).map((d) => BYDAY[d]).join(',')}`);
    if (rule.every === 'month' && rule.by === 'weekday') { const dd = partsOf(firstDay)[2]; parts.push(`BYDAY=${dd > 28 ? -1 : Math.ceil(dd / 7)}${BYDAY[dow(firstDay)]}`); }
  }
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  else if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}T235959Z`);
  return `RRULE:${parts.join(';')}`;
}

/** An RRULE read back as a repeat's rule; null for one the portal can't keep (the event then shows once, and stays whole in Google). */
export function ruleFromRRule(lines) {
  const line = (Array.isArray(lines) ? lines : [lines]).find((l) => /^RRULE:/i.test(String(l || '')));
  if (!line) return null;
  const p = Object.fromEntries(line.replace(/^RRULE:/i, '').split(';').map((kv) => kv.split('=')).filter((kv) => kv.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const every = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[p.FREQ];
  if (!every) return null;
  const rule = { every };
  if (p.INTERVAL && Number(p.INTERVAL) > 1) rule.interval = Number(p.INTERVAL);
  const days = (p.BYDAY || '').split(',').filter(Boolean);
  if (every === 'week' && days.length) {
    const list = days.map((d) => BYDAY.indexOf(d)).sort((a, b) => a - b);
    if (list.includes(-1)) return null;
    if (list.join() === '1,2,3,4,5' && !rule.interval) rule.every = 'weekday'; else rule.weekdays = list;
  } else if (every === 'month' && days.length) {
    if (days.length > 1 || !/^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$/.test(days[0])) return null;
    rule.by = 'weekday';
  } else if (days.length) return null;
  if (p.COUNT) rule.count = Number(p.COUNT);
  else if (p.UNTIL && /^\d{8}/.test(p.UNTIL)) rule.until = `${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}`;
  return repeatOk(rule) ? rule : null;
}

/**
 * A calendar item as the event Google keeps. It is made in the item's own
 * anchor zone (the client's, for a client call), so their calendar always
 * shows the time they agreed to; the Zoom link goes with the invite.
 */
export function googleEventFrom(item, { guests = [] } = {}) {
  const zone = zoneOr(item.time_zone);
  const first = item.all_day ? (item.starts_on || wallClock(item.starts_at, zone).date) : wallClock(item.starts_at, zone).date;
  const rrule = rruleFrom(item.repeat_rule, first);
  const stamp = (t) => { const w = wallClock(t, zone); return `${w.date}T${w.time}:${p2(w.second)}`; };
  return {
    summary: item.title,
    description: [item.notes, item.meeting_link ? `Join on Zoom: ${item.meeting_link}` : ''].filter(Boolean).join('\n\n') || undefined,
    location: item.meeting_link || item.location || undefined,
    start: item.all_day ? { date: first } : { dateTime: stamp(item.starts_at), timeZone: zone },
    end: item.all_day ? { date: addDays(item.ends_on || first, 1) } : { dateTime: stamp(item.ends_at), timeZone: zone },
    recurrence: rrule ? [rrule] : undefined,
    attendees: guests.filter((g) => g.item_id === item.id && g.email).map((g) => ({ email: g.email, displayName: g.name || undefined })),
    transparency: item.busy === false ? 'transparent' : 'opaque',
    visibility: item.private ? 'private' : 'default',
    status: item.kind === 'hold' ? 'tentative' : 'confirmed',
    extendedProperties: { private: { clarityId: item.id, clarityKind: item.kind } },
  };
}

const eventTimes = (event, fallbackZone) => {
  if (event.start?.date) {
    const zone = fallbackZone;
    const last = addDays(event.end?.date || addDays(event.start.date, 1), -1);
    return { all_day: true, starts_on: event.start.date, ends_on: last < event.start.date ? event.start.date : last, time_zone: zone, starts_at: instantAt(event.start.date, '00:00', zone).toISOString(), ends_at: instantAt(addDays(last < event.start.date ? event.start.date : last, 1), '00:00', zone).toISOString() };
  }
  const read = (side) => {
    const raw = String(side?.dateTime || '');
    if (/(Z|[+-]\d{2}:\d{2})$/.test(raw)) return new Date(raw);
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(raw);
    return m ? instantAt(m[1], m[2], zoneOr(side?.timeZone, fallbackZone)) : new Date(NaN);
  };
  const text = (d) => (Number.isNaN(d.getTime()) ? '' : d.toISOString()); // a side that can't be read is no time (never a thrown error)
  return { all_day: false, starts_on: null, ends_on: null, time_zone: zoneOr(event.start?.timeZone, fallbackZone), starts_at: text(read(event.start)), ends_at: text(read(event.end)) };
};

/**
 * Whether an event read from Google can be kept as a calendar item: real
 * times, an end after its start, and no longer than the 32 days 051 keeps.
 * One that can't is left where it is in Google and skipped here: before
 * this, a single event with no end stopped every round of the sync, for
 * good (the break-it tester, 20 Nov).
 */
export function googleEventReadable(event, fallbackZone) {
  if (!event || !event.id) return false;
  if (event.status === 'cancelled') return true;
  try {
    const t = eventTimes(event, fallbackZone);
    const [a, z] = [ms(t.starts_at), ms(t.ends_at)];
    return !Number.isNaN(a) && !Number.isNaN(z) && z > a && z - a <= 32 * DAY_MINUTES * MIN;
  } catch {
    return false;
  }
}

// "Changed here since it was last in step" can't be read from updated_at (every
// save restamps it, a sync's own save included), so each item keeps, beside
// Google's tag for its event, a short print of what was last in step:
// google_etag holds "<Google's etag> <print>". The print covers what Google
// is given (the title, the times, the repeat, the place, the notes, busy,
// private, and who is invited), never a reply or anything Google doesn't hold.
const SYNC_FIELDS = ['title', 'time_zone', 'all_day', 'starts_on', 'ends_on', 'location', 'meeting_link', 'notes', 'kind'];

/** A short print of what Google is given for an item. */
export function syncPrint(item, guests = []) {
  const text = JSON.stringify([
    ...SYNC_FIELDS.map((f) => item[f] ?? null), ms(item.starts_at), ms(item.ends_at), item.repeat_rule ? JSON.stringify(item.repeat_rule, Object.keys(item.repeat_rule).sort()) : null,
    item.busy !== false, Boolean(item.private), Boolean(item.removed), guests.filter((g) => g.item_id === item.id && g.email).map((g) => String(g.email).toLowerCase()).sort(),
  ]);
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}
/** What google_etag keeps: Google's own tag, then the print of the item as it was in step. */
export const syncMark = (etag, item, guests = []) => `${String(etag || '-').replace(/\s+/g, '')} ${syncPrint(item, guests)}`.slice(0, 200);
/** Google's own tag for an item's event, as last read. */
export const etagOf = (item) => { const tag = String(item?.google_etag || '').split(' ')[0]; return tag && tag !== '-' ? tag : null; };
/** Whether an item was changed here since it was last in step with Google (or has never been there). */
export const changedHere = (item, guests = []) => !item.google_event_id || String(item.google_etag || '').split(' ')[1] !== syncPrint(item, guests);

/**
 * Changes read back from Google Calendar, merged into the device's items.
 *
 * THE CONFLICT RULE. The two calendars must never silently disagree
 * (time-zone-safeguards.md, rule 15), so for an item both sides know:
 *   - Google wins when its event changed and the portal's copy has not been
 *     changed since it was last in step (the usual case: Tim moved it in
 *     Google). A call whose time moved is marked "Moved in Google Calendar".
 *   - The portal wins only when it was changed here since the two were last
 *     in step AND that change is the NEWER of the two (the item's updated_at
 *     is after the event's own `updated`): the newest choice wins, and it is pushed to Google on this
 *     same sync (toPush), so both end the same. On a tie Google wins,
 *     because the portal is the one that follows.
 *   - While an item is being EDITED nothing is changed under the coach: the
 *     change waits as a conflict the page shows ("This changed in Google
 *     Calendar."). Saving the edit makes the portal's the newer change;
 *     leaving it lets Google's in on the next sync.
 *   - An event deleted in Google removes the item (and what hangs from it)
 *     unless the portal's change is the newer, which puts it back in Google.
 * An item's anchor zone is never changed by a sync: only its instants move.
 * @param {{ items?: object[], guests?: object[], sessions?: object[], events: object[], editingId?: string, now: Date|string, coachZone: string, coachId?: string, newId: () => string, calendarOf?: (event) => string }} a
 * @returns {{ save: [string, object][], remove: [string, string][], conflicts: { id: string, reason: 'editing', event: object, words: string }[], moved: object[], kept: string[] }}
 *   `kept`: items whose own newer change stands (they are pushed next).
 */
export function mergeFromGoogle({ items = [], guests = [], sessions = [], events = [], editingId = null, now, coachZone, coachId = null, newId, calendarOf = () => 'work' }) {
  const stamp = iso(now);
  const save = [];
  const remove = [];
  const conflicts = [];
  const moved = [];
  const kept = [];
  const byEvent = new Map(items.filter((i) => i.google_event_id).map((i) => [i.google_event_id, i]));
  const byId = new Map(items.map((i) => [i.id, i]));
  const newerHere = (item, event) => changedHere(item, guests) && ms(item.updated_at) > (ms(event.updated) || 0);
  for (const event of events) {
    if (!googleEventReadable(event, coachZone)) continue;
    const item = byEvent.get(event.id) || byId.get(event.extendedProperties?.private?.clarityId) || null;
    const gone = event.status === 'cancelled';
    if (!item) {
      if (gone) continue;
      // One time of a repeat changed in Google: it stands in for that time of the series.
      const series = event.recurringEventId ? byEvent.get(event.recurringEventId) : null;
      const times = eventTimes(event, series?.time_zone || coachZone);
      if (Number.isNaN(ms(times.starts_at)) || Number.isNaN(ms(times.ends_at))) continue;
      const original = event.originalStartTime?.dateTime || event.originalStartTime?.date || null;
      const made = newItem({
        id: newId(), coachId: series?.coach_id || coachId, kind: series?.kind || 'other', calendar: series?.calendar || calendarOf(event), title: clean(event.summary) || 'Busy', ...times,
        time_zone: series?.time_zone || times.time_zone, location: clean(event.location) || null, notes: event.description || null, busy: event.transparency !== 'transparent', private: event.visibility === 'private',
        repeat_rule: series ? null : ruleFromRRule(event.recurrence), series_id: series?.id || null,
        occurrence_on: series && original ? (original.length === 10 ? original : wallClock(eventTimes({ start: event.originalStartTime, end: event.originalStartTime }, series.time_zone).starts_at, zoneOr(series.time_zone)).date) : null,
        google_event_id: event.id, google_calendar_id: event.calendarId || null, google_synced_at: stamp,
      });
      save.push([T.items, { ...made, google_etag: syncMark(event.etag, made) }]);
      continue;
    }
    if (!gone && event.etag && event.etag === etagOf(item)) continue;
    if (item.id === editingId) { conflicts.push({ id: item.id, reason: 'editing', event, words: gone ? 'This was deleted in Google Calendar. Save to keep it, or close to let it go.' : 'This changed in Google Calendar. Save to keep your version, or close to take the new one.' }); continue; }
    if (newerHere(item, event)) { kept.push(item.id); continue; }
    if (gone) {
      const session = sessions.find((s) => s.id === item.session_id);
      for (const g of guests.filter((x) => x.item_id === item.id)) remove.push([T.guests, g.id]);
      for (const part of items.filter((x) => x.travel_for === item.id || x.series_id === item.id)) remove.push([T.items, part.id]);
      remove.push([T.items, item.id]);
      if (session && !session.outcome && !session.recap_sent_at) remove.push([T.sessions, session.id]);
      continue;
    }
    const times = eventTimes(event, item.time_zone || coachZone);
    if (Number.isNaN(ms(times.starts_at)) || Number.isNaN(ms(times.ends_at))) continue;
    const timeMoved = ms(times.starts_at) !== ms(item.starts_at) || ms(times.ends_at) !== ms(item.ends_at);
    const isCall = CALL_KINDS.includes(item.kind);
    const next = {
      ...item, title: clean(event.summary) || item.title, location: item.meeting_link ? item.location : (clean(event.location) || null),
      starts_at: times.starts_at, ends_at: times.ends_at, all_day: times.all_day, starts_on: times.starts_on, ends_on: times.ends_on,
      repeat_rule: item.series_id ? null : (event.recurrence ? ruleFromRRule(event.recurrence) ?? item.repeat_rule : item.repeat_rule),
      busy: event.transparency !== 'transparent', google_event_id: event.id, google_synced_at: stamp,
      moved_in_google_at: timeMoved && isCall ? stamp : item.moved_in_google_at ?? null,
    };
    next.google_etag = syncMark(event.etag, next, guests);
    save.push([T.items, next]);
    if (timeMoved) {
      moved.push(next);
      const session = sessions.find((s) => s.id === item.session_id);
      const minutes = Math.round((ms(times.ends_at) - ms(times.starts_at)) / MIN);
      if (session && !session.recap_sent_at) save.push([T.sessions, { ...session, starts_at: times.starts_at, minutes: sessionMinutes(minutes, session.minutes) }]);
      const shift = ms(times.starts_at) - ms(item.starts_at);
      const grew = ms(times.ends_at) - ms(item.ends_at);
      for (const t of items.filter((x) => x.travel_for === item.id)) { const by = ms(t.starts_at) >= ms(item.ends_at) ? grew : shift; save.push([T.items, { ...t, starts_at: iso(ms(t.starts_at) + by), ends_at: iso(ms(t.ends_at) + by) }]); }
    }
    // Replies (yes, no, maybe) show on the item.
    for (const a of event.attendees || []) {
      const g = guests.find((x) => x.item_id === item.id && x.email && String(x.email).toLowerCase() === String(a.email || '').toLowerCase());
      const reply = REPLY_FROM_GOOGLE[a.responseStatus] || 'none';
      if (g && (g.reply || 'none') !== reply) save.push([T.guests, { ...g, reply, replied_at: reply === 'none' ? null : stamp }]);
    }
  }
  return { save, remove, conflicts, moved, kept };
}

/** The coach has seen a call that was moved in Google: the mark comes off. */
export const seenMoved = (item) => ({ ...item, moved_in_google_at: null });

/**
 * What to push to Google: every work item it doesn't have yet (create), and
 * every one changed here since it was last in step (update: changedHere). Items read
 * from the coach's other Google calendars go back to their own calendar;
 * an item being edited waits until it is saved.
 * @returns {{ op: 'create'|'update', item: object, event: object }[]}
 */
export function toPush({ items = [], guests = [], editingId = null }) {
  const out = [];
  for (const item of items) {
    if (item.id === editingId || (item.removed && !item.google_event_id)) continue;
    if (item.series_id && !item.google_event_id && !items.find((s) => s.id === item.series_id)?.google_event_id) continue; // its series goes first
    const event = googleEventFrom(item, { guests });
    if (item.removed) { if (changedHere(item, guests)) out.push({ op: 'update', item, event: { ...event, status: 'cancelled' } }); continue; }
    if (!item.google_event_id) { if ((item.calendar || 'work') === 'work') out.push({ op: 'create', item, event }); continue; }
    if (changedHere(item, guests)) out.push({ op: 'update', item, event });
  }
  return out;
}

/** An item after Google has taken it: its event's id and tag, in step as of now. */
export function afterPush(item, event, now, guests = []) {
  const next = { ...item, google_event_id: event.id, google_calendar_id: event.calendarId ?? item.google_calendar_id ?? null, google_synced_at: iso(now) };
  return { ...next, google_etag: syncMark(event.etag, next, guests) };
}

export const SYNC_WORDS = Object.freeze({
  standIn: 'Google Calendar isn’t connected yet, so your calendar is kept in the portal only.',
  connected: 'In step with Google Calendar.',
  waiting: 'Changes will reach Google Calendar when you’re back online.',
  problem: 'Google Calendar didn’t answer. Your changes are safe here and will be sent again.',
  zoomStandIn: 'Zoom isn’t connected yet, so calls have no Zoom link.',
  zoomProblem: 'Zoom didn’t answer. Your calls are safe here and their links will be made again.',
});

// ---------------------------------------------------------------- the next-call bar, Join on Zoom, clock changes and reminders

/**
 * The calls the next-call bar is told about (model.js's callForBar and
 * nextCallBar decide the rest: from 10 minutes before until 10 minutes in,
 * coral from 5 minutes before, "is starting now").
 * @returns {{ name: string, startsAt: string, zoom: string|null, briefTo: string|null, sessionId: string|null }[]} `sessionId`: a client's session, whose brief the bar opens
 */
export function barCalls({ items = [], sessions = [], clients = [], groups = [], now, coachZone, settings = null }) {
  const today = wallClock(now, coachZone).date;
  return calendarEntries({ items, sessions, clients, groups }, { fromDay: addDays(today, -1), toDay: addDays(today, 1), coachZone, settings, showTodos: false })
    .filter((e) => e.isCall && Math.abs(e.startsAt - new Date(now)) <= 2 * HOUR)
    .map((e) => ({
      name: e.title, startsAt: e.startsAt.toISOString(), zoom: joinLink(e.item, e.session),
      briefTo: e.session ? `/coach/sessions/${e.session.id}` : (e.item?.profile_id ? `/coach/clients/${e.item.profile_id}` : null),
      sessionId: e.session && e.session.profile_id ? e.session.id : null,
    }));
}

/**
 * The quiet line on Today in a clock-change week (time-zone-safeguards.md,
 * rule 1): from the Monday before any clock change that moves one of the
 * coach's calls, in a client's zone or the coach's own. Each call stays at
 * its usual time for the client; what the line gives is the coach's own
 * time before and after. The words are the time library's (clockChangeLine).
 * @returns {string[]} one line a change, soonest first
 */
export function clockChangeLines({ items = [], sessions = [], clients = [], now, coachZone }) {
  const today = wallClock(now, coachZone).date;
  const from = instantAt(today, '00:00', coachZone);
  const calls = calendarEntries({ items, sessions, clients }, { fromDay: today, toDay: addDays(today, 21), coachZone, showTodos: false }).filter((e) => e.isCall && e.kind === 'client_call');
  const zones = [...new Set([coachZone, ...calls.map((e) => e.clientZone).filter(Boolean)])];
  const lines = [];
  for (const zone of zones) {
    for (const change of clockChanges(zone, from, 7)) {
      if (today < mondayOf(change.date)) continue; // from the Monday before the change
      const moves = [];
      for (const e of calls) {
        const anchor = e.clientZone || coachZone;
        if (zone !== coachZone ? anchor !== zone : !e.clientZone) continue;
        if (e.startsAt < change.at || e.startsAt.getTime() > change.at.getTime() + 7 * DAY_MS) continue;
        // The same clock time for the client a week earlier, on the coach's own clock: what the call "was".
        const c = wallClock(e.startsAt, anchor);
        const was = wallClock(instantAt(addDays(c.date, -7), c.time, anchor), coachZone).time;
        const nowTime = wallClock(e.startsAt, coachZone).time;
        if (was !== nowTime && !moves.some((m) => m.name === firstName(e.title))) moves.push({ name: firstName(e.title), zone: anchor, change: { ...change, zone }, call: { at: e.startsAt, date: wallClock(e.startsAt, anchor).date }, was, now: nowTime });
      }
      if (moves.length) lines.push({ at: change.at, change: { ...change, zone }, moves, key: `${change.date}|${change.direction}|${zone === coachZone ? 'own' : zoneCountry(zone) || zone}` });
    }
  }
  // One line a change: a country's clocks change on one day whatever its zones (New York and Chicago), so their calls share a line.
  const merged = [];
  for (const l of lines.sort((a, b) => a.at - b.at)) {
    const same = merged.find((m) => m.key === l.key);
    if (same) same.moves.push(...l.moves.filter((m) => !same.moves.some((x) => x.name === m.name)));
    else merged.push({ ...l, moves: [...l.moves] });
  }
  return merged.map((l) => clockChangeLine({ coachZone, change: l.change, moves: l.moves }));
}

export const DAY_BEFORE_HOUR = '18:00';

/**
 * When a call's reminders go: the day before at 18:00 in the reader's own
 * time (the client's), and 1 hour before. The 1-hour one never gives a
 * clock time, so it can't be wrong.
 * @returns {{ kind: 'day_before'|'hour_before', at: Date, givesClockTime: boolean }[]}
 */
export function reminderTimes(startsAt, readerZone) {
  const day = addDays(wallClock(startsAt, readerZone).date, -1);
  return [
    { kind: 'day_before', at: instantAt(day, DAY_BEFORE_HOUR, readerZone), givesClockTime: true },
    { kind: 'hour_before', at: hourBeforeReminderAt(startsAt), givesClockTime: false },
  ];
}

/** Whether a reminder is due: its moment has come and the call hasn't started. */
export function reminderDue(kind, startsAt, readerZone, now) {
  const r = reminderTimes(startsAt, readerZone).find((x) => x.kind === kind);
  return Boolean(r) && ms(now) >= r.at.getTime() && ms(now) < ms(startsAt);
}

/**
 * When an automatic email that isn't tied to a call's hour goes (a nudge, a
 * summary): in the reader's own morning, 07:00 to 09:00 their time. Inside
 * that window it goes now; otherwise at the next 07:00 where they are.
 */
export function morningSendAt(now, readerZone) {
  const t = new Date(now);
  if (inTheMorning(t, readerZone)) return t;
  const today = wallClock(t, readerZone).date;
  const seven = morningOf(today, readerZone);
  return seven > t ? seven : morningOf(addDays(today, 1), readerZone);
}

/** What the day-before email says, in the reader's own time: "Your call with Tim is tomorrow at 9:00 am New York time." */
export const dayBeforeWords = (startsAt, readerZone, coachFirstName) => `Your call with ${coachFirstName || 'your coach'} is tomorrow at ${timeWords(startsAt, readerZone)}.`;
/** What the 1-hour email says: never a clock time. */
export const hourBeforeWords = (coachFirstName) => `Your call with ${coachFirstName || 'your coach'} starts in 1 hour.`;
export const REMINDER_SWITCHES = [{ key: 'remind_24', label: 'Email 24 hours before', startsOn: true }, { key: 'remind_1', label: 'Email 1 hour before', startsOn: false }];

// ---------------------------------------------------------------- booking: what its pages show (run 3, step 4)

/** The addresses of the pages outside the portal: a call type's page, a single-use link, a guest's own booking and a poll. */
export const BOOK_PATHS = Object.freeze({ page: (key) => `/book/${key}`, link: (key) => `/book/link/${key}`, mine: (key) => `/book/mine/${key}`, poll: (key) => `/poll/${key}` });
/** A key is only ever a uuid: anything else is nobody's link, and the database is never asked about it. */
export const isBookingKey = (key) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(key || ''));
/** A page's whole address, from the page's own origin (never written out). */
export const publicLink = (origin, path) => `${String(origin || '').replace(/\/+$/, '')}${path}`;

/** The two call types every coach starts with, for a device that has none yet (as 051's coach_call_types_start()). */
export function startingCallTypes({ coachId, newId, have = [] }) {
  const type = (key, name, notice, ahead, position) => ({
    id: newId(), coach_id: coachId, key, name, description: null, minutes: 30, gap_before: 15, gap_after: 15, notice_hours: notice, ahead_weeks: ahead, day_limit: MAX_CALLS_A_DAY,
    questions: [], place_kind: 'zoom', page_key: newId(), active: true, makes_lead: true, position,
  });
  return [type('chemistry', 'Chemistry Call', 24, 4, 0), type('connection', 'Connection Call', 48, 2, 1)].filter((t) => !have.some((x) => x.key === t.key));
}

/** What a call type's Edit asks, each with its bounds (as 051 checks them). */
export const CALL_TYPE_ROWS = [
  { key: 'minutes', label: 'How long?', unit: 'minutes', min: 15, max: 240, step: 15 },
  { key: 'gap_before', label: 'Gap before', unit: 'minutes before', min: 0, max: 120, step: 5 },
  { key: 'gap_after', label: 'Gap after', unit: 'minutes after', min: 0, max: 120, step: 5 },
  { key: 'notice_hours', label: 'Notice needed', unit: 'hours of notice', min: 0, max: 720, step: 1 },
  { key: 'ahead_weeks', label: 'Open this far ahead', unit: 'weeks ahead', min: 1, max: 12, step: 1 },
  { key: 'day_limit', label: 'Calls a day, at most', unit: 'calls a day', min: 1, max: 20, step: 1 },
];
export const QUESTIONS_MAX = 10;
/** A whole number typed into a number editor, or null. */
export const wholeNumber = (typed) => (/^\s*\d{1,4}\s*$/.test(String(typed ?? '')) ? Number(String(typed).trim()) : null);
/** Why a typed number can't be kept for a row with bounds; null when it can. */
export function numberProblem(row, typed) {
  const n = wholeNumber(typed);
  if (n == null || n < row.min || n > row.max) return `Type a number from ${row.min} to ${row.max}.`;
  if (row.key === 'minutes' && n % 15 !== 0) return 'Type a length in quarter hours, like 30 or 45.';
  return null;
}
/** A call type's draft checked: the first calm line, or null. */
export function callTypeProblem(draft) {
  if (!clean(draft.name)) return 'Type a name to carry on.';
  for (const row of CALL_TYPE_ROWS) { const p = numberProblem(row, draft[row.key]); if (p) return `${row.label} ${p.charAt(0).toLowerCase()}${p.slice(1)}`; }
  return null;
}
/** The questions a call type keeps: each typed line that holds something, at most 10, keeping an old question's id and kind. */
export function questionsToSave(rows, newId) {
  return (rows || []).map((q) => ({ ...q, label: cut(clean(q.label), 200) })).filter((q) => q.label).slice(0, QUESTIONS_MAX)
    .map((q) => ({ id: q.id || newId(), label: q.label, kind: q.kind === 'short' ? 'short' : 'long', required: q.required === true }));
}
/** A booking page's question as it is asked: its label whichever older shape kept it. */
export const questionLabel = (q) => clean(q?.label ?? q?.q ?? '');

/** The limit a number editor saves: the number itself (bookingLimits reads it, and 051 its leading whole number). */
export const limitToSave = (booking, key, typed) => ({ ...(booking || {}), [key]: wholeNumber(typed) });

// ---- Book a call

/** What kind of session Book a call offers for one client; a group's is always its own. */
export const BOOK_KINDS = [{ value: 'coaching', label: 'Coaching session' }, { value: 'three_way', label: 'Three-way meeting' }, { value: 'review', label: 'Review' }, { value: 'other', label: 'Session' }];
export const BOOK_WITH_SOMEONE_ELSE = 'someone_else';
/** Who a call can be with: each client, each group, then someone who isn't a client (a single-use link's kind of call). */
export function bookWhoChoices({ clients = [], groups = [] }) {
  return [
    ...clients.filter((c) => c.status !== 'past').map((c) => ({ value: `c:${c.id}`, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    ...groups.map((g) => ({ value: `g:${g.id}`, label: g.name })).sort((a, b) => a.label.localeCompare(b.label)),
    { value: BOOK_WITH_SOMEONE_ELSE, label: 'Someone else' },
  ];
}

/**
 * The times Book a call suggests: free in the coach's working day, clear of
 * every other call by the gap, on a quarter hour in the client's own time and
 * between 07:00 and 20:00 where the client is, from an hour from now.
 * @returns {Date[]}
 */
export function bookSuggestions({ minutes, zone, coachZone, settings = null, data = {}, now, days = 14, earlyAndLate = false }) {
  return freeTimes({
    source: 'hours', minutes, from: now, to: new Date(ms(now) + days * DAY_MS), now, coachZone, clientZone: zone, bookerZone: zone, settings, items: data.items || [], sessions: data.sessions || [],
    noticeHours: 1, aheadWeeks: Math.ceil(days / 7), earlyAndLate,
  });
}

/** A typed day and time on the coach's own clock as a start, or a calm line. */
export function typedStart({ day, time, coachZone }) {
  const m = minutesOfTime(time);
  if (!day || m == null) return { start: null, problem: 'Choose a day and a time to carry on.' };
  return { start: instantAt(day, hhmm(m), coachZone), problem: null };
}

/** "Thu 19 Nov, 15:30 UK time · 9:30 am Chicago time", with both days when they differ: the line under a chosen time. */
export const bookWhenWords = (start, coachZone, zone) => bothTimes(start, coachZone, zone);

// ---- picking times on the calendar (a poll's times, Offer times by email)

/**
 * One press on the calendar while times are being picked: a time already
 * picked comes off; a new one is added when it is free, still to come and
 * inside the most that can be picked.
 * @returns {{ starts: Date[], problem: string|null }}
 */
export function pickTime(starts, { day, startMin, minutes, coachZone, data = {}, now, max = POLL_MAX }) {
  const at = instantAt(day, hhmm(snapMinutes(startMin)), coachZone);
  const end = at.getTime() + minutes * MIN;
  const hit = starts.find((s) => ms(s) < end && ms(s) + minutes * MIN > at.getTime());
  if (hit) return { starts: starts.filter((s) => s !== hit), problem: null };
  if (now != null && at <= new Date(now)) return { starts, problem: 'That time has passed. Pick a later one.' };
  if (starts.length >= max) return { starts, problem: max === POLL_MAX ? 'Up to 5 times in one poll.' : `Up to ${max} times at once.` };
  const busy = busySpans({ items: data.items || [], sessions: data.sessions || [], from: at, to: new Date(end) }).find((o) => o.start < end && o.end > at);
  if (busy) return { starts, problem: `That overlaps ${busy.title}. Pick a free time.` };
  return { starts: [...starts, at].sort((a, b) => a - b), problem: null };
}

/** The picked times as tiles on the calendar: dashed, each saying its time (in the reader's zone when one is chosen: "7:00 am New York"). A press takes one off. */
export function pickedEntries(starts, minutes, { coachZone, zone = null }) {
  return (starts || []).map((s) => entry({
    key: `pick:${ms(s)}`, type: 'pick', kind: 'hold', colour: 'hold', title: zone && !sameZone(zone, coachZone) ? offerCellWords(s, zone) : wallClock(s, coachZone).time, sub: 'Picked',
    startsAt: new Date(s), endsAt: new Date(ms(s) + minutes * MIN), busy: false, fixed: true, oneLine: minutes < ONE_LINE_UNDER,
  }, coachZone));
}
export const OFFER_MAX = 8;
/** The bar while times to offer are picked: "Pick free times", then "2 picked". */
export const offerPickWords = (n) => (n ? `${n} picked` : 'Pick free times');
/** The zones a reader can be in for Offer times by email: the coach's list, the coach's own first. */
export const offerZoneChoices = (settings, coachZone) => [{ value: coachZone, label: zonePlace(coachZone) }, ...secondZoneChoices(settings, coachZone).filter((z) => !sameZone(z.value, coachZone))];

// ---- Open for calls, as its own page draws it

/**
 * What Open for calls draws: everything busy as a quiet dashed outline that
 * can't be moved (every calendar counts, switched on or not), and the open
 * blocks, which can. An all-day item isn't drawn: a block over one is
 * refused with its name ("That overlaps Leading Teams conference.").
 */
export function openPageEntries(data, { fromDay, toDay, coachZone }) {
  return calendarEntries(data, { fromDay, toDay, coachZone, settings: null, showTodos: false, showOpen: true }).filter((e) => !e.allDay && (e.type === 'open' || e.busy))
    .map((e) => (e.type === 'open'
      ? { ...e, type: 'item', isOpen: true, oneLine: e.minutes < ONE_LINE_UNDER }
      : { ...e, fixed: true, colour: 'life', colourClass: COLOURS.life.className, dashed: true, sub: '', clientWords: '', session: null }));
}
/** Remove an open time. */
export const removeOpenPlan = (block, { data = {} } = {}) => plan(data, { remove: [[T.open, block.id]], words: 'Removed' });
/** The weeks Open for calls can show: this one and the four after it. */
export function openWeeks(todayKey) {
  const monday = mondayOf(todayKey);
  return Array.from({ length: OPEN_WEEKS + 1 }, (_, i) => addDays(monday, i * 7));
}
/** An open time's typed hours on a day as the times placeOpen takes, or a calm line (quarter hours, the end after the start). */
export function openTyped({ day, from, to, coachZone }) {
  const a = minutesOfTime(from);
  const z = minutesOfTime(to);
  if (a == null || z == null) return { problem: 'Type the times like 14:00 and 16:00.' };
  if (a % 15 || z % 15) return { problem: 'Open times start and end on a quarter hour.' };
  if (z <= a) return { problem: 'Choose an end after the start.' };
  return { starts_at: instantAt(day, hhmm(a), coachZone).toISOString(), ends_at: instantAt(day, hhmm(z), coachZone).toISOString(), problem: null };
}

// ---- the pages outside the portal

const MORE_VISITOR_ZONES = ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Africa/Johannesburg', 'Asia/Kolkata', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'America/Vancouver'];
/** The zones a visitor can choose on a booking page: their device's own first in mind, the usual cities, A to Z by name. */
export function visitorZones(device, also = []) {
  const seen = [];
  for (const z of [device, ...also, ...SECOND_ZONES, ...MORE_VISITOR_ZONES]) if (isZone(z) && !seen.some((s) => sameZone(s, z))) seen.push(z);
  return seen.map((z) => ({ value: z, label: zonePlace(z) })).sort((a, b) => a.label.localeCompare(b.label));
}

/** "Wed 18 Nov, 11:30 am New York time": a booked call for the person who booked it. */
export const bookedWhenWords = (start, zone) => `${zoneDayWords(start, zone)}, ${timeWords(start, zone)}`;

/** What a guest is told before they move or cancel inside 24 hours: one calm line (nothing is charged to a guest). */
export const guestLateLine = (startsAt, now) => (isLateCancellation(startsAt, now) ? 'This call is in under 24 hours.' : null);

/**
 * "Add to calendar": the call as an .ics file made in the page. The times
 * are UTC instants, so every calendar app shows it at the right moment
 * wherever the person is.
 * @returns {string}
 */
export function icsFile({ uid, title, startsAt, endsAt, description = '', location = '', now = new Date() }) {
  const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const fold = (line) => { const out = []; let rest = line; while (rest.length > 73) { out.push(rest.slice(0, 73)); rest = ` ${rest.slice(73)}`; } out.push(rest); return out.join('\r\n'); };
  return `${[
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Clarity Project//The Clarity Portal//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${String(uid).replace(/[^A-Za-z0-9-]/g, '')}@theclarityportal`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(startsAt)}`, `DTEND:${stamp(endsAt)}`, `SUMMARY:${esc(title)}`,
    location ? `LOCATION:${esc(location)}` : null, description ? `DESCRIPTION:${esc(description)}` : null, 'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).map(fold).join('\r\n')}\r\n`;
}
/** The file's name: "Chemistry Call with Tim.ics". */
export const icsName = (title) => `${clean(String(title || 'Call').replace(/[\\/:*?"<>|]/g, ' ')) || 'Call'}.ics`;

/** A poll page's time for the person asked, in their own zone: "Thu 19 Nov, 12:00 pm New York time". */
export const pollOptionWords = (startsAt, zone) => `${zoneDayWords(startsAt, zone)}, ${timeWords(startsAt, zone)}`;

/** The email that offers picked times, opened in the coach's own email app: its subject and body. */
export function offerNote({ starts, minutes, zone, coachFirstName = '' }) {
  const made = offerTimesText({ starts, minutes, zone });
  return { subject: 'Times for a call', body: [made.text, coachFirstName].filter(Boolean).join('\n\n') };
}

// ---- a client's own sessions (their Coaching page)

/** The days a client is shown times for: 14 from tomorrow, a week at a time. */
export const MY_BOOKING_DAYS = 14;
/** A coming session's line for the client, in their own time: "Tue 24 Nov, 10:00 am Chicago time, 60 minutes". */
export const mySessionWords = (s, zone) => `${zoneDayWords(s.starts_at, zone)}, ${timeWords(s.starts_at, zone)}, ${minutesWords(Number(s.minutes) || 60)}`;

/**
 * "Show my calendar" on a booking page: a day's free times beside what the
 * visitor already has, on one clock (theirs). Minutes are from midnight
 * where the visitor is; the hours run from the first thing to the last.
 * @returns {{ fromMin: number, toMin: number, hours: string[], free: { start: Date, fromMin: number, toMin: number }[], busy: { title: string, fromMin: number, toMin: number }[] }}
 */
export function visitorDay({ starts = [], events = [], zone, minutes }) {
  // A free time is drawn a quarter hour high (starts can be a quarter hour apart), wherever the call would end.
  const free = starts.map((s) => ({ start: s, fromMin: wallMinutes(s, zone), toMin: wallMinutes(s, zone) + 15, endMin: wallMinutes(s, zone) + minutes }));
  const busy = events.map((e) => ({ title: e.title, fromMin: wallMinutes(e.startsAt, zone), toMin: Math.max(wallMinutes(e.startsAt, zone) + 15, wallMinutes(new Date(ms(e.endsAt) - 1), zone) + 1) }));
  const all = [...free, ...busy];
  if (!all.length) return { fromMin: 540, toMin: 600, hours: ['09:00'], free, busy };
  const fromMin = Math.floor(Math.min(...all.map((x) => x.fromMin)) / 60) * 60;
  const toMin = Math.min(DAY_MINUTES, Math.ceil(Math.max(...all.map((x) => x.endMin ?? x.toMin)) / 60) * 60);
  return { fromMin, toMin, hours: Array.from({ length: Math.max(1, (toMin - fromMin) / 60) }, (_, i) => hhmm(fromMin + i * 60)), free, busy };
}

// ---------------------------------------------------------------- keeping in step: the loop, the connections and the reminders that go (run 3, steps 3 and 6)

/** How often the calendar asks Google Calendar what changed while the tab shows: "within a few minutes". */
export const SYNC_EVERY_MS = 3 * MIN;
/** A change made here goes to Google once its 10-second Undo has passed, so an undone change never sends an invite. */
export const SYNC_AFTER_SAVE_MS = 11000;
const SYNC_FIRST_MS = 2000;
const SYNC_MAX_MS = 5 * MIN;

/**
 * How long the loop waits before its next round. After rounds that didn't
 * get an answer it backs off like the offline queue: about 2, 4, 8 seconds
 * and on, up to about 5 minutes, with ±20% randomness.
 * @param {number} failures rounds in a row with no answer
 */
export function syncWait(failures, random = Math.random) {
  if (!failures) return SYNC_EVERY_MS;
  return Math.round(Math.min(SYNC_FIRST_MS * 2 ** (failures - 1), SYNC_MAX_MS) * (0.8 + 0.4 * random()));
}

/**
 * What the next round must delete in Google and Zoom for the rows a plan
 * removes here (calendar items only; one never sent there needs nothing).
 * @param {[string, string][]} removeList a plan's `remove`   @param {object[]} items the items before
 * @returns {{ id: string, google_event_id: string|null, meeting_id: string|null }[]}
 */
export function removedForSync(removeList, items = []) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return (removeList || []).filter(([t]) => t === T.items).map(([, id]) => byId.get(id)).filter((i) => i && (i.google_event_id || i.meeting_id))
    .map((i) => ({ id: i.id, google_event_id: i.google_event_id || null, meeting_id: i.meeting_id || null }));
}

/**
 * Rows an Undo puts back. An item whose Google event (or Zoom meeting) has
 * already been deleted by a round starts again there, so the next round
 * makes it anew instead of changing something that has gone.
 * @param {[string, object][]} saveList an Undo's `save`   @param {{ id: string }[]} sentGone what rounds have already deleted
 */
export function restoredForSync(saveList, sentGone = []) {
  const gone = new Set(sentGone.map((r) => r.id));
  return (saveList || []).map(([t, row]) => (t === T.items && gone.has(row.id)
    ? [t, { ...row, google_event_id: null, google_etag: null, google_synced_at: null, meeting_link: row.meeting_id ? null : row.meeting_link, meeting_id: null }]
    : [t, row]));
}

const GOOGLE_FIELDS = ['google_event_id', 'google_calendar_id', 'google_etag', 'google_synced_at'];

/**
 * A row a round wants to save, laid over the row as it stands now. A round
 * takes a moment, and the coach may have changed the same item meanwhile:
 * their newer change is never written over. The row keeps their change and
 * takes only what the round learnt from the services (the event's id and
 * tag, the Zoom link), so the next round sees it as changed here and sends it.
 * @param {object|null} latest the row now   @param {object} fromSync the round's row   @param {object|null} before the row as the round read it
 */
export function syncRowOver(latest, fromSync, before) {
  if (!latest) return before ? null : fromSync; // deleted here meanwhile: it stays deleted
  if (!before || latest.updated_at === before.updated_at) return fromSync;
  const next = { ...latest };
  for (const f of GOOGLE_FIELDS) if (f in fromSync) next[f] = fromSync[f];
  if (!latest.meeting_link && fromSync.meeting_link) { next.meeting_link = fromSync.meeting_link; next.meeting_id = fromSync.meeting_id ?? null; }
  return next;
}

/** Which of My calendars an event read from Google belongs to: the coach's own map of Google calendars, otherwise Work. */
export function calendarOfEvent(event, map = {}) {
  const id = event?.calendarId || event?.organizer?.email || null;
  const found = Object.entries(map || {}).find(([key, value]) => CALENDARS.some((c) => c.value === key) && value && value === id);
  if (found) return found[0];
  return CALENDARS.some((c) => c.value === id) ? id : 'work';
}

/**
 * Zoom on its own, for a coach whose Zoom is connected and whose Google
 * Calendar isn't: which calls need a meeting made, and which need theirs
 * moved. `sent` is what each meeting was last told ({ meeting id: mark }).
 * @returns {{ make: object[], move: object[], mark: (item) => string }}
 */
export function zoomWork(items = [], sent = {}) {
  const mark = (i) => `${ms(i.starts_at)}|${ms(i.ends_at)}|${i.title}|${i.time_zone}`;
  const wants = (i) => CALL_KINDS.includes(i.kind) && (i.place_kind || 'zoom') === 'zoom' && !i.all_day && !i.removed;
  return {
    make: items.filter((i) => wants(i) && !i.meeting_link),
    move: items.filter((i) => wants(i) && i.meeting_id && sent[i.meeting_id] !== undefined && sent[i.meeting_id] !== mark(i)),
    mark,
  };
}

/**
 * Settings, My calendars: the two connections as rows.
 * @param {{ live: boolean, status?: { google_calendar?: boolean, zoom?: boolean, google_ready?: boolean }, standIns?: { google?: boolean, zoom?: boolean } }} a
 *   `status`: the server's own answer; `google_ready`: the keys are set, so the coach can connect their account.
 * @returns {{ key: 'google'|'zoom', label: string, value: string, action: string|null, does: 'connect'|'disconnect'|'explain'|null, line: string }[]}
 */
export function connectionRows({ live, status = {}, standIns = {} }) {
  const google = status.google_calendar === true;
  const zoom = status.zoom === true;
  return [
    {
      key: 'google', label: 'Google Calendar',
      value: google ? 'Connected' : (!live && standIns.google ? 'Stand-in' : 'Not connected'),
      action: google ? 'Disconnect Google Calendar' : (!live && standIns.google ? null : 'Connect Google Calendar'),
      does: google ? 'disconnect' : (!live && standIns.google ? null : (live && status.google_ready === true ? 'connect' : 'explain')),
      line: google ? SYNC_WORDS.connected : CONNECT_WORDS.google,
    },
    {
      key: 'zoom', label: 'Zoom',
      value: zoom ? 'Connected' : (!live && standIns.zoom ? 'Stand-in' : 'Not connected'),
      action: zoom || (!live && standIns.zoom) ? null : 'Connect Zoom', does: zoom || (!live && standIns.zoom) ? null : 'explain',
      line: zoom ? CONNECT_WORDS.zoomOn : CONNECT_WORDS.zoom,
    },
  ];
}

export const CONNECT_WORDS = Object.freeze({
  google: 'Google Calendar isn’t connected on this build, so your calendar is kept in the portal only.',
  zoom: 'Zoom isn’t connected on this build, so calls have no Zoom link.',
  zoomOn: 'Each call booked on Zoom gets its own link, made in the client’s time zone.',
  standInGoogle: 'Use a stand-in Google Calendar',
  standInZoom: 'Use a stand-in Zoom',
  standInNote: 'For testing on this build. Nothing leaves this tab.',
  didntConnect: 'Google Calendar didn’t connect. Try again in a moment.',
  connected: 'Google Calendar is connected.',
  disconnected: 'Google Calendar is disconnected.',
  gotIt: 'Got it',
});

/** The line under a calendar item that a round is holding a change back for (it is being edited). */
export const conflictWords = (conflicts, itemId) => (conflicts || []).find((c) => c.id === itemId)?.words || null;

// ---- the reminders that go (the email server asks these; nothing here sends)

/** The day-before reminder goes from 18:00 to 21:00 in the reader's own time, never later in their evening. */
export const DAY_BEFORE_UNTIL = '21:00';
/** The 1-hour reminder goes from 60 to 30 minutes before: later than that "in 1 hour" would be wrong. */
export const HOUR_BEFORE_UNTIL_MIN = 30;

/**
 * Which of the calls coming up (051's cal_reminders_coming: one row a call,
 * a kind and a person) are due this moment.
 *   day_before   from 18:00 to 21:00 on the day before, on the reader's own
 *                calendar and clock (a call booked later than that gets none:
 *                its confirmation has just said when it is);
 *   hour_before  from 60 to 30 minutes before. It never gives a clock time.
 * A row without a reader, a start or a real time zone is left out.
 * @param {object[]} rows   @param {Date|string} now
 * @returns {object[]} the due rows, each with `readerZone`
 */
export function remindersToSend(rows, now) {
  const t = ms(now);
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.item_id || !row.person_email || Number.isNaN(ms(row.occurrence_at))) continue;
    const readerZone = [row.person_zone, row.time_zone].find((z) => isZone(z));
    if (!readerZone) continue;
    const start = ms(row.occurrence_at);
    if (row.kind === 'hour_before') {
      if (t >= start - HOUR && t < start - HOUR_BEFORE_UNTIL_MIN * MIN) out.push({ ...row, readerZone });
    } else if (row.kind === 'day_before') {
      const day = addDays(wallClock(row.occurrence_at, readerZone).date, -1);
      if (t >= instantAt(day, DAY_BEFORE_HOUR, readerZone).getTime() && t < instantAt(day, DAY_BEFORE_UNTIL, readerZone).getTime()) out.push({ ...row, readerZone });
    }
  }
  return out;
}
