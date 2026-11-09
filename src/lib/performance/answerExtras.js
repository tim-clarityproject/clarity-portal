import { supabase } from '../supabase';
import { isNetworkError } from '../connection';
import { deviceKey, readJson, removeKey, writeJson } from '../deviceStore';
import { drinksToRow } from './checkin';

// Answers kept with their rows once Tim has run migration 040 (Phase 5
// follow-up, step 1): the drinks counted and the kind of trip on the
// month's check-in (checkins.drinks, checkins.trip), and the way of being
// chosen in Review my day when the day had no plan (day_reviews.way_of_being).
//
// Until 040 has run, the database doesn't have these columns, so they stay
// on the device, with no error shown, as before. Once it has:
//   - the pages read and save them with the rest of the row, so another
//     device (or the same one after signing in again) sees them;
//   - what this device still holds from before is moved across once, the
//     first time the person opens the portal (startWarming), never over a
//     value another device has already saved, and then cleared from the
//     device;
//   - a save made offline waits in the offline queue with its row, as
//     every other answer does.

export const CHECKIN_EXTRA_COLS = ', drinks, trip';
export const REVIEW_EXTRA_COLS = ', way_of_being';

// Once seen, the columns are remembered on the device too (a migration is
// never undone), so a visit opened offline from the device's copies still
// sends the drinks, the trip and the way of being with their rows, through
// the offline queue, instead of keeping them back on the device. Nothing
// personal: it says only that the database has the columns.
const SEEN_KEY = 'clarity-extras-040';
const seenOnDevice = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};
const rememberSeen = () => {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Storage blocked: asked again next visit.
  }
};

let known = seenOnDevice(); // true once both columns have answered
let asking = null;

/** The database's answer for a column it doesn't have (PostgREST, or Postgres itself). */
export function isMissingColumn(error) {
  const code = `${error?.code || ''}`;
  const message = `${error?.message || ''}`;
  return code === '42703' || code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(message);
}

/**
 * Whether 040's columns are there: true, false (not yet), or null when it
 * can't be told (offline). Only "there" is remembered, so a migration Tim
 * runs while the portal is open is found on the next look.
 */
export async function extrasReady() {
  if (known) return true;
  if (!asking) {
    asking = (async () => {
      try {
        const [c, r] = await Promise.all([
          supabase.from('checkins').select('id, drinks, trip').limit(1),
          supabase.from('day_reviews').select('id, way_of_being').limit(1),
        ]);
        const error = c.error || r.error;
        if (!error) {
          known = true;
          rememberSeen();
          return true;
        }
        if (isMissingColumn(error)) return false;
        if (isNetworkError(error)) return null;
        return null; // anything else: don't guess, keep the device copy
      } catch {
        return null;
      }
    })().finally(() => { asking = null; });
  }
  return asking;
}

/** Without asking: true only once the columns have been seen this visit. */
export function extrasKnown() {
  return known;
}

/** For tests: forget what was seen. */
export function forgetExtras() {
  known = false;
  try {
    window.localStorage.removeItem(SEEN_KEY);
  } catch {
    // Nothing kept.
  }
}

// ---------------------------------------------------------------- the device's copies

const checkinKey = (userId, month) => deviceKey('checkin-extras', userId, month);
const reviewKey = (userId, date) => deviceKey('day-review-local', userId, date);

/** The device's check-in extras for a month ({ _drinks, _trip }), or null. */
export function readCheckinExtras(userId, month) {
  return readJson(checkinKey(userId, month));
}

/** Kept on the device only while 040 isn't there; once it is, the row holds them. */
export function keepCheckinExtras(userId, month, answers) {
  if (known) return;
  if (answers._drinks || answers._trip) writeJson(checkinKey(userId, month), { _drinks: answers._drinks, _trip: answers._trip });
}

/** The row has them now: the device's copy goes. */
export function dropCheckinExtras(userId, month) {
  removeKey(checkinKey(userId, month));
}

// The device's keys of one kind for this person: "clarity-<kind>:<user>:<name>".
function namesOf(kind, userId) {
  const prefix = `${deviceKey(kind, userId)}:`;
  const out = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
  } catch {
    // Storage blocked: nothing to move.
  }
  return out;
}

let moving = null;

/**
 * Once 040 is there: every check-in extra and way of being this device
 * still holds is saved with its row, never over a value already saved
 * (another device's), then cleared from the device. A day or month with
 * no row yet keeps its copy: its page saves it with the row when the row
 * is made. Quiet, nothing shown. Resolves how many were moved.
 */
export function moveAnswerExtras(userId) {
  if (!userId || typeof window === 'undefined') return Promise.resolve(0);
  if (moving) return moving;
  moving = (async () => {
    const months = namesOf('checkin-extras', userId);
    const days = namesOf('day-review-local', userId).filter((d) => readJson(reviewKey(userId, d))?.way);
    if (!months.length && !days.length) return 0;
    if (!(await extrasReady())) return 0;
    let moved = 0;
    for (const month of months) {
      const kept = readJson(checkinKey(userId, month)) || {};
      const { data, error } = await supabase.from('checkins').select('id, drinks, trip').eq('user_id', userId).eq('month', month).limit(1);
      if (error) break; // offline or refused: tried again next visit
      const row = data?.[0];
      if (!row) continue;
      const patch = {};
      const drinks = drinksToRow(kept._drinks);
      if (row.drinks == null && drinks) patch.drinks = drinks;
      if (row.trip == null && kept._trip) patch.trip = kept._trip;
      if (Object.keys(patch).length) {
        const { error: saveError } = await supabase.from('checkins').update(patch).eq('id', row.id);
        if (saveError) break;
      }
      dropCheckinExtras(userId, month);
      moved += 1;
    }
    for (const day of days) {
      const local = readJson(reviewKey(userId, day)) || {};
      const { data, error } = await supabase.from('day_reviews').select('id, way_of_being').eq('user_id', userId).eq('local_date', day).limit(1);
      if (error) break;
      const row = data?.[0];
      if (!row) continue;
      if (row.way_of_being == null) {
        const { error: saveError } = await supabase.from('day_reviews').update({ way_of_being: String(local.way).slice(0, 120) }).eq('id', row.id);
        if (saveError) break;
      }
      const { way: _way, ...rest } = local;
      writeJson(reviewKey(userId, day), rest);
      moved += 1;
    }
    return moved;
  })().catch(() => 0).finally(() => { moving = null; });
  return moving;
}
