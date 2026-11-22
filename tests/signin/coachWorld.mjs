// A coach's sign-in, stood in whole (Phase 6a run 5): nothing reaches the
// test project or anything hosted. An invented associate, Maya; Supabase's
// own sign-in and MFA calls (the password, the token and its refresh, the
// account, enrol, challenge, verify, unenrol, sign out), migration 053's
// functions and the server's reset (/api/coach-auth-reset) are answered
// here, shaped and behaving as the real ones do. No real authenticator is
// ever enrolled, no email is sent, and no key, code or token is printed.
//
//   const world = await coachWorld(context, { factor: 'verified', aal: 'aal1', ready: true })
//   await world.attach(otherContext, { signedOut: true })   a second computer, the same account
//   world.calls       what the page asked for (never a code or a token)
//   world.codes       the recovery codes in force: { code, used }, the plain
//                     code only for the ones the test seeded (M26's); a set
//                     made on the page is read from the page, as a person would
//   world.goodCode    the 6-digit code the authenticator shows right now
//                     (the factor being set up, else the one turned on)
//   world.codeFor(key) the code an app holding that key shows right now
//
// What behaves as the real thing (the functionality tester, 21 Nov, fixed
// these from builder B's first version):
//   - each sign-in is its own session, with its own level (aal1, aal2 once
//     its code is given), its own refresh token and a session id in its
//     token; a refresh keeps the session's level and its first sign-in time
//     (amr) and gives a new iat; sign out ends it (scope global: all of the
//     account's); a session that has ended answers as Supabase does
//     (session_not_found, refresh_token_not_found);
//   - the password is checked;
//   - every enrolment gets a new key (the first is M26's, for the pictures),
//     and a code is checked against that factor's own key as RFC 6238 TOTP,
//     a step either side allowed, as Supabase does;
//   - recovery codes are kept hashed (scrypt with a salt), read as 053 reads
//     them (any case, spaces, dashes, o as 0), each used once; a new set is
//     new codes (the first set made can be M26's, `firstMake`); a used code
//     removes every factor (053's _coach_auth_remove) where the database can;
//   - coach_auth_state's session_ok is 053's: the session still there (where
//     the database can see sessions) and begun (its earliest amr) no earlier
//     than the last reset; and 055's: a sign-in begun before a recovery code
//     was used, other than the one that used it, is ended ('ended_by'
//     'recovery'); a used code ends the other sessions where the database
//     can reach them, and Supabase's own sign out (scope others) ends them
//     anywhere;
//   - coach_authenticator_reset is 053's (the owner only, 42501 otherwise;
//     aal2; never their own; codes, factors and every session go, recorded);
//   - with `live: true`, /api/coach-auth-reset runs the real server
//     (api/coach-auth-reset.js) as the live site would, with Supabase and
//     its admin calls answered by this world; otherwise it answers as a
//     preview does (nothing changes).
//   - `coachData: true` (run 6, migration 054): the coach portal's own
//     tables and functions answer as 054 makes the database answer: at aal1
//     a table reads empty (the restrictive rule) and a coach function is
//     refused (42501); at aal2 they hold one invented client whose name is
//     COACH_DATA_MARKER, so a test can see whether coach data ever reached
//     the page. A sign-in from before the coach's last reset answers as
//     aal1 (054's coach_code_ok()). world.coachAnswers lists each answer:
//     { path, aal, gave }.
//   - `sqlReachesAuth: false`: a hosted database whose migration can't reach
//     Supabase's own auth tables: 053 removes no factors or sessions, and
//     the server's admin calls remove the factors (no admin call signs a
//     user out, so the sessions stay).
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { APP, TEST_REF } from './shared.mjs';
import { totp } from './totp.mjs';
import { makeHandler } from '../../api/coach-auth-reset.js';
import { CODE_ALPHABET } from '../../src/lib/signIn/coachAuth.js';

