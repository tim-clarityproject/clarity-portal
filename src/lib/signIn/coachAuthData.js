// The coach authenticator's data calls (Phase 6a run 5): migration 053's
// functions, Supabase's own MFA reads, and the server's reset. Every call
// takes the Supabase client (the app passes its own `supabase`; the tests
// pass a stand-in), so this file never reads a key or an address itself.
//
// BEFORE 053 RUNS ("not yet", remembered for an hour, as the coach store
// does for 049 to 052, so the browser's console shows one 404 an hour):
//   - Supabase's own TOTP still works: Enter your code, Set up your
//     authenticator and Turn it on all work, and set-up is still required.
//   - There are no recovery codes: the codes screen is skipped (nothing can
//     be kept, so none are ever shown), "Lost your authenticator app?" has
//     no Recovery code box, only the line naming the owner (unnamed, as an
//     associate can't read the owner's row before 053), and My Account's
//     Recovery codes row says CODES_NOT_YET's first line.
//   - The owner's reset answers "not yet" (the server asks 053 first).
import { coachAuthStop, readRecoveryCode, RECOVERY_CODE_COUNT } from './coachAuth';

const NOT_YET_KEY = 'clarity-coach-auth-not-yet';
const NOT_YET_MS = 60 * 60 * 1000;
let readyNow = null;

/** The database's answer for a function or table it doesn't have yet. */
export function isNotThere(error) {
  const code = error?.code || '';
  return ['PGRST202', '42883', 'PGRST205', '42P01'].includes(code) || /could not find the function|does not exist/i.test(error?.message || '');
}

/** No connection (never the database's own refusal, which carries a code). */
export function isOfflineError(error) {
  if (!error) return false;
  if (typeof error.code === 'string' && /^(PGRST\d{3}|[0-9A-Z]{5})$/.test(error.code)) return false;
  if (error.name === 'TypeError' || error.name === 'AbortError') return true;
  return /Failed to fetch|NetworkError|Load failed|offline|timed out/i.test(`${error.message || ''}`);
}

