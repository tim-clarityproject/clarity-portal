// Saving a session, its private notes and its actions, and sending the
// recap (Phase 6a run 2, step 5; M11's "After a call: the recap"). Device
// first, as every coach table (store.js): a save resolves 'device' until
// Tim has run migration 050, then 'saved' or 'queued'. The rules themselves
// (what counts, what a sent recap locks, the words) are day.js's.
//
// A SENT RECAP IS LOCKED. Migration 050 refuses, in the database, any
// change to what the client was given: the recap, what happened, Waive it,
// when the session was and who it was with; and the actions that went with
// it can't be reworded, unticked, re-pointed or deleted, while one added
// afterwards never goes to the client. Before 050 there is no database to
// refuse, so every save here is checked the same way first (day.js's
// lockedSession and lockedAction) and refused here. Private notes and For
// supervision are never locked.
//
// Nothing here sends by itself: sendRecap runs only when the coach presses
// Send the recap, and it sends once however often it is pressed.
//
// TWO TABS ON ONE SESSION (run 6, item 3): a tab never writes over what
// another tab (or device) saved since it read the session. The page holds
// the session (holdSession) while it is open: every save of that session
// from this tab is sent "only if the session is still as this tab read it,
// or as this tab last saved it" (the sync queue's guarded rows, as the
// Health Check's versions; Health Check rule 21), and refused otherwise
// (code 'changed'). On the device itself the recap is compared as text
// first (`base`: the recap as this tab last read or saved it), so two tabs
// on one device are told at once, and before 050 too. Send carries the
// recap the tab shows to 054's session_send_recap(session, recap), which
// sends nothing when the database holds another ('changed').
import { supabase } from '../supabase';
import { apiFetch } from '../readShare';
import { guardRows, noteVersions, onSuperseded, unguardRows } from '../syncQueue';
import { coachDayReady, coachState, keyOf, loadCoach, newId, noteRows, removeRow, rowOf, rowsOf, saveRow, saveRows } from './store';
import { actionsOf, ALREADY_SENT, lockedAction, lockedSession, moveSession, NEEDS_RECAP, newSession, SENT_LINE, sessionPeopleRows, sessionSent } from './day';
import { clean } from './model';

const SESSIONS = 'coach_sessions';
const PEOPLE = 'coach_session_people';
const ACTIONS = 'coach_session_actions';
const NOTES = 'coach_session_notes';
const ITEMS = 'coach_cal_items';

const locked = () => { const e = new Error(SENT_LINE); e.code = 'locked'; return e; };
const kept = (userId, id) => rowOf(coachState(userId), SESSIONS, id);

/** What a page says when its session changed in another tab (with "Reload to see it"). */
export const CHANGED_ELSEWHERE = 'This session changed in another tab.';
const changed = () => { const e = new Error(CHANGED_ELSEWHERE); e.code = 'changed'; return e; };
const textOf = (v) => (typeof v === 'string' && v.trim() ? v : null);
const alreadySent = () => { const e = new Error(ALREADY_SENT); e.code = 'already_sent'; return e; };

/**
 * Has the recap changed since this tab read it? `base` is the recap as this
 * tab last read or saved it; `kept` the recap as the device (or database)
 * holds it now; `next` what this tab would save. A save that only repeats
 * what is there already is never refused.
 * @param {string|null|undefined} base undefined: not checked
 * @returns {boolean}
 */
export function recapChangedSince(base, keptRecap, next) {
  if (base === undefined) return false;
  const now = textOf(keptRecap);
  return now !== textOf(base) && now !== textOf(next);
}

/**
 * The session page holds its session while it is open: this tab's saves of
 * it are then sent only if it is still as this tab read it (054 not needed:
 * the queue's own "only if unchanged"). Resolves the release, for when the
 * page closes. `onChanged` hears a waiting save refused later.
 * @param {string} userId
 * @param {object} session the session as the page opened with it
 * @param {(row: object|null) => void} [onChanged]
 * @returns {() => void}
 */