const b64u = (text) => Buffer.from(text, 'utf8').toString('base64url');
export const MAYA = { id: '00000000-0000-4000-8000-00000000c0a1', email: 'maya.collins@harbourlane.co', first: 'Maya' };
export const OWNER = { id: '00000000-0000-4000-8000-00000000c0a0', first: 'Tim' };
export const MAYA_COACH = '00000000-0000-4000-8000-0000000c0ac1';
/** The invented client in the stood-in coach tables (054's stand-in): seen anywhere at aal1, coach data leaked. */
export const COACH_DATA_MARKER = 'Quill Invented-Marker';
/** The coach portal's own tables and functions (054's coach_code_tables(), and the coach functions), by name. */
export const COACH_TABLE = /^(coach_|client_|network_|workshop|engagement|organisation_(contacts|documents|deals|growth)$|activity_log$|data_requests$|time_entries$|session_prep$)/;
export const COACH_RPC = /^(coach_|client_|network_|lead_|session_(send|recap)|workshop_follow_up|board_|is_owner$|is_coach)/;
export const OWNER_COACH = '00000000-0000-4000-8000-0000000c0ac0';
/** Maya's invented password (never a real one). */
export const MAYA_PASSWORD = 'lighthouse-keeper-77';
// M26's own invented codes and key.
export const M26_CODES = ['k7q29fmd', 'x3vpr8tn', 'b6wh2jcq', 'm9zet4ra', 'p2nd7wkf', 'c8yt3hsm', 'r5gq6vbe', 'h4mj9xpd', 'w7tc2nzk', 'f3rb8qyh'];
export const M26_KEY = 'JBSWY3DPEHPK3PXP';
const SEED_FACTOR = '00000000-0000-4000-8000-0000000000f1';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const LIVE_ENV = { SUPABASE_URL: 'https://stand-in.invalid', SUPABASE_ANON_KEY: 'anon-stand-in', SUPABASE_SERVICE_ROLE_KEY: 'service-stand-in', VERCEL_ENV: 'production' };

const now = () => Math.floor(Date.now() / 1000);
/** 053's _coach_code_plain. */
const plainOf = (code) => String(code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/o/g, '0');
const hashOf = (plain, salt) => scryptSync(plain, salt, 32);
const newKey = () => Array.from(randomBytes(32), (b) => B32[b % 32]).join('');
const newCode = () => Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % 32]).join('');
/** The payload of a token (the page's own copy: never verified here, as the stand-in signs nothing). */
export function claimsOf(token) {
  try { return JSON.parse(Buffer.from(String(token || '').split('.')[1] || '', 'base64url').toString('utf8')); } catch { return null; }
}

/**
 * The world: one account's sign-in, factors, codes and 053 state, shared by
 * every context attached to it.
 * @param {{ factor?: 'none'|'verified', aal?: 'aal1'|'aal2', ready?: boolean, role?: 'coach'|'owner'|'client',
 *   codesLeft?: number, codesMade?: boolean, codesSaved?: boolean, turnedOnAt?: string|null, sessionOk?: boolean,
 *   offline?: boolean, firstMake?: 'm26'|'random', live?: boolean, sqlReachesAuth?: boolean,
 *   user?: { id: string, email: string, first: string }, coaches?: object[] }} o
 */
