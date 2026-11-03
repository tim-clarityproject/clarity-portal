// Sleep wind down (mock-up M19, approved by Tim on 29 Oct; Phase 4 step 6):
// the thoughts written down at night, and the next morning's one
// "Carried over" list in Plan my day.
//
// The one place the thoughts are read and written. No table holds them
// yet: they are kept on this device, per night (the person's own local
// date, with a wind-down before 04:00 counting for the night before, as
// Review my day does). Step 7 of Phase 4 adds the table in migration 039;
// it swaps only the store below (readNight, writeNight), so the page and
// Plan my day stay as they are. Until then a save answers { status:
// 'device' }, which the page shows as Saved, as the queue's own answers
// are shown.
//
// The rest is pure (no database, no React, no device clock: the day and
// hour are passed in), tested in tests/performance/windDown.test.mjs.

import { weekday } from '../scores/dates.js';
import { deviceKey, readJson, writeJson } from '../deviceStore';

export const WIND_DOWN_THOUGHT_MAX = 300;     // each thought, as the "for tomorrow" items (Step 7 sets the same in 039)
export const WIND_DOWN_EARLY_HOURS = 4;       // before 04:00 it is still the night before (Review my day's rule)
export const WIND_DOWN_BREATHE_SECONDS = 300; // 5 minutes at 4 in and 6 out (Tim, 29 Oct, 08:32): 30 breaths
const NIGHTS_KEPT = 14;                       // the device keeps two weeks of nights, no more

// The sound under the breathing (M19's "Change the sound"). The sounds need
// real audio files, which don't exist yet (brief, step 6), so there are
// none to choose: the button only shows once this list has some. The
// choice is off until chosen and never plays by itself.
export const WIND_DOWN_SOUNDS = Object.freeze([]);
export const WIND_DOWN_SOUND_DEFAULT = 'off';

const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function addDay(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); // a pure date sum, never "today"
}

/** The night a wind-down belongs to: today, or the day before when it is before 04:00. */
export function windDownNight({ today, hour }) {
  return hour < WIND_DOWN_EARLY_HOURS ? addDay(today, -1) : today;
}

/** The night before a morning's Plan my day ("last night"). */
export function nightBefore(date) {
  return addDay(date, -1);
}

/** The thoughts as kept: trimmed, the empty ones left out, each 300 characters at most. */
export function cleanThoughts(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean)
    .map((t) => t.slice(0, WIND_DOWN_THOUGHT_MAX));
}

/**
 * Two lines are the same thing when they match once case and punctuation
 * are ignored (M19: "so nothing the person wrote is hidden"). Letters and
 * numbers in any language count; a line with neither is compared as typed.
 */
export function sameThing(a, b) {
  return thingKey(a) === thingKey(b);
}

export function thingKey(text) {
  const t = (text || '').trim().toLowerCase();
  const words = t.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  return words || t;
}

/**
 * The one Carried over list (M19): Review my day's things for tomorrow
 * first, then last night's wind-down thoughts, a line in both kept once
 * (where it first appears, as the review wrote it) and marked as from both.
 * @returns {{ text: string, review: boolean, windDown: boolean, reviewIndex: number|null, windIndex: number|null }[]}
 */
export function carriedOver({ review = [], windDown = [] }) {
  const out = [];
  const at = new Map();
  review.forEach((raw, i) => {
    const text = (raw || '').trim();
    if (!text) return;
    const k = thingKey(text);
    if (at.has(k)) return;
    at.set(k, out.length);
    out.push({ text, review: true, windDown: false, reviewIndex: i, windIndex: null });
  });
  windDown.forEach((raw, i) => {
    const text = (raw || '').trim();
    if (!text) return;
    const k = thingKey(text);
    if (at.has(k)) {
      const item = out[at.get(k)];
      item.windDown = true;
      if (item.windIndex == null) item.windIndex = i;
      return;
    }
    at.set(k, out.length);
    out.push({ text, review: false, windDown: true, reviewIndex: null, windIndex: i });
  });
  return out;
}

/**
 * Where a carried-over thing came from, the small line under it (M19).
 * The review is "last night's" when it was the day before; an older one
 * (Plan my day looks back three days) is named by its day.
 */
export function carriedSource({ review, windDown }, reviewDate, date) {
  const fromReview = review
    ? (reviewDate && reviewDate !== addDay(date, -1) ? `Review my day on ${DAY_FULL[weekday(reviewDate)]}` : 'Review my day')
    : null;
  if (fromReview && windDown) return `From ${fromReview} and last night’s sleep wind down`;
  if (fromReview) return `From ${fromReview}`;
  return 'From last night’s sleep wind down';
}

// ---------------------------------------------------------------- the store
// Step 7 swaps these two for the table (and the offline queue), keeping
// the device copy as the offline cache.

const storeKey = (userId) => deviceKey('cache', userId, 'wind-down-nights');

function readAll(userId) {
  if (!userId) return {};
  const v = readJson(storeKey(userId));
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function readNight(userId, night) {
  const n = readAll(userId)[night];
  return { thoughts: cleanThoughts(n?.thoughts), finishedAt: n?.finishedAt || null, sound: n?.sound || WIND_DOWN_SOUND_DEFAULT };
}

function writeNight(userId, night, patch) {
  const all = readAll(userId);
  all[night] = { ...(all[night] || {}), ...patch, updatedAt: new Date().toISOString() };
  // Only the latest two weeks of nights stay on the device.
  const keep = Object.keys(all).sort().slice(-NIGHTS_KEPT);
  const next = Object.fromEntries(keep.map((k) => [k, all[k]]));
  return writeJson(storeKey(userId), next);
}

/** One night's wind-down: its thoughts, when it was finished, and the sound chosen ('off'). */
export function readWindDown(userId, night) {
  return readNight(userId, night);
}

/** Last night's thoughts, for the morning's Plan my day. */
export function lastNightThoughts(userId, date) {
  return readNight(userId, nightBefore(date)).thoughts;
}

/**
 * Save a night's thoughts (cleaned). Answers as the offline queue does, so
 * the page shows Saving, then Saved: { status: 'device' } for now.
 */
export async function saveWindDownThoughts(userId, night, rows) {
  const ok = writeNight(userId, night, { thoughts: cleanThoughts(rows) });
  if (!ok) throw new Error('The device has no room to keep this.');
  return { status: 'device' };
}

/** The wind-down was used tonight: Home stops offering it until the next evening. */
export function finishWindDown(userId, night) {
  writeNight(userId, night, { finishedAt: new Date().toISOString() });
}

/** The nights finished on this device (for Home's card). */
export function finishedNights(userId) {
  return Object.entries(readAll(userId)).filter(([, n]) => n?.finishedAt).map(([k]) => k);
}
