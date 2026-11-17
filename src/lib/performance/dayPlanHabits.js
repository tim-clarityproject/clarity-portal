import { deviceKey, readJson, writeJson } from '../deviceStore';
import { dayStore } from './dayStore';

// The habits chosen in Daily plan, with the order of the day's choices
// and the one at the top (the to-dos themselves are day_plan_todos). Read
// and written only here. Kept on this device per day, under
// clarity-day-plan-local:<user>:<date> as before, which Daily plan,
// Daily review and Home read at once, offline too. Once Tim has run
// migration 039 each day is also saved to day_plan_habits through the
// offline queue (dayStore.js), so another device sees the same choices,
// and the days waiting on this device are moved across once. Until then a
// save answers { status: 'device' }, as before.

const DAYS_MOVED = 14; // the last two weeks of days kept here are moved across, no older
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PICK = /^(todo|habit):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const keyFor = (userId, date) => deviceKey('day-plan-local', userId, date);

function storageKeys() {
  try {
    return Object.keys(window.localStorage);
  } catch {
    return [];
  }
}

const device = {
  get: (userId, date) => {
    const v = userId ? readJson(keyFor(userId, date)) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  },
  set: (userId, date, value) => writeJson(keyFor(userId, date), value),
  // The recent days that hold a choice (an empty day is nothing to move).
  days: (userId) => {
    const prefix = keyFor(userId, '');
    return storageKeys()
      .filter((k) => k.startsWith(prefix) && isDay(k.slice(prefix.length)))
      .map((k) => k.slice(prefix.length))
      .sort()
      .slice(-DAYS_MOVED)
      .filter((d) => {
        const v = device.get(userId, d);
        return (v?.habits || []).length || (v?.order || []).length;
      });
  },
};

/**
 * The day's choices as the table holds them: as many as the person chose
 * (Tim, 16 Nov; migration 047's guards are 100 habits and 200 choices, so a
 * save is never refused once 047 has run).
 */
export function dayChoicesToRow(v = {}) {
  const habits = [...new Set((v.habits || []).filter((id) => UUID.test(id)))].slice(0, 100);
  const order = [...new Set((v.order || []).filter((k) => PICK.test(k)))].slice(0, 200);
  return { habit_ids: habits, pick_order: order, top_pick: PICK.test(v.top || '') ? v.top : null };
}

const days = dayStore({
  table: 'day_plan_habits',
  dayCol: 'local_date',
  device,
  toRow: dayChoicesToRow,
  fromRow: (row) => ({ habits: row.habit_ids || [], order: row.pick_order || [], top: row.top_pick || null }),
});

/** What is kept for the day: { habits, order, top } (an empty object when nothing is). */
export function readDayChoices(userId, date) {
  const v = device.get(userId, date);
  if (!v) return {};
  const { habits, order, top, extra } = v;
  // extra: the day's to-dos the database couldn't hold yet (before 047 a day
  // plan's rows stop at three), kept here so the day still shows them all.
  const out = { habits: habits || [], order: order || [], top: top || null };
  return Array.isArray(extra) && extra.length ? { ...out, extra } : out;
}

/** Keep the day's choices, and send them once 039 is there. */
export function saveDayChoices(userId, date, value) {
  return days.write(userId, date, value);
}

/**
 * Brings the day's choices up to date with day_plan_habits (another
 * device's choices show here), after moving across what waits here.
 * Quiet; resolves true when they changed. Nothing until 039 has run.
 */
export function refreshDayChoices(userId, date) {
  return days.refresh(userId, { day: date });
}

/** Calls back whenever a day's choices kept on this device change. */
export const subscribeDayChoices = days.subscribe;

// Before Tim runs 047 a day plan's database rows stop at three to-dos
// (028's day_plan_limits). Learned from the database's own refusal, kept
// on the device for an hour, then tried again (047 may have run since).
const CAP_KEY = 'clarity-day-plan-cap';
const CAP_HOURS = 1;

/** How many to-dos the database holds for a day: 3 while 028's limit is there, otherwise no limit. */
export function dayTodoCap() {
  const v = readJson(CAP_KEY);
  return v && v.cap === 3 && Date.now() - Number(v.at || 0) < CAP_HOURS * 3600000 ? 3 : Infinity;
}

/** The database refused a fourth to-do in a day (028's check): before 047. */
export function dayLimitRefused(error) {
  return `${error?.code || ''}` === '23514' && /up to 3 to-dos/i.test(`${error?.message || ''}`);
}

export function learnDayTodoCap() {
  writeJson(CAP_KEY, { cap: 3, at: Date.now() });
}

/**
 * The to-dos the database is sent for the day (the highest priority first,
 * then the rest in order, up to the cap), and the ones kept on the device.
 */
export function fitDayTodos(todos, top, cap = dayTodoCap()) {
  if (!(cap < todos.length)) return { sent: todos, extra: [] };
  const first = top && todos.includes(top) ? [top, ...todos.filter((t) => t !== top)] : todos;
  const keep = new Set(first.slice(0, cap));
  return { sent: todos.filter((t) => keep.has(t)), extra: todos.filter((t) => !keep.has(t)) };
}
