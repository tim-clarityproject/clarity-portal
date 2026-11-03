import { deviceKey, readJson, writeJson } from '../deviceStore';
import { dayStore } from './dayStore';

// The habits chosen in Plan my day, with the order of the day's choices
// and the one at the top (the to-dos themselves are day_plan_todos). Read
// and written only here. Kept on this device per day, under
// clarity-day-plan-local:<user>:<date> as before, which Plan my day,
// Review my day and Home read at once, offline too. Once Tim has run
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

/** The day's choices as the table holds them (039's checks, so a save is never refused). */
export function dayChoicesToRow(v = {}) {
  const habits = [...new Set((v.habits || []).filter((id) => UUID.test(id)))].slice(0, 3);
  const order = [...new Set((v.order || []).filter((k) => PICK.test(k)))].slice(0, 6);
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
  const { habits, order, top } = v;
  return { habits: habits || [], order: order || [], top: top || null };
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
