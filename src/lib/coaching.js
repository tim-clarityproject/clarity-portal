import { supabase } from './supabase.js';
import { deviceKey, readJson, writeJson } from './deviceStore.js';
import { EMPTY_COACHING, PREP_MAX, isNotThere, seenText, tidyCoaching } from './coachingRules.js';

export * from './coachingRules.js';

// The client's side of working with a coach (Phase 6a run 2): what a coach
// has asked (an invite to accept, View as client, cover while they're
// away), the client's note for their next session ("For next time"), and
// the session recaps their coach has sent. One page, /coaching, and one
// quiet line on Home when something there is new.
//
// Everything goes through the database's own checked functions, as the
// signed-in person, so its rules decide what is read and done:
//   049  my_coach_invites(), client_accept_invite(p_profile),
//        client_view_answer(p_request, p_allowed), cover_agree(p_cover)
//   050  my_view_asks(), my_cover_asks(), my_session_recaps(),
//        my_session_action(p_action, p_done, p_placed), and the client's
//        own row in session_prep
//
// Quiet until the migrations have run: a function the database doesn't have
// is asked for at most once an hour (as tableReady's users do), nothing is
// shown and nothing is said. One question decides each migration (049:
// my_coach_invites; 050: my_session_recaps), so a device without them asks
// one thing an hour, not five.

// ---------------------------------------------------------------- asked at most once an hour

const HOUR_MS = 60 * 60 * 1000;
const NOT_YET_KEY = 'clarity-coaching-not-yet'; // { asks: ms, day: ms }: no personal data, only two times
const read = () => { try { const v = JSON.parse(window.localStorage.getItem(NOT_YET_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const notYet = (part, now = Date.now()) => { const at = Number(read()[part]); return Number.isFinite(at) && now - at < HOUR_MS && now >= at; };
const markNotYet = (part) => { try { window.localStorage.setItem(NOT_YET_KEY, JSON.stringify({ ...read(), [part]: Date.now() })); } catch { /* it is asked again next time */ } };
const markThere = (part) => { const v = read(); if (v[part] == null) return; delete v[part]; try { window.localStorage.setItem(NOT_YET_KEY, JSON.stringify(v)); } catch { /* nothing to do */ } };

// ---------------------------------------------------------------- reading

/**
 * Everything the Coaching page shows. Throws only when the database didn't
 * answer (the page then keeps the device's copy); a migration that hasn't
 * run reads as nothing there.
 */
export async function loadCoaching(userId) {
  const out = { ...EMPTY_COACHING, invites: [], views: [], covers: [], recaps: [] };
  if (!userId || notYet('asks')) return out;
  const invites = await supabase.rpc('my_coach_invites');
  if (invites.error) {
    if (isNotThere(invites.error)) { markNotYet('asks'); return out; }
    throw invites.error;
  }
  markThere('asks');
  out.asks = true;
  out.invites = invites.data || [];
  if (notYet('day')) return tidyCoaching(out);
  const recaps = await supabase.rpc('my_session_recaps');
  if (recaps.error) {
    if (isNotThere(recaps.error)) { markNotYet('day'); return tidyCoaching(out); }
    throw recaps.error;
  }
  markThere('day');
  out.day = true;
  out.recaps = recaps.data || [];
  const [views, covers, prep] = await Promise.all([
    supabase.rpc('my_view_asks'),
    supabase.rpc('my_cover_asks'),
    supabase.from('session_prep').select('body,noted_at').eq('user_id', userId).maybeSingle(),
  ]);
  for (const answer of [views, covers, prep]) if (answer.error && !isNotThere(answer.error)) throw answer.error;
  out.views = views.data || [];
  out.covers = covers.data || [];
  out.prep = prep.data || null;
  return tidyCoaching(out);
}

// ---------------------------------------------------------------- answering and saving

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
function problem(error, words = SAVE_PROBLEM) {
  const e = new Error(words);
  e.code = error?.code;
  return e;
}

/** Accept a coach's invite: 'linked', 'already_linked' or 'has_another_coach' (049). */
export async function acceptInvite(profileId) {
  const { data, error } = await supabase.rpc('client_accept_invite', { p_profile: profileId });
  if (error) throw problem(error, error.code === '42501' ? 'That invite isn’t open any more. Ask your coach to send it again.' : SAVE_PROBLEM);
  return data;
}

/** Answer "May your coach view your portal?"; a yes lasts 30 minutes (049). */
export async function answerView(requestId, allowed) {
  const { error } = await supabase.rpc('client_view_answer', { p_request: requestId, p_allowed: allowed });
  if (error) throw problem(error, error.code === '42501' ? 'That request isn’t open any more, so nothing changed.' : SAVE_PROBLEM);
}

/** Agree to cover while a coach is away (049). */
export async function agreeCover(coverId) {
  const { error } = await supabase.rpc('cover_agree', { p_cover: coverId });
  if (error) throw problem(error, error.code === '42501' ? 'That’s already agreed, or it isn’t open any more.' : SAVE_PROBLEM);
}

/** For next time: the client's one note for their next session. Clearing it deletes the note (050's session_prep). */
export async function savePrep(userId, body) {
  const words = seenText(body, PREP_MAX).trim();
  if (!words) {
    const { error } = await supabase.from('session_prep').delete().eq('user_id', userId);
    if (error) throw problem(error);
    return null;
  }
  const row = { user_id: userId, body: words, noted_at: new Date().toISOString() };
  const { error } = await supabase.from('session_prep').upsert(row, { onConflict: 'user_id' });
  if (error) throw problem(error);
  return { body: words, noted_at: row.noted_at };
}

/** Tick a recap's action done (or not), or record that it is in the client's to-dos (050). */
export async function markAction(actionId, { done = null, placed = null } = {}) {
  const { error } = await supabase.rpc('my_session_action', { p_action: actionId, p_done: done, p_placed: placed });
  if (error) throw problem(error);
}

// ---------------------------------------------------------------- what this device remembers
// Per person, cleared by a Sign out like every page's last data: when the
// Coaching page was last opened (so Home knows which recap is new), the
// invites put off with Not now ("<day>|<profile id>") or closed for good
// here ("closed|<profile id>"), and where a recap's action was added.

const SEEN = 'coaching-seen';
const NOT_NOW = 'coaching-not-now';
const PLACED = 'coaching-placed';
const keyFor = (userId, name) => (userId ? deviceKey('cache', userId, name) : null);

export function readCoachingSeen(userId) {
  const at = Number(readJson(keyFor(userId, SEEN) || '')?.at);
  return Number.isFinite(at) ? at : null;
}
export function markCoachingSeen(userId, now = Date.now()) {
  const key = keyFor(userId, SEEN);
  if (key) writeJson(key, { at: now });
}
export function readCoachingNotNow(userId) {
  const list = readJson(keyFor(userId, NOT_NOW) || '');
  return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
}
export function addCoachingNotNow(userId, value) {
  const key = keyFor(userId, NOT_NOW);
  const next = [...readCoachingNotNow(userId).filter((v) => v !== value), value].slice(-40);
  if (key) writeJson(key, next);
  return next;
}
export function readCoachingPlaced(userId) {
  const map = readJson(keyFor(userId, PLACED) || '');
  return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
}
export function noteCoachingPlaced(userId, actionId, where) {
  const key = keyFor(userId, PLACED);
  const next = { ...readCoachingPlaced(userId) };
  if (where) next[actionId] = where; else delete next[actionId];
  if (key) writeJson(key, next);
  return next;
}
