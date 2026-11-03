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

const CACHE = 'menu-pins';
const REFRESH_MS = 30000;
const listeners = new Set();
const lastRead = new Map();
const snapshots = new Map();

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
  try {
    await whenSent();
    const prefs = await readServer(userId);
    if (waitingToSend(userId)) return;
    keep(userId, { pins: cleanPins(prefs.menu_pins), prefs });
  } catch {
    // Offline or refused: the device's copy stays.
    lastRead.delete(userId);
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

/**
 * Pins or unpins one tool. Resolves 'saved', 'queued' (kept on the device
 * until the connection is back) or 'full' (3 pinned already).
 */
export async function setPinned(userId, key, on) {
  const { pins, prefs } = current(userId);
  if (on && !pins.includes(key) && pins.length >= MAX_PINS) return 'full';
  const apply = (list) => cleanPins(on ? [...list.filter((k) => k !== key), key] : list.filter((k) => k !== key));
  const next = { ...prefs, menu_pins: apply(pins) };
  keep(userId, { pins: next.menu_pins, prefs: next });
  let result = await send(userId, next);
  if (result.status === 'superseded') {
    // Changed in another window or on another device since this one read
    // it: take theirs, then make this one change on top of it.
    const fresh = await readServer(userId);
    const merged = { ...fresh, menu_pins: apply(cleanPins(fresh.menu_pins)) };
    keep(userId, { pins: merged.menu_pins, prefs: merged });
    result = await send(userId, merged);
  }
  return result.status === 'queued' ? 'queued' : 'saved';
}

/** The person's pins, kept in step across every menu and panel on screen. */
export function usePins(userId) {
  const value = useSyncExternalStore(subscribe, () => current(userId), () => current(userId));
  const toggle = useCallback((key, on) => setPinned(userId, key, on), [userId]);
  const refresh = useCallback((opts) => refreshPins(userId, opts), [userId]);
  return { pins: value.pins, full: value.pins.length >= MAX_PINS, toggle, refresh };
}