export function holdSession(userId, session, onChanged = () => {}) {
  const rows = [{ id: session.id }];
  guardRows(SESSIONS, rows);
  let open = true;
  const stop = onSuperseded((error) => {
    if (!open || error?.table !== SESSIONS || (error.row && error.row.id !== session.id)) return;
    if (error.row) noteRows(userId, [[SESSIONS, error.row]]);
    onChanged(error.row || null);
  });
  (async () => {
    // The version this tab's saves are based on: the database's, when it holds the recap this page opened with;
    // otherwise this page is already behind, and its first save says so.
    if ((await coachDayReady()) !== true || !open) return;
    try {
      const { data, error } = await supabase.from(SESSIONS).select('id, recap, updated_at').eq('id', session.id).limit(1);
      const row = data?.[0];
      if (error || !row?.updated_at || !open) return;
      noteVersions(SESSIONS, [textOf(row.recap) === textOf(session.recap) ? row : { id: row.id, updated_at: '1970-01-01T00:00:00.000Z' }]);
    } catch { /* offline: the device's own check still holds */ }
  })();
  return () => { open = false; stop(); unguardRows(SESSIONS, rows); };
}

/** The session's private notes row, or a blank one. */
export const notesOf = (notes, session) => (notes || []).find((n) => n.session_id === session.id)
  || { session_id: session.id, coach_id: session.coach_id, layout: 'regular', focus: null, insight: null, next_time: null, supervision: null };

/**
 * Saves a session as it now stands. Refused (an Error whose code is
 * 'locked', saying day.js's SENT_LINE) when its recap has been sent and the
 * change touches what the client was given; and (code 'changed') when its
 * recap changed in another tab since this one read it (`base`), or the
 * database says the session moved on since (a held session).
 * @param {{ base?: string|null }} [opts] base: the recap as this tab last read or saved it
 */
export async function saveSession(userId, next, { base } = {}) {
  const before = kept(userId, next.id);
  const check = lockedSession(before, next);
  if (!check.ok) throw locked();
  if (recapChangedSince(base, before?.recap, next.recap)) throw changed();
  const status = await saveRow(userId, SESSIONS, check.row);
  // Sent from another device while this one was typing: the database keeps the recap as it was sent, and the words
  // typed here can't go. The page says so, instead of losing them quietly (fixer D's leftover; break-it tester, scale
  // check step 4).
  const after = kept(userId, next.id);
  if (!sessionSent(before) && sessionSent(after) && textOf(after?.recap) !== textOf(next.recap)) throw alreadySent();
  if (status === 'superseded') throw changed();
  return status;
}

/** Saves the private notes and For supervision: the coach's alone, and never locked. */
export const saveNotes = (userId, notes) => saveRow(userId, NOTES, notes);

/**
 * Saves one action. After the recap has gone: a new one is kept with send
 * off (it never goes to the client), and a change to the words, the tick or
 * where it goes is refused.
 */
export async function saveAction(userId, action) {
  const state = coachState(userId);
  const check = lockedAction(rowOf(state, SESSIONS, action.session_id), rowOf(state, ACTIONS, action.id), action);
  if (!check.ok) throw locked();
  return saveRow(userId, ACTIONS, check.row);
}

/** Deletes one action; resolves the row for Undo. Refused when it went with a sent recap. */
export async function removeAction(userId, action) {
  const state = coachState(userId);
  if (!lockedAction(rowOf(state, SESSIONS, action.session_id), rowOf(state, ACTIONS, action.id) || action, null).ok) throw locked();
  return removeRow(userId, ACTIONS, action.id);
}

/**
 * Adds a session, not yet written up. A group's session names each member
 * whose session counts against their own engagement.
 * @param {{ coachId: string, profileId?: string, groupId?: string, engagementId?: string, kind?: string, startsAt: string, minutes: number, members?: object[], engagements?: object[] }} a
 * @returns {Promise<{ session: object, pairs: [string, object][] }>} the pairs for Undo (removeSession)
 */
export async function addSession(userId, { members = [], engagements = [], ...what }) {
  const session = newSession({ id: newId(), ...what });
  const pairs = [[SESSIONS, session], ...(session.group_id ? sessionPeopleRows(session.id, members, engagements).map((p) => [PEOPLE, p]) : [])];
  await saveRows(userId, pairs);
  return { session, pairs };
}

