import { deviceKey, readJson, writeJson } from '../deviceStore';
import { dayStore } from './dayStore';
import { tableReady } from './tableReady';
import {
  WIND_DOWN_NIGHTS_KEPT,
  WIND_DOWN_SOUND_DEFAULT,
  cleanThoughts,
  nightBefore,
  thingKey,
} from './windDown';

// The one place the sleep wind down's thoughts are read and written (M19;
// Phase 4 steps 6 and 7). Kept on this device per night, under
// clarity-cache:<user>:wind-down-nights (the last two weeks), which the
// page and the next morning's Daily plan read at once, offline too. Once
// Tim has run migration 039 each night is also saved to wind_down_nights
// through the offline queue (dayStore.js), and what waits on the device
// is moved across once. Until then a save answers { status: 'device' },
// which the page shows as Saved.

const storeKey = (userId) => deviceKey('cache', userId, 'wind-down-nights');

function readAll(userId) {
  if (!userId) return {};
  const v = readJson(storeKey(userId));
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

const device = {
  get: (userId, night) => readAll(userId)[night] || null,
  set: (userId, night, value) => {
    const all = { ...readAll(userId), [night]: value };
    // Only the latest two weeks of nights stay on the device.
    const keep = Object.keys(all).sort().slice(-WIND_DOWN_NIGHTS_KEPT);
    return writeJson(storeKey(userId), Object.fromEntries(keep.map((k) => [k, all[k]])));
  },
  days: (userId) => Object.keys(readAll(userId)).sort(),
};

const nights = dayStore({
  table: 'wind_down_nights',
  dayCol: 'night',
  device,
  toRow: (v) => ({ thoughts: cleanThoughts(v?.thoughts), sound: v?.sound || WIND_DOWN_SOUND_DEFAULT, finished_at: v?.finishedAt || null }),
  fromRow: (row) => ({ thoughts: cleanThoughts(row.thoughts), sound: row.sound || WIND_DOWN_SOUND_DEFAULT, finishedAt: row.finished_at || null }),
  // Written on two devices: nothing written is lost. This device's
  // thoughts first, then the other's that aren't the same thing.
  onTop: (saved, mine) => {
    const ours = cleanThoughts(mine.thoughts);
    const seen = new Set(ours.map(thingKey));
    return {
      ...mine,
      thoughts: cleanThoughts([...ours, ...cleanThoughts(saved.thoughts).filter((t) => !seen.has(thingKey(t)))]),
      finishedAt: mine.finishedAt || saved.finishedAt || null,
      sound: mine.sound && mine.sound !== WIND_DOWN_SOUND_DEFAULT ? mine.sound : saved.sound,
    };
  },
});

function writeNight(userId, night, patch) {
  const had = device.get(userId, night) || {};
  return nights.write(userId, night, { ...had, ...patch, updatedAt: new Date().toISOString() });
}

/** One night's wind-down: its thoughts, when it was finished, and the sound chosen ('off'). */
export function readWindDown(userId, night) {
  const n = device.get(userId, night);
  return { thoughts: cleanThoughts(n?.thoughts), finishedAt: n?.finishedAt || null, sound: n?.sound || WIND_DOWN_SOUND_DEFAULT };
}

/** Last night's thoughts, for the morning's Daily plan. */
export function lastNightThoughts(userId, date) {
  return readWindDown(userId, nightBefore(date)).thoughts;
}

/**
 * Save a night's thoughts (cleaned). Answers as the offline queue does, so
 * the page shows Saving, then Saved ({ status: 'device' } until 039 has run).
 */
export async function saveWindDownThoughts(userId, night, rows) {
  return writeNight(userId, night, { thoughts: cleanThoughts(rows) });
}

/** The wind-down was used tonight: Home stops offering it until the next evening. */
export function finishWindDown(userId, night) {
  writeNight(userId, night, { finishedAt: new Date().toISOString() }).catch(() => null);
}

/** The nights finished (for Home's card). */
export function finishedNights(userId) {
  return Object.entries(readAll(userId)).filter(([, n]) => n?.finishedAt).map(([k]) => k);
}

/**
 * Brings the device's nights up to date with wind_down_nights (another
 * device's thoughts show here), after moving across what waits here.
 * Quiet; resolves true when something changed. Nothing until 039 has run.
 * @param {{ night?: string, since?: string }} which
 */
export function refreshWindDown(userId, which) {
  return nights.refresh(userId, which);
}

/** Calls back whenever a night kept on this device changes. */
export const subscribeWindDown = nights.subscribe;

/**
 * The source of a to-do made from a wind-down thought: 'sleep_wind_down'
 * once 039 is there (it adds that source), else 'other_tool', as before.
 */
export async function windDownTodoSource() {
  try {
    return (await tableReady('wind_down_nights')) ? 'sleep_wind_down' : 'other_tool';
  } catch {
    return 'other_tool';
  }
}
