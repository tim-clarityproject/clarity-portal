import { deviceKey, readJson, writeJson } from './deviceStore';
import { DEFAULT_MINUTES, cleanMinutes } from './timer';

// How long the timer runs, remembered for next time (Tim, 13 Nov, 09:29):
// one choice for every timer in the portal.
//
// A signed-in person's choice is kept in the account, in
// person_settings.page_preferences.timer_minutes (the own-rows-only object
// that holds the menu's pins and the orb's style; no new column), so every
// device shows the same length. It is saved through the offline queue
// (menuPins.js setPreference), and this device's copy shows at once,
// offline too. That copy is one of the device's page copies
// (clarity-cache:<person>:timer-minutes), so a deliberate Sign out clears
// it with the rest (clearAppStorage.js) and the next person here starts
// from 6 minutes.
//
// With nobody signed in (a guest's page, or a page outside AuthContext) it
// is remembered on the device only, under clarity-timer-minutes: a
// device's own setting, which holds no person's data.
//
// The hook that joins the two is src/components/design/useTimerLength.js.

export const TIMER_PREFERENCE = 'timer_minutes';
export const GUEST_KEY = 'clarity-timer-minutes';
const CACHE = 'timer-minutes';
const EVENT = 'clarity-timer-minutes';
const thisVisit = new Map(); // only what the device's storage refused to keep

/** The key of a signed-in person's copy on this device. */
export function timerDeviceKey(userId) {
  return userId ? deviceKey('cache', userId, CACHE) : GUEST_KEY;
}

/** The length this device remembers (6 minutes until one is chosen). */
export function readTimerMinutes(userId) {
  const key = timerDeviceKey(userId);
  if (thisVisit.has(key)) return thisVisit.get(key);
  if (userId) return cleanMinutes(readJson(key)?.v) ?? DEFAULT_MINUTES;
  try {
    return cleanMinutes(window.localStorage.getItem(GUEST_KEY)) ?? DEFAULT_MINUTES;
  } catch {
    return DEFAULT_MINUTES;
  }
}

/** Keeps a length on this device. Anything that isn't 1 to 60 is ignored. */
export function saveTimerMinutes(userId, value) {
  const minutes = cleanMinutes(value);
  if (minutes == null) return null;
  const key = timerDeviceKey(userId);
  let stored;
  // A person's copy has the same shape as every page copy (pageCache.js writeCache).
  if (userId) stored = writeJson(key, { v: minutes, at: Date.now() });
  else {
    try { window.localStorage.setItem(key, String(minutes)); stored = true; } catch { stored = false; }
  }
  // Storage full or blocked (a private window): kept for this visit only.
  if (stored) thisVisit.delete(key);
  else thisVisit.set(key, minutes);
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* old browser */ }
  return minutes;
}

/** Calls back when the length changes here or in another tab. */
export function watchTimerMinutes(onChange) {
  const own = () => onChange();
  const other = (e) => {
    if (e.key === null || e.key === GUEST_KEY || (typeof e.key === 'string' && e.key.endsWith(`:${CACHE}`))) onChange();
  };
  window.addEventListener(EVENT, own);
  window.addEventListener('storage', other);
  return () => {
    window.removeEventListener(EVENT, own);
    window.removeEventListener('storage', other);
  };
}

/** The account's own choice out of its page settings, or null when it has none. */
export function accountMinutes(prefs) {
  const value = prefs && typeof prefs === 'object' ? prefs[TIMER_PREFERENCE] : null;
  return typeof value === 'number' ? cleanMinutes(value) : null;
}