export function makeWorld(o = {}) {
  const user0 = o.user || MAYA;
  const seededAt = '2026-12-02T10:00:00Z';
  const world = {
    calls: [],
    user: user0,
    password: MAYA_PASSWORD,
    secret: M26_KEY,
    ready: o.ready !== false,
    role: o.role || 'coach',
    live: Boolean(o.live),
    sqlReachesAuth: o.sqlReachesAuth !== false,
    firstMake: o.firstMake || 'm26',
    sessions: new Map(),
    factors: o.factor === 'verified' ? [{ id: SEED_FACTOR, factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator', created_at: seededAt, updated_at: seededAt }] : [],
    keys: new Map(o.factor === 'verified' ? [[SEED_FACTOR, M26_KEY]] : []),
    codeRows: [],
    codesMade: o.codesMade ?? true,
    codesSaved: o.codesSaved !== false,
    turnedOnAt: o.turnedOnAt === undefined ? (o.factor === 'verified' ? seededAt : null) : o.turnedOnAt,
    recoveredAt: null,
    lastResetAt: null,
    othersEndedAt: null,
    keptSession: null,
    wrongRecovery: 0,
    waitUntil: 0,
    down: Boolean(o.offline),
    enrolled: 0,
    madeSets: 0,
    resets: [],
    serverRecovered: 0,
    server: [],
    coachData: Boolean(o.coachData),
    coachAnswers: [],
    coaches: o.coaches || [
      { id: MAYA_COACH, user_id: user0.id, role: o.role === 'owner' ? 'owner' : 'coach', active: true, display_first_name: user0.first },
      { id: OWNER_COACH, user_id: OWNER.id, role: 'owner', active: true, display_first_name: OWNER.first },
    ],
  };
  const keep = (plain) => { const salt = randomBytes(16); return { salt, hash: hashOf(plain, salt) }; };
  const setOf = (plains, { known }) => { const set = randomUUID(); return plains.map((p, i) => ({ ...keep(p), set, position: i + 1, plain: known ? p : null, usedAt: null })); };
  if (world.codesMade) {
    world.codeRows = setOf(M26_CODES, { known: true });
    world.codeRows.forEach((r, i) => { if (i < 10 - (o.codesLeft ?? 10)) r.usedAt = new Date().toISOString(); });
  }
  Object.defineProperty(world, 'codes', { get: () => world.codeRows.map((r) => ({ code: r.plain, used: Boolean(r.usedAt) })) });
  world.left = () => world.codeRows.filter((r) => !r.usedAt).length;
  world.codeFor = (key, at = Date.now()) => totp(key, at);
  Object.defineProperty(world, 'goodCode', {
    get: () => {
      const pending = [...world.factors].reverse().find((f) => f.status !== 'verified');
      const on = world.factors.find((f) => f.status === 'verified');
      const f = pending || on;
      return f ? totp(world.keys.get(f.id)) : '000000';
    },
  });
  const owner = () => world.coaches.find((c) => c.role === 'owner' && c.active);
  const userOut = () => ({
    id: world.user.id, aud: 'authenticated', role: 'authenticated', email: world.user.email, email_confirmed_at: '2026-11-01T09:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { first_name: world.user.first, terms_accepted: true },
    identities: [{ provider: 'email', identity_data: { email: world.user.email } }], factors: world.factors.map((f) => ({ ...f })), created_at: '2026-11-01T09:00:00Z',
  });

  // ---- sessions, as Supabase keeps them.
  function token(s) {
    const t = now();
    const amr = [...(s.aal === 'aal2' ? [{ method: 'totp', timestamp: s.codeAt }] : []), { method: 'password', timestamp: s.signedInAt }];
    const payload = { sub: world.user.id, email: world.user.email, role: 'authenticated', aud: 'authenticated', aal: s.aal, amr, session_id: s.id, iat: t, exp: t + 3600 };
    return `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(payload))}.c3RhbmQtaW4`;
  }
  world.newSession = ({ aal = 'aal1', signedInAt = now() } = {}) => {
    const s = { id: randomUUID(), aal, signedInAt, codeAt: aal === 'aal2' ? signedInAt : null, refresh: `stand-in-${randomUUID()}` };
    world.sessions.set(s.id, s);
    return s;
  };
  world.sessionOut = (s) => {
    s.refresh = `stand-in-${randomUUID()}`;
    return { access_token: token(s), refresh_token: s.refresh, token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, user: userOut() };
  };
  /** The caller's session from its token, or null when it has ended (or isn't this account's). */
  const callerOf = (headers) => {
    const c = claimsOf(String(headers.authorization || '').replace(/^Bearer\s+/i, ''));
    return { claims: c, session: c && c.sub === world.user.id ? world.sessions.get(c.session_id) || null : null };
  };
  /** 055's _coach_auth_ended (053's check, as fixed on 21 Nov, and the recovery code's marker): null, 'reset', 'recovery' or 'session'. */
  const endedBy = (claims) => {
    const times = (claims?.amr || []).map((m) => Number(m.timestamp)).filter(Number.isFinite);
    const began = times.length ? Math.min(...times) : Number(claims?.iat);
    if (world.lastResetAt && Number.isFinite(began) && began * 1000 < world.lastResetAt) return 'reset';
    if (world.othersEndedAt && (claims?.session_id || null) !== world.keptSession && (!Number.isFinite(began) || began * 1000 < world.othersEndedAt)) return 'recovery';
    if (world.sqlReachesAuth && claims?.session_id && !world.sessions.has(claims.session_id)) return 'session';
    return null;
  };
  const sessionOk = (claims) => endedBy(claims) === null;
  world.state = (claims) => ({
    coach: true, owner: world.role === 'owner', owner_first_name: owner()?.display_first_name ?? null, turned_on_at: world.turnedOnAt,
    codes_left: world.left(), codes_total: world.codeRows.length, codes_made_at: world.codeRows.length ? '2026-12-02T10:05:00Z' : null,
    codes_saved: world.codesSaved && world.codeRows.length > 0, wait_seconds: Math.max(0, Math.ceil((world.waitUntil - Date.now()) / 1000)),
    recovered_at: world.recoveredAt, last_reset_at: world.lastResetAt ? new Date(world.lastResetAt).toISOString() : null, session_ok: sessionOk(claims),
    ended_by: endedBy(claims),
  });
  /** Removes factors and, when asked, sessions, where the database can reach them (053's _coach_auth_remove). */
  const sqlRemove = (sessions) => {
    if (!world.sqlReachesAuth) return { factors: null, sessions: null };
    const f = world.factors.length;
    world.factors = [];
    let s = null;
    if (sessions) { s = world.sessions.size; world.sessions.clear(); }
    return { factors: f, sessions: s };
  };

  // ---- 053's functions, as the caller (claims from their token). Answers { status, body }.
  const err = (status, code, message) => ({ status, body: { code, details: null, hint: null, message } });
  const ok = (body) => ({ status: 200, body });
  world.rpc = (name, args, claims) => {
    if (!world.ready) return err(404, 'PGRST202', 'Could not find the function in the schema cache');
    const me = claims?.sub;
    if (!me) return err(401, '42501', 'signed in only');
    const coachRow = world.coaches.find((c) => c.user_id === me && c.active);
    const isCoach = Boolean(coachRow) && world.role !== 'client';
    const aal2 = claims?.aal === 'aal2';
    if (name === 'is_owner') return ok(coachRow?.role === 'owner');
    if (name === 'coach_auth_state') return ok(isCoach && me === world.user.id ? world.state(claims) : { coach: false });
    if (name === 'coach_authenticator_reset') {
      if (coachRow?.role !== 'owner') return err(403, '42501', 'only the owner can reset an authenticator');
      if (!aal2) return ok({ status: 'needs_code' });
      const t = world.coaches.find((c) => c.id === args?.p_coach);
      if (!t || !t.active) return ok({ status: 'not_found' });
      if (t.user_id === me || t.role === 'owner') return ok({ status: 'self' });
      if (t.user_id !== world.user.id) return ok({ status: 'reset', codes_removed: 0, factors_removed: 0, sessions_removed: 0 });
      const codes = world.codeRows.length;
      world.codeRows = [];
      const removed = sqlRemove(true);
      Object.assign(world, { turnedOnAt: null, codesSaved: false, wrongRecovery: 0, waitUntil: 0, recoveredAt: null, lastResetAt: Date.now() });
      world.resets.push({ by: me, whom: t.user_id, at: new Date().toISOString(), codes, factors: removed.factors, sessions: removed.sessions });
      return ok({ status: 'reset', codes_removed: codes, factors_removed: removed.factors, sessions_removed: removed.sessions });
    }
    if (!isCoach || me !== world.user.id) return err(403, '42501', 'coaches only');
    // 053 since the break-it tester (21 Nov): a sign-in from before the reset changes nothing.
    const stale = () => !sessionOk(claims);
    if (name === 'coach_authenticator_on' && aal2 && stale()) return ok({ status: 'signed_out' });
    if (name === 'coach_recovery_codes_make' && aal2 && stale()) return ok({ status: 'signed_out' });
    if ((name === 'coach_recovery_codes_saved' || name === 'coach_recovery_code_use') && stale()) return ok({ status: 'signed_out' });
    if (name === 'coach_authenticator_on') {
      if (!aal2) return ok({ status: 'needs_code' });
      world.turnedOnAt = new Date().toISOString();
      world.wrongRecovery = 0;
      world.waitUntil = 0;
      return ok({ status: 'on', turned_on_at: world.turnedOnAt });
    }
    if (name === 'coach_recovery_codes_make') {
      if (!aal2) return ok({ status: 'needs_code' });
      const m26 = world.firstMake === 'm26' && world.madeSets === 0;
      const plains = m26 ? [...M26_CODES] : [];
      while (plains.length < 10) { const c = newCode(); if (!plains.includes(c)) plains.push(c); }
      world.madeSets += 1;
      world.codeRows = setOf(plains, { known: m26 });
      world.codesMade = true;
      world.codesSaved = false;
      world.wrongRecovery = 0;
      world.waitUntil = 0;
      return ok({ status: 'made', codes: plains.map((c) => `${c.slice(0, 4)}-${c.slice(4)}`), made_at: new Date().toISOString(), set_id: world.codeRows[0].set });
    }
    if (name === 'coach_recovery_codes_saved') {
      if (!world.codeRows.length) return ok({ status: 'none' });
      // 053 since the break-it tester (21 Nov): the tick names its set; one replaced since is refused.
      if (args?.p_set && args.p_set !== world.codeRows[0].set) return ok({ status: 'replaced' });
      world.codesSaved = true;
      return ok({ status: 'saved' });
    }
    if (name === 'coach_recovery_code_use') {
      if (world.waitUntil > Date.now()) return ok({ status: 'wait', wait_seconds: Math.ceil((world.waitUntil - Date.now()) / 1000) });
      const plain = plainOf(args?.p_code);
      const hit = /^[a-z0-9]{8}$/.test(plain) ? world.codeRows.find((r) => !r.usedAt && timingSafeEqual(hashOf(plain, r.salt), r.hash)) : null;
      if (!hit) {
        if (world.wrongRecovery + 1 >= 5) { world.wrongRecovery = 0; world.waitUntil = Date.now() + 30000; return ok({ status: 'wait', wait_seconds: 30, started: true }); }
        world.wrongRecovery += 1;
        return ok({ status: 'no_match', tries_left: 5 - world.wrongRecovery });
      }
      hit.usedAt = new Date().toISOString();
      const removed = sqlRemove(false);
      Object.assign(world, { wrongRecovery: 0, waitUntil: 0, recoveredAt: new Date().toISOString(), turnedOnAt: null });
      // 055: every other sign-in ends (the marker; and the sessions, where the database can reach them); this one carries on.
      const keep = claims?.session_id || null;
      let ended = null;
      if (keep) {
        Object.assign(world, { othersEndedAt: Date.now(), keptSession: keep });
        if (world.sqlReachesAuth) { ended = 0; for (const id of [...world.sessions.keys()]) if (id !== keep) { world.sessions.delete(id); ended += 1; } }
      }
      return ok({ status: 'used', codes_left: world.left(), factors_removed: removed.factors, others_ended: Boolean(keep), sessions_removed: ended });
    }
    return err(404, 'PGRST202', 'Could not find the function in the schema cache');
  };

  // ---- the server: the real api/coach-auth-reset.js, with Supabase answered by this world.
  const serverClient = (url, key, opts = {}) => {
    const bearer = String(opts?.global?.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
    const claims = claimsOf(bearer);
    const admin = key === LIVE_ENV.SUPABASE_SERVICE_ROLE_KEY;
    return {
      auth: {
        getUser: async (tok) => {
          const c = claimsOf(tok);
          if (!c?.sub) return { data: null, error: { message: 'invalid JWT', status: 401 } };
          if (c.sub === world.user.id && world.sqlReachesAuth && !world.sessions.has(c.session_id)) return { data: { user: null }, error: { code: 'session_not_found', status: 403 } };
          return { data: { user: { id: c.sub } }, error: null };
        },
        admin: { mfa: {
          listFactors: async ({ userId }) => (admin ? { data: { factors: userId === world.user.id ? world.factors.map((f) => ({ ...f })) : [] }, error: null } : { data: null, error: { status: 403 } }),
          deleteFactor: async ({ id, userId }) => {
            if (!admin) return { data: null, error: { status: 403 } };
            if (userId === world.user.id) { world.factors = world.factors.filter((f) => f.id !== id); world.keys.delete(id); }
            return { data: { id }, error: null };
          },
        } },
      },
      rpc: async (name, args) => {
        const out = world.rpc(name, args, claims);
        return out.status === 200 ? { data: out.body, error: null } : { data: null, error: out.body };
      },
      from: (table) => ({ select: () => ({ eq: (col, v) => ({ limit: async () => ({ data: table === 'coaches' ? world.coaches.filter((c) => c[col] === v) : [], error: null }) }) }) }),
    };
  };
  const handler = makeHandler({ createClient: serverClient });
  /** Runs the real server as the live site would. Answers { status, body }. */
  world.serve = async (body, authorization) => {
    const kept = Object.fromEntries(Object.keys(LIVE_ENV).map((k) => [k, process.env[k]]));
    Object.assign(process.env, LIVE_ENV);
    const out = { status: 0, body: null };
    const res = { status(n) { out.status = n; return this; }, setHeader() { return this; }, json(b) { out.body = b; return this; } };
    try {
      await handler({ method: 'POST', headers: { authorization }, body }, res);
    } finally {
      for (const [k, v] of Object.entries(kept)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
    world.server.push({ kind: body?.kind, status: out.status, ran: out.body?.ran ?? null });
    return out;
  };

  // ---- one browser context: a computer or phone, with its own sign-in.
  world.attach = async (ctx, { signedOut = false, aal = o.aal || 'aal1', fromBeforeReset = o.sessionOk === false } = {}) => {
    if (!signedOut) {
      const s = world.newSession({ aal, signedInAt: fromBeforeReset ? now() - 3600 : now() });
      if (fromBeforeReset) world.lastResetAt = Date.now() - 60000;
      await ctx.addInitScript((sess) => {
        try {
          if (!localStorage.getItem('clarity-portal-auth')) localStorage.setItem('clarity-portal-auth', JSON.stringify(sess));
          localStorage.setItem('clarity-colour-mode', localStorage.getItem('clarity-colour-mode') || 'device');
        } catch { /* blocked */ }
      }, world.sessionOut(s));
    }
    await ctx.route('**/*', (route) => world.answer(route));
  };

  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  world.answer = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const app = url.origin === new URL(APP).origin;
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (app && !url.pathname.startsWith('/api/')) return route.continue();
    if (world.down) return route.abort('internetdisconnected');
    const path = url.pathname;
    const method = req.method();
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    world.calls.push(`${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}`);
    const headers = req.headers();
    const { claims, session } = callerOf(headers);

    // ---- the server's reset.
    if (app && path === '/api/coach-auth-reset') {
      if (world.live) { const out = await world.serve(body, headers.authorization); return json(route, out.body, out.status); }
      if (body?.kind === 'recovered') { world.serverRecovered += 1; return json(route, { ok: true, ran: false, message: 'Removing the lost authenticator only works on the live site, so nothing has changed here.' }); }
      world.resets.push(body?.coachId || null);
      return json(route, { ok: true, ran: false, message: 'Resetting an authenticator only works on the live site, so nothing has changed here.' });
    }
    if (app) return json(route, { ok: true, sent: false });
    if (url.hostname !== `${TEST_REF}.supabase.co`) { world.calls.push(`blocked ${url.hostname}`); return route.abort(); }

    // ---- Supabase's own sign-in.
    if (path.endsWith('/auth/v1/token') && method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        if (String(body?.email || '').toLowerCase() !== world.user.email || body?.password !== world.password) {
          return json(route, { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
        }
        return json(route, world.sessionOut(world.newSession()));
      }
      if (grant === 'refresh_token') {
        const s = [...world.sessions.values()].find((x) => x.refresh === body?.refresh_token);
        if (!s) return json(route, { code: 'refresh_token_not_found', error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400);
        return json(route, world.sessionOut(s));
      }
      return json(route, { code: 'validation_failed', msg: 'Unsupported grant type' }, 400);
    }
    if (path.endsWith('/auth/v1/logout')) {
      const scope = url.searchParams.get('scope') || 'global';
      if (session) {
        if (scope === 'global') world.sessions.clear();
        else if (scope === 'local') world.sessions.delete(session.id);
        else for (const id of [...world.sessions.keys()]) if (id !== session.id) world.sessions.delete(id);
      }
      return route.fulfill({ status: 204, body: '' });
    }
    const ended = () => json(route, { code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' }, 403);
    if (path.endsWith('/auth/v1/user') && method === 'GET') return session ? json(route, userOut()) : ended();

    // ---- Supabase's MFA.
    if (path.endsWith('/auth/v1/factors') && method === 'POST') {
      if (!session) return ended();
      if (world.factors.some((f) => f.status === 'verified') && session.aal !== 'aal2') return json(route, { code: 'insufficient_aal', msg: 'AAL2 required to enroll a new factor' }, 403);
      const id = randomUUID();
      const key = world.enrolled === 0 ? world.secret : newKey();
      world.enrolled += 1;
      const at = new Date().toISOString();
      world.factors = [...world.factors, { id, factor_type: 'totp', status: 'unverified', friendly_name: body?.friendly_name || 'Authenticator', created_at: at, updated_at: at }];
      world.keys.set(id, key);
      const uri = `otpauth://totp/The%20Clarity%20Portal:${encodeURIComponent(world.user.email)}?secret=${key}&issuer=The%20Clarity%20Portal`;
      // Supabase's own picture has a white box; the page must never use it.
      return json(route, { id, type: 'totp', friendly_name: body?.friendly_name, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#fff"/></svg>', secret: key, uri } });
    }
    const f = /\/auth\/v1\/factors\/([^/]+)(\/(challenge|verify))?$/.exec(path);
    if (f) {
      if (!session) return ended();
      const factor = world.factors.find((x) => x.id === f[1]);
      if (!f[2] && method === 'DELETE') {
        if (factor?.status === 'verified' && session.aal !== 'aal2') return json(route, { code: 'insufficient_aal', msg: 'AAL2 required to unenroll a verified factor' }, 403);
        world.factors = world.factors.filter((x) => x.id !== f[1]);
        world.keys.delete(f[1]);
        return json(route, { id: f[1] });
      }
      if (!factor) return json(route, { code: 'mfa_factor_not_found', msg: 'Factor not found' }, 404);
      if (f[3] === 'challenge') return json(route, { id: randomUUID(), type: 'totp', expires_at: now() + 300 });
      if (f[3] === 'verify') {
        const key = world.keys.get(factor.id);
        const t = Date.now();
        const right = [t - 30000, t, t + 30000].some((at) => totp(key, at) === String(body?.code || ''));
        if (!right) return json(route, { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422);
        factor.status = 'verified';
        session.aal = 'aal2';
        session.codeAt = now();
        return json(route, world.sessionOut(session));
      }
    }

    // ---- 053's functions (or "not there yet").
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path)?.[1];
    if (rpc && ['coach_auth_state', 'coach_authenticator_on', 'coach_recovery_codes_make', 'coach_recovery_codes_saved', 'coach_recovery_code_use', 'coach_authenticator_reset'].includes(rpc)) {
      const out = world.rpc(rpc, body, claims);
      return json(route, out.body, out.status);
    }
    // ---- the coach portal's own data, as 054 makes the database answer it.
    const table = /\/rest\/v1\/([a-z_]+)$/.exec(path)?.[1];
    if (world.coachData && ((rpc && COACH_RPC.test(rpc)) || (!rpc && table && COACH_TABLE.test(table)))) {
      // 054's coach_code_ok(): aal2, and not a sign-in from before the coach's last reset (the break-it tester, 22 Nov).
      const aal = claims?.aal === 'aal2' && session && sessionOk(claims) ? 'aal2' : 'aal1';
      if (aal !== 'aal2') {
        world.coachAnswers.push({ path, aal, gave: false });
        if (rpc) return json(route, { code: '42501', message: 'Give your 6-digit code to carry on.', details: null, hint: null }, 403);
        return json(route, method === 'GET' || method === 'HEAD' ? [] : { code: '42501', message: 'new row violates row-level security policy' }, method === 'GET' || method === 'HEAD' ? 200 : 403);
      }
      world.coachAnswers.push({ path, aal, gave: true });
      const row = { id: '00000000-0000-4000-8000-00000000d054', coach_id: MAYA_COACH, name: COACH_DATA_MARKER, title: COACH_DATA_MARKER, created_at: '2026-12-02T10:00:00Z' };
      return json(route, rpc ? [row] : (method === 'GET' || method === 'HEAD' ? [row] : [row]), method === 'GET' || rpc ? 200 : 201);
    }
    if (path.includes('/rest/v1/coaches') && world.role === 'client') return json(route, []);
    if (path.includes('/rest/v1/coaches')) {
      const mine = world.coaches.find((c) => c.user_id === world.user.id);
      return json(route, mine ? [{ ...mine }] : []);
    }
    if (path.includes('/rest/v1/')) {
      if (method === 'GET' || method === 'HEAD') return json(route, []);
      if (rpc) return json(route, null);
      return json(route, [], 201);
    }
    return json(route, {});
  };
  return world;
}

/**
 * B's first shape, kept: a world and one context attached to it.
 * @param {import('playwright').BrowserContext} ctx
 */
export async function coachWorld(ctx, o = {}) {
  const world = makeWorld(o);
  await world.attach(ctx, { signedOut: Boolean(o.signedOut) });
  return world;
}