function notYetKept(storage) {
  try {
    const at = Number(storage?.getItem(NOT_YET_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() >= at && Date.now() - at < NOT_YET_MS;
  } catch {
    return false;
  }
}
function keepNotYet(missing, storage) {
  try {
    if (missing) storage?.setItem(NOT_YET_KEY, String(Date.now()));
    else storage?.removeItem(NOT_YET_KEY);
  } catch { /* asked again next time */ }
}

/** What the last look said about 053: true, false (not yet) or null (not asked). */
export const coachAuthReadyNow = () => readyNow;
/** For tests: forget what was found. */
export function forgetCoachAuthReady(storage = globalThis.localStorage) {
  readyNow = null;
  keepNotYet(false, storage);
}

async function call(supabase, name, args, storage) {
  if (readyNow === false || (readyNow === null && notYetKept(storage))) {
    readyNow = false;
    return { notYet: true };
  }
  let answer;
  try {
    answer = await supabase.rpc(name, args);
  } catch (error) {
    return { offline: isOfflineError(error), error };
  }
  const { data, error } = answer || {};
  if (error) {
    if (isNotThere(error)) {
      readyNow = false;
      keepNotYet(true, storage);
      return { notYet: true };
    }
    return { offline: isOfflineError(error), error };
  }
  readyNow = true;
  keepNotYet(false, storage);
  return { data };
}

/**
 * 053's state for the signed-in person: { ready: true, state } with state as
 * coach_auth_state() answers it, { ready: false } before 053, or
 * { ready: null, offline } when it can't be told.
 */
export async function loadCoachAuthState(supabase, { storage = globalThis.localStorage } = {}) {
  const got = await call(supabase, 'coach_auth_state', undefined, storage);
  if (got.notYet) return { ready: false, state: null };
  if (got.error) return { ready: null, state: null, offline: Boolean(got.offline) };
  return { ready: true, state: got.data || { coach: false } };
}

/** The verified TOTP factor and the sign-in's assurance level, from Supabase. */
export async function loadFactor(supabase) {
  try {
    const [{ data: factors }, { data: level }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const factor = (factors?.totp || []).find((f) => f.status === 'verified') || null;
    return { factor, level: level?.currentLevel || null, known: true };
  } catch {
    return { factor: null, level: null, known: false };
  }
}

/** Whether the signed-in person is an active coach, from their own coach row (readable before 053). */
async function ownCoachRow(supabase, userId) {
  try {
    const { data, error } = await supabase.from('coaches').select('id, role, active, display_first_name').eq('user_id', userId).limit(1);
    if (error) return { known: false, row: null };
    const row = data?.[0];
    return { known: true, row: row && row.active ? row : null };
  } catch {
    return { known: false, row: null };
  }
}

/**
 * Everything the screens and the stop need, in one look:
 * { isCoach (true, false, or null when it can't be told), isOwner, ready
 *   (053), factor, level, codesLeft, codesTotal, codesSaved, turnedOnAt,
 *   ownerFirstName, waitSeconds, sessionOk, lastResetAt }.
 */
export async function loadCoachAuth(supabase, user, opts = {}) {
  if (!user) return { isCoach: false };
  const [{ ready, state }, { factor, level }] = await Promise.all([loadCoachAuthState(supabase, opts), loadFactor(supabase)]);
  let isCoach = null;
  let isOwner = false;
  if (ready === true) {
    isCoach = state?.coach === true;
    isOwner = state?.owner === true;
  } else {
    const own = await ownCoachRow(supabase, user.id);
    if (own.known) {
      isCoach = Boolean(own.row);
      isOwner = own.row?.role === 'owner';
    }
  }
  return {
    isCoach,
    isOwner,
    ready: ready === true,
    factor,
    level,
    codesLeft: state?.codes_left ?? 0,
    codesTotal: state?.codes_total ?? 0,
    codesSaved: state?.codes_saved === true,
    turnedOnAt: state?.turned_on_at || null,
    ownerFirstName: state?.owner_first_name || null,
    waitSeconds: state?.wait_seconds || 0,
    sessionOk: state ? state.session_ok !== false : true,
    lastResetAt: state?.last_reset_at || null,
  };
}

/**
 * The stop the signed-in coach owes (coachAuthStop's), or null for anyone
 * who isn't a coach. Builder B calls it from flow.js's signInStop.
 */
export async function coachSignInStop(supabase, user, opts = {}) {
  const auth = await loadCoachAuth(supabase, user, opts);
  return coachAuthStop({ isCoach: auth.isCoach, hasFactor: Boolean(auth.factor), level: auth.level, ready: auth.ready, codesSaved: auth.codesSaved, sessionOk: auth.sessionOk });
}

// ---------------------------------------------------------------- 053's changes

const answer = (got, ok) => {
  if (got.notYet) return { status: 'not_yet' };
  if (got.error) return { status: got.offline ? 'offline' : 'error' };
  // A sign-in from before the owner's reset: 053 changes nothing for it, and the page lets it go.
  if (got.data?.status === 'signed_out') return { status: 'signed_out' };
  return ok(got.data || {});
};

/** "Turn it on" was accepted: records when (On since). { status: 'on' | 'needs_code' | 'not_yet' | 'offline' | 'error' } */
export async function noteAuthenticatorOn(supabase, factorId, opts = {}) {
  const got = await call(supabase, 'coach_authenticator_on', { p_factor: factorId || null }, opts.storage ?? globalThis.localStorage);
  return answer(got, (d) => ({ status: d.status || 'error', turnedOnAt: d.turned_on_at || null }));
}

/**
 * A new set of 10 (needs this sign-in to have given its 6-digit code).
 * The plain codes come back once: keep them in the page's memory only,
 * never on the device and never in a log.
 * { status: 'made', codes, madeAt, setId } | needs_code | signed_out | not_yet | offline | error
 */
export async function makeRecoveryCodes(supabase, opts = {}) {
  const got = await call(supabase, 'coach_recovery_codes_make', undefined, opts.storage ?? globalThis.localStorage);
  return answer(got, (d) => (d.status === 'made' && Array.isArray(d.codes) && d.codes.length === RECOVERY_CODE_COUNT
    ? { status: 'made', codes: d.codes, madeAt: d.made_at || null, ...(d.set_id ? { setId: d.set_id } : {}) }
    : { status: d.status === 'needs_code' ? 'needs_code' : 'error' }));
}

/**
 * The tick "I've saved them somewhere safe.", for the set the page shows
 * (`setId`, from makeRecoveryCodes). { status: 'saved' | 'replaced' | 'none'
 * | ... }: 'replaced' when new codes were made since (another tab), so the
 * codes on this page don't work and nothing is marked saved (the break-it
 * tester, 21 Nov).
 */
export async function markCodesSaved(supabase, setId = null, opts = {}) {
  if (setId && typeof setId === 'object') return markCodesSaved(supabase, null, setId);
  const got = await call(supabase, 'coach_recovery_codes_saved', setId ? { p_set: setId } : undefined, opts.storage ?? globalThis.localStorage);
  return answer(got, (d) => ({ status: d.status || 'error' }));
}

/**
 * One recovery code, used once.
 *   { status: 'used', left }        in; the lost phone's factor is removed
 *                                   (then ask the server: askServerRecovered)
 *   { status: 'no_match' }          wrong, or already used (one answer)
 *   { status: 'wait', seconds, justNow } 5 wrong in a row: 30 seconds (justNow: this was the 5th)
 *   { status: 'type_it' }           nothing that could be a code was typed
 *   { status: 'not_yet' | 'offline' | 'error' }
 */
export async function spendRecoveryCode(supabase, typed, opts = {}) {
  const plain = readRecoveryCode(typed);
  if (!plain) return { status: 'type_it' };
  const got = await call(supabase, 'coach_recovery_code_use', { p_code: plain }, opts.storage ?? globalThis.localStorage);
  return answer(got, (d) => {
    if (d.status === 'used') return { status: 'used', left: Number(d.codes_left) || 0, factorsRemoved: d.factors_removed ?? null };
    if (d.status === 'wait') return { status: 'wait', seconds: Number(d.wait_seconds) || 30, justNow: d.started === true };
    if (d.status === 'no_match') return { status: 'no_match' };
    return { status: 'error' };
  });
}

// ---------------------------------------------------------------- the server

async function postReset(body, { token, fetchImpl = globalThis.fetch } = {}) {
  let res;
  try {
    res = await fetchImpl('/api/coach-auth-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { status: 'offline' };
  }
  const reply = await res.json().catch(() => null);
  if (!res.ok || !reply) return { status: reply?.notYet ? 'not_yet' : reply?.needsCode ? 'needs_code' : 'refused', message: reply?.message || null, code: res.status };
  return { status: reply.ran ? 'done' : 'not_live', message: reply.message || null, ...reply };
}

/**
 * The owner resets an associate's authenticator, through the server (the
 * service key never reaches the browser). `token` is the owner's own
 * access token. Answers { status: 'done' | 'not_live' | 'not_yet' |
 * 'needs_code' | 'refused' | 'offline', message }; 'not_live' on a preview
 * or a developer's machine, where nothing changes.
 */
export function resetCoachAuthenticator({ coachId, token, fetchImpl }) {
  return postReset({ kind: 'reset', coachId }, { token, fetchImpl });
}

/** After a recovery code: the server removes the lost phone's factors where 053 couldn't. */
export function askServerRecovered({ token, fetchImpl }) {
  return postReset({ kind: 'recovered' }, { token, fetchImpl });
}
