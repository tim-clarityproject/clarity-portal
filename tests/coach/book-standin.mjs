// Booking's stand-ins for the pages OUTSIDE the coach portal (Phase 6a run
// 3, step 4): a signed-out guest on a booking page, a single-use link, their
// own booking or a poll. Migration 051 is not on the test project, and
// nothing here ever reaches it: every function those pages call is answered
// as 051's SQL answers it (cal-standin.mjs), from a store this file makes
// (bookStore) or from the coach's own stand-in store (shared.mjs's
// standIn(…, { cal: true })), so a guest and a coach can share one database
// in a walk. Every other request is stopped and listed. No email is sent.
import { calStandIn, CAL_FUNCTIONS, CAL_TABLES } from './cal-standin.mjs';
import { ME, OTHER } from './shared.mjs';

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
class Refusal extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }
const no = (code, message, status) => { throw new Refusal(code, message, status); };
const OTHER_TABLES = ['coach_notifications', 'coach_settings', 'coach_away', 'client_profiles', 'engagements', 'coach_sessions', 'coach_groups'];

/** A database with 051 in it and nobody signed in: `rows` by table (a seed), `now` its clock. */
export function bookStore(rows = {}, { now = () => new Date() } = {}) {
  const me = { id: ME, user_id: null, role: 'owner', display_first_name: 'Alex', full_name: 'Alex Morgan', active: true };
  const store = { rows: Object.fromEntries([...CAL_TABLES, ...OTHER_TABLES].map((t) => [t, [...(rows[t] || [])]])), coaches: [me, { id: OTHER, user_id: null, role: 'coach', display_first_name: 'Maya', full_name: 'Maya Collins', active: true }], calls: [], blocked: [], there: true };
  store.fn = calStandIn({ store, ME, me, clock: now, no }).fn;
  return store;
}

/**
 * Puts 051's functions in front of a page that has no coach signed in.
 * `store`: bookStore()'s, or a coach page's own stand-in store (they then
 * share one database). `uid`: the account asking, for a signed-in client.
 * `store.there = false` answers as a database without 051 does.
 */
export async function guestStandIn(page, store, { uid = null } = {}) {
  store.calls = store.calls || [];
  store.blocked = store.blocked || [];
  await page.route('**/api/**', (r) => { store.calls.push(`api ${new URL(r.request().url()).pathname}`); return json(r, { sent: false, reason: 'preview' }); });
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const name = new URL(req.url()).pathname.split('/rest/v1/')[1] || '';
    if (!name.startsWith('rpc/')) {
      if (['GET', 'HEAD'].includes(req.method())) return json(route, []);
      store.blocked.push(`${req.method()} ${name.split('?')[0]}`);
      return route.abort('blockedbyclient');
    }
    const fn = name.slice(4).split('?')[0];
    const a = (() => { try { return req.postDataJSON() || {}; } catch { return {}; } })();
    store.calls.push(`rpc ${fn}`);
    if (!CAL_FUNCTIONS.includes(fn)) return json(route, null);
    if (store.there === false || !store.fn?.booking_page) return json(route, { code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${fn} in the schema cache` }, 404);
    const answers = {
      booking_page: () => store.fn.booking_page(uid, a.p_key),
      booking_free_times: () => store.fn.booking_free_times(uid, a.p_key, a.p_from, a.p_to),
      booking_make: () => store.fn.booking_make(uid, a.p_key, a.p_start, a.p_name, a.p_email, a.p_zone, a.p_answers ?? {}, a.p_early_late ?? false),
      booking_mine: () => store.fn.booking_mine(uid, a.p_guest_key),
      booking_move_times: () => store.fn.booking_move_times(uid, a.p_guest_key, a.p_from, a.p_to),
      booking_move: () => store.fn.booking_move(uid, a.p_guest_key, a.p_start, a.p_early_late ?? false),
      booking_cancel: () => store.fn.booking_cancel(uid, a.p_guest_key),
      poll_page: () => store.fn.poll_page(uid, a.p_key),
      poll_vote: () => store.fn.poll_vote(uid, a.p_key, a.p_votes),
      my_booking_times: () => store.fn.my_booking_times(uid, a.p_from, a.p_to, a.p_minutes ?? null),
      my_sessions_coming: () => store.fn.my_sessions_coming(uid),
      my_session_book: () => store.fn.my_session_book(uid, a.p_start, a.p_minutes ?? null),
      my_session_move: () => store.fn.my_session_move(uid, a.p_session, a.p_start, a.p_late_ok ?? false),
      my_session_cancel: () => store.fn.my_session_cancel(uid, a.p_session, a.p_late_ok ?? false),
    };
    if (!answers[fn]) return json(route, { code: '42501', message: `permission denied for function ${fn}` }, 403);
    try { return json(route, answers[fn]()); } catch (e) { if (e instanceof Refusal || e?.code) return json(route, { code: e.code, message: e.message }, e.status || 400); throw e; }
  });
  return store;
}