/**
 * Deletes a session with its notes, actions and people; resolves the rows
 * Undo saves again. Refused once its recap has been sent: the client has it.
 */
export async function removeSession(userId, session) {
  const state = coachState(userId);
  if (sessionSent(rowOf(state, SESSIONS, session.id) || session)) throw locked();
  const gone = [[SESSIONS, session]];
  for (const [table, rows] of [[ACTIONS, rowsOf(state, ACTIONS)], [NOTES, rowsOf(state, NOTES)], [PEOPLE, rowsOf(state, PEOPLE)]]) {
    for (const row of rows.filter((r) => r.session_id === session.id)) {
      gone.push([table, row]);
      await removeRow(userId, table, keyOf(table, row)).catch(() => null);
    }
  }
  await removeRow(userId, SESSIONS, session.id);
  return gone;
}

/** With 050 and a connection: has this session's recap been sent, whatever this device's copy says? */
async function sentElsewhere(userId, id) {
  try {
    if ((await coachDayReady()) !== true) return false;
    const { data, error } = await supabase.from(SESSIONS).select('id, recap_sent_at').eq('id', id).limit(1);
    if (error || !data?.[0]?.recap_sent_at) return false;
    await loadCoach(userId, { again: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Moved: this session is marked moved to the new time and a new one is
 * made there with the same people. Resolves what Undo needs.
 * @returns {Promise<{ made: object, undo: () => Promise<void> }>}
 */
export async function moveSessionTo(userId, session, newStartsAt) {
  const state = coachState(userId);
  const before = rowOf(state, SESSIONS, session.id) || session;
  if (sessionSent(before)) throw locked();
  // Sent from another device since this page loaded: the database would keep the session as it was sent, yet the new
  // session would still be made. So the database is asked first, and the page then shows the session as sent.
  if (await sentElsewhere(userId, session.id)) throw locked();
  // The calendar's call (and its travel time) goes with it to the new time and the new session (day.js callMovedWithSession).
  const wasItems = rowsOf(state, ITEMS);
  const { moved, made, people, items } = moveSession({ ...before, ...session }, newStartsAt, newId(), rowsOf(state, PEOPLE), wasItems);
  const itemsBefore = items.map((i) => wasItems.find((x) => x.id === i.id)).filter(Boolean);
  const putItemsBack = async () => { if (itemsBefore.length) await saveRows(userId, itemsBefore.map((i) => [ITEMS, i])).catch(() => null); };
  const status = await saveRows(userId, [[SESSIONS, { ...moved, written_up_at: moved.written_up_at || new Date().toISOString() }], [SESSIONS, made], ...people.map((p) => [PEOPLE, p]), ...items.map((i) => [ITEMS, i])]);
  if (status === 'superseded') {
    // Changed in another tab since this one read it: the new time isn't made either.
    await putItemsBack();
    for (const p of people) await removeRow(userId, PEOPLE, keyOf(PEOPLE, p)).catch(() => null);
    await removeRow(userId, SESSIONS, made.id).catch(() => null);
    throw changed();
  }
  return {
    made,
    undo: async () => {
      await putItemsBack();
      for (const p of people) await removeRow(userId, PEOPLE, keyOf(PEOPLE, p)).catch(() => null);
      await removeRow(userId, SESSIONS, made.id).catch(() => null);
      await saveRow(userId, SESSIONS, before).catch(() => null);
    },
  };
}

// ---------------------------------------------------------------- sending the recap

const sending = new Map(); // session id → the send on its way (one request a press, and one send however many presses)

async function emailRecap(sessionId) {
  // The server reads the session and who it goes to with the coach's own
  // sign-in, and only ever sends from the live site.
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return false;
    const res = await apiFetch('/api/coach-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: 'recap', sessionId }),
    });
    const body = await res.json().catch(() => null);
    return res.ok && body?.sent === true;
  } catch {
    return false;
  }
}

const CHANGED = Object.freeze({ status: 'changed', message: CHANGED_ELSEWHERE });

/** 054's send with the recap as this tab shows it; 050's own before 054 has run. */
async function sendInDatabase(id, recap) {
  const answer = await supabase.rpc('session_send_recap', { p_session: id, p_recap: recap });
  const missing = answer.error && (answer.error.code === 'PGRST202' || answer.status === 404);
  return missing ? supabase.rpc('session_send_recap', { p_session: id }) : answer;
}

async function send(userId, { session, notes = null, actions = [] }, { base } = {}) {
  const before = kept(userId, session.id);
  if (sessionSent(before)) return { status: 'already_sent', message: ALREADY_SENT };
  if (!clean(session.recap)) return { status: 'needs_recap', message: NEEDS_RECAP };
  // Another tab on this device saved another recap since this one read it: nothing is saved or sent.
  if (recapChangedSince(base, before?.recap, session.recap)) return CHANGED;
  const now = new Date().toISOString();
  // (a) Everything on the page is saved first, as it stands.
  const row = { ...(before || {}), ...session, outcome: 'held', waived: false, moved_to: null, written_up_at: session.written_up_at || now };
  const pairs = [[SESSIONS, row], ...(notes ? [[NOTES, notes]] : []), ...actions.filter((a) => clean(a.title)).map((a) => [ACTIONS, a])];
  const saved = await saveRows(userId, pairs);
  // Another tab or device saved this session since this tab read it: the database kept theirs, and nothing is sent.
  if (saved === 'superseded') return CHANGED;

  // (b) With 050: the database sends it, once ('sent' or 'already_sent'), then the email is asked for.
  if ((await coachDayReady()) === true) {
    if (saved === 'queued') { const e = new Error('Sending needs a connection, so try again when you’re back online.'); e.code = 'offline'; throw e; }
    const { data, error } = await sendInDatabase(session.id, row.recap);
    if (error) { const e = new Error(error.code === '22023' || error.code === '42501' ? error.message : 'That didn’t send. Check your connection and try again.'); e.code = error.code; throw e; }
    if (data === 'already_sent') { loadCoach(userId, { again: true }); return { status: 'already_sent', message: ALREADY_SENT }; }
    if (data === 'changed') { loadCoach(userId, { again: true }); return CHANGED; }
    // The device's copy follows the database's at once; the next load brings its own time.
    noteRows(userId, [[SESSIONS, { ...row, recap_sent_at: now, recap_sent_by: userId }]]);
    const emailed = await emailRecap(session.id);
    loadCoach(userId, { again: true });
    return { status: 'sent', emailed };
  }

  // (c) Before 050: marked sent on this device only, and nothing is emailed.
  if (sessionSent(kept(userId, session.id))) return { status: 'already_sent', message: ALREADY_SENT };
  await saveRow(userId, SESSIONS, { ...row, recap_sent_at: now, recap_sent_by: userId });
  return { status: 'sent', emailed: false, device: true };
}

/**
 * Send the recap. It sends once: a second press while the first is on its
 * way resolves { status: 'sending' }, and any press after it has gone
 * (here, or in another tab) resolves { status: 'already_sent' }. When the
 * recap changed in another tab since this one read it, nothing is saved or
 * sent: { status: 'changed' }.
 * @param {string} userId
 * @param {{ session: object, notes?: object, actions?: object[] }} page the session, its notes and its actions as the page has them
 * @param {{ base?: string|null }} [opts] base: the recap as this tab last read or saved it
 * @returns {Promise<{ status: 'sent'|'already_sent'|'needs_recap'|'sending'|'changed', emailed?: boolean, message?: string }>}
 */
export function sendRecap(userId, page, opts = {}) {
  const id = page.session.id;
  if (sending.has(id)) return Promise.resolve({ status: 'sending' });
  const run = send(userId, page, opts).finally(() => { sending.delete(id); });
  sending.set(id, run);
  return run;
}

/** A session's actions as kept, in order (for a page that isn't rendering). */
export const keptActions = (userId, sessionId) => actionsOf(rowsOf(coachState(userId), ACTIONS), sessionId);
