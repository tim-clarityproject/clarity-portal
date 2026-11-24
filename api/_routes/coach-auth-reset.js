// The coach authenticator's server side (Phase 6a run 5; M26 seq 7, "Tim
// resets an associate's authenticator" and "Lost your authenticator app?").
//
// POST, with the caller's own sign-in as the Authorization header:
//
//   { kind: 'reset', coachId }   the owner resets an associate (coachId is
//     their public.coaches id). It:
//       1. checks, as the caller, that they are the owner (is_owner()) and
//          that the coach is another, active associate;
//       2. only on the live site, asks the database to reset them, as the
//          caller (053's coach_authenticator_reset: the owner only, at aal2,
//          never their own; it removes the codes and, where it can reach
//          Supabase's own tables, the factors and every session, and records
//          who reset whom);
//       3. removes any TOTP factor still there with Supabase's admin MFA
//          calls and the service key, so the coach sets it up again.
//
//   { kind: 'recovered' }        a coach who has just used a recovery code
//     (053's recovered_at, in the last 15 minutes) has the lost phone's
//     verified factors removed the same way, so the new phone can be set
//     up. 053 removes them itself where the database can.
//
// The service key never leaves the server, and nothing is sent: no email is
// ever part of recovery. On a preview or a developer's machine nothing is
// changed (maySend: production only), and the answer says so calmly
// (ran: false), after the same checks.
//
// Needs SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or
// VITE_SUPABASE_ANON_KEY) and SUPABASE_SERVICE_ROLE_KEY in Vercel.
import { createClient } from '@supabase/supabase-js';
import { maySend } from '../_guestEmails.js';
import { codeGiven } from '../_coachCode.js';

/** The words this function answers with (Claude's, in the portal's pattern: what happened, then what to do). */
export const RESET_WORDS = {
  signIn: 'Sign in again to carry on.',
  notOwner: 'Only the owner can reset an authenticator.',
  notThere: 'That coach isn’t here any more. Reload the page and try again.',
  self: 'You can’t reset your own authenticator. Use a recovery code, or a second phone set up in Sign-in security.',
  needsCode: 'Enter the 6-digit code from your authenticator app first, then try again.',
  notLive: 'Resetting an authenticator only works on the live site, so nothing has changed here.',
  notYet: 'This needs the database update for the authenticator first, so nothing has changed.',
  notSetUp: 'That didn’t work, because the server isn’t set up for it yet. Nothing has changed.',
  didntWork: 'That didn’t reset. Check your connection and try again.',
  notRecovered: 'Use a recovery code first, then set up your new phone.',
  badRequest: 'That didn’t work. Reload the page and try again.',
};

/** How long after a recovery code is used the lost phone's factors may be removed. */
export const RECOVERED_FOR_MS = 15 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const missing = (error) => ['PGRST202', '42883', 'PGRST205', '42P01'].includes(error?.code || '') || /could not find the function/i.test(error?.message || '');

/** Removes a person's TOTP factors through Supabase's admin MFA calls. `keep(factor)` true leaves one. */
export async function removeFactors(admin, userId, keep = () => false) {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) return { removed: 0, left: null };
  let removed = 0;
  let left = 0;
  for (const factor of data?.factors || []) {
    if (factor.factor_type !== 'totp' || keep(factor)) continue;
    const { error: gone } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (gone) left += 1;
    else removed += 1;
  }
  return { removed, left };
}

/**
 * The handler, with the Supabase client maker passed in (the unit test
 * stands Supabase in; Vercel uses the default export).
 * @param {{ createClient?: Function, now?: () => number }} [deps]
 */
