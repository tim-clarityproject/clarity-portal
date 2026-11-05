import { useCallback, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { readCache, writeCache } from './pageCache';
import { noteVersions, saveOrQueue, waitingToSend, whenSent } from './syncQueue';
import { cleanPins, MAX_PINS } from './navigation';

// Pinned tools (experience rule 9; M3): up to 3 tools at the top of the
// menu. Saved to the account in person_settings.page_preferences (a jsonb
// object only the person can read and change; migration 026), under
// menu_pins, so every device shows the same pins. Saved at once, through
// the offline queue with the version check (rule 52), and kept on the
// device as the copy the menu shows straight away, offline too.
//
// The menu reads the device's copy first and refreshes it quietly when it
// opens, at most every half a minute, so moving between pages never asks
// the database for anything.
//
// The same object holds the person's other page settings, saved the same
// way (setPreference): the Breathe orb's style (orb_style, Phase 4 step 7;
// useOrbStyle). Every change sends the whole object, so each is made on
// top of the account's latest copy, never over it.

const CACHE = 'menu-pins';
const REFRESH_MS = 30000;
const listeners = new Set();
const lastRead = new Map();
const snapshots = new Map();
const reading = new Map(); // a read of the account's copy still on its way

function read(userId) {
  const c = readCache(userId, CACHE)?.v;
  return { pins: cleanPins(c?.pins), prefs: c?.prefs && typeof c.prefs === 'object' ? c.prefs : {} };
}

// One unchanging copy per person until it changes, for useSyncExternalStore.
function current(userId) {
  if (!snapshots.has(userId)) snapshots.set(userId, read(userId));
  return snapshots.get(userId);
}

function keep(userId, value) {
  writeCache(userId, CACHE, value);
  snapshots.set(userId, read(userId));
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function readServer(userId) {
  const { data, error } = await supabase.from('person_settings')
    .select('user_id, page_preferences, updated_at').eq('user_id', userId).limit(1);
  if (error) throw error;
  noteVersions('person_settings', data);
  const prefs = data?.[0]?.page_preferences;
  return prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? prefs : {};
}

/**
 * Brings the device's copy up to date with the account. Never replaces
 * pins still waiting on the device to be sent.
 */
export async function refreshPins(userId, { force = false } = {}) {
  if (!userId) return;
  if (!force && Date.now() - (lastRead.get(userId) || 0) < REFRESH_MS) return;
  lastRead.set(userId, Date.now());
  const run = (async () => {
    try {
      await whenSent();
      const prefs = await readServer(userId);
      if (waitingToSend(userId)) return;
      keep(userId, { pins: cleanPins(prefs.menu_pins), prefs });
    } catch {
      // Offline or refused: the device's copy stays.
      lastRead.delete(userId);
    }
  })();
  reading.set(userId, run);
  try {
    await run;
  } finally {
    if (reading.get(userId) === run) reading.delete(userId);
  }
}

function send(userId, prefs) {
  return saveOrQueue(userId, {
    table: 'person_settings',
    kind: 'upsert',
    onConflict: 'user_id',
    values: { user_id: userId, page_preferences: prefs },
  });
}

// One change to the settings, made on the device at once and sent. A
// device that hasn't read the account's copy this visit reads it first
// (when it can), so a change never sends an empty object over the rest.
async function change(userId, apply) {
  // A read already on its way is waited for, so a change is never made on
  // top of a device copy that hasn't caught up with the account yet.
  if (reading.has(userId)) await reading.get(userId);
  if (!lastRead.has(userId)) await refreshPins(userId, { force: true });
  const next = apply(current(userId).prefs);
  keep(userId, { pins: cleanPins(next.menu_pins), prefs: next });
  let result = await send(userId, next);
  if (result.status === 'superseded') {
    // Changed in another window or on another device since this one read
    // it: take theirs, then make this one change on top of it.
    const merged = apply(await readServer(userId));
    keep(userId, { pins: cleanPins(merged.menu_pins), prefs: merged });
    result = await send(userId, merged);
  }
  return result.status === 'queued' ? 'queued' : 'saved';
}

/**
 * Pins or unpins one tool. Resolves 'saved', 'queued' (kept on the device
 * until the connection is back) or 'full' (3 pinned already).
 */
export async function setPinned(userId, key, on) {
  const { pins } = current(userId);
  if (on && !pins.includes(key) && pins.length >= MAX_PINS) return 'full';
  const apply = (list) => cleanPins(on ? [...list.filter((k) => k !== key), key] : list.filter((k) => k !== key));
  return change(userId, (prefs) => ({ ...prefs, menu_pins: apply(cleanPins(prefs.menu_pins)) }));
}

/**
 * Saves one page setting to the account (beside the pins). Resolves
 * 'saved' or 'queued'; rejects when the server refuses it (the device
 * keeps it either way).
 */
export function setPreference(userId, name, value) {
  return change(userId, (prefs) => ({ ...prefs, [name]: value }));
}

/**
 * Changes one page setting from its latest value: `update(old)` gives the
 * new one. When the setting moved on in another window or device since
 * this one read it, the change is made again on top of theirs, so a press
 * in one tab never undoes another tab's.
 */
export function updatePreference(userId, name, update) {
  return change(userId, (prefs) => ({ ...prefs, [name]: update(prefs?.[name]) }));
}

/** The account's page settings as this device last read them ({} until read). */
export function usePreferences(userId) {
  return useSyncExternalStore(subscribe, () => current(userId), () => current(userId)).prefs;
}

/** The person's pins, kept in step across every menu and panel on screen. */
export function usePins(userId) {
  const value = useSyncExternalStore(subscribe, () => current(userId), () => current(userId));
  const toggle = useCallback((key, on) => setPinned(userId, key, on), [userId]);
  const refresh = useCallback((opts) => refreshPins(userId, opts), [userId]);
  return { pins: value.pins, full: value.pins.length >= MAX_PINS, toggle, refresh };
}