export function makeHandler({ createClient: make = createClient, now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return reply(res, 405, { message: RESET_WORDS.badRequest });
    const env = process.env;
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (!url || !anon || !token) return reply(res, 401, { message: RESET_WORDS.signIn });
    const kind = req.body?.kind;
    if (kind !== 'reset' && kind !== 'recovered') return reply(res, 400, { message: RESET_WORDS.badRequest });

    const asCaller = make(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: who, error: whoError } = await asCaller.auth.getUser(token);
    const callerId = who?.user?.id;
    if (whoError || !callerId) return reply(res, 401, { message: RESET_WORDS.signIn });

    if (kind === 'recovered') {
      const { data: state, error } = await asCaller.rpc('coach_auth_state');
      if (error) return reply(res, missing(error) ? 503 : 502, { message: missing(error) ? RESET_WORDS.notYet : RESET_WORDS.didntWork, notYet: missing(error) });
      const at = Date.parse(state?.recovered_at || '');
      if (state?.coach !== true || !Number.isFinite(at) || now() - at > RECOVERED_FOR_MS || at - now() > 60 * 1000) {
        return reply(res, 403, { message: RESET_WORDS.notRecovered });
      }
      if (!maySend(env)) return reply(res, 200, { ok: true, ran: false, message: RESET_WORDS.notLive });
      if (!env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 500, { message: RESET_WORDS.notSetUp });
      const admin = make(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      // Only the lost phone's: a factor set up since the code was used stays.
      const { removed, left } = await removeFactors(admin, callerId, (f) => f.status !== 'verified' || Date.parse(f.created_at || '') > at);
      if (left === null || left > 0) return reply(res, 502, { message: RESET_WORDS.didntWork });
      return reply(res, 200, { ok: true, ran: true, factorsRemoved: removed });
    }

    // kind === 'reset': only a sign-in that has given its 6-digit code (054; 053's function asks the same).
    if (!codeGiven(token)) return reply(res, 403, { message: RESET_WORDS.needsCode, needsCode: true });
    // Only a plain id: never a list or anything else read as one (the break-it tester, 21 Nov).
    const coachId = typeof req.body?.coachId === 'string' ? req.body.coachId : '';
    if (!UUID.test(coachId)) return reply(res, 400, { message: RESET_WORDS.notThere });
    const { data: owner, error: ownerError } = await asCaller.rpc('is_owner');
    if (ownerError || owner !== true) return reply(res, 403, { message: RESET_WORDS.notOwner });
    const { data: rows, error: rowError } = await asCaller.from('coaches').select('id, user_id, role, active').eq('id', coachId).limit(1);
    if (rowError) return reply(res, 502, { message: RESET_WORDS.didntWork });
    const target = rows?.[0];
    if (!target || !target.active) return reply(res, 404, { message: RESET_WORDS.notThere });
    if (target.user_id === callerId || target.role === 'owner') return reply(res, 400, { message: RESET_WORDS.self });

    if (!maySend(env)) return reply(res, 200, { ok: true, ran: false, message: RESET_WORDS.notLive });
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 500, { message: RESET_WORDS.notSetUp });

    // The database's own check and record, asked as the owner.
    const { data: done, error } = await asCaller.rpc('coach_authenticator_reset', { p_coach: coachId });
    if (error) {
      if (missing(error)) return reply(res, 503, { message: RESET_WORDS.notYet, notYet: true });
      if (error.code === '42501') return reply(res, 403, { message: RESET_WORDS.notOwner });
      return reply(res, 502, { message: RESET_WORDS.didntWork });
    }
    if (done?.status === 'needs_code') return reply(res, 403, { message: RESET_WORDS.needsCode, needsCode: true });
    if (done?.status === 'self') return reply(res, 400, { message: RESET_WORDS.self });
    if (done?.status !== 'reset') return reply(res, 404, { message: RESET_WORDS.notThere });

    // Whatever the database couldn't reach, Supabase's admin calls remove.
    const admin = make(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { removed, left } = await removeFactors(admin, target.user_id);
    return reply(res, 200, {
      ok: true,
      ran: true,
      codesRemoved: done.codes_removed ?? 0,
      factorsRemoved: (done.factors_removed ?? 0) + removed,
      factorsLeft: left,
      // null from the database: it couldn't reach auth.sessions. Their next
      // refresh still works, but the coach portal asks coach_auth_state's
      // session_ok and signs a sign-in from before the reset out.
      signedOutEverywhere: done.sessions_removed !== null && done.sessions_removed !== undefined,
    });
  };
}

export default makeHandler();
