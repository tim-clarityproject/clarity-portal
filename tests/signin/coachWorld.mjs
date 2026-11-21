// A coach's sign-in, stood in whole (Phase 6a run 5): nothing reaches the
// test project or anything hosted. An invented associate, Maya, with an
// invented session; Supabase's own MFA calls (the account's factors, enrol,
// challenge, verify, unenrol, the token), migration 053's functions and the
// server's reset (/api/coach-auth-reset) are all answered here, shaped as
// the real ones answer. No real authenticator is ever enrolled, no email is
// sent, and no key, code or token is printed.
//
//   const world = await coachWorld(context, { factor: 'verified', aal: 'aal1', ready: true })
//   world.calls       what the page asked for (never a code or a token)
//   world.codes       the plain recovery codes in force (stand-in only)
//   world.goodCode    the 6-digit code the stand-in accepts
//   world.secret      the stand-in set-up key (an invented base-32 key)
import { randomUUID } from 'node:crypto';
import { APP, TEST_REF } from './shared.mjs';

const b64u = (text) => Buffer.from(text, 'utf8').toString('base64url');
export const MAYA = { id: '00000000-0000-4000-8000-00000000c0a1', email: 'maya.collins@harbourlane.co', first: 'Maya' };
export const OWNER = { id: '00000000-0000-4000-8000-00000000c0a0', first: 'Tim' };
// M26's own invented codes and key.
export const M26_CODES = ['k7q29fmd', 'x3vpr8tn', 'b6wh2jcq', 'm9zet4ra', 'p2nd7wkf', 'c8yt3hsm', 'r5gq6vbe', 'h4mj9xpd', 'w7tc2nzk', 'f3rb8qyh'];
export const M26_KEY = 'JBSWY3DPEHPK3PXP';

function token(user, aal, sessionId) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', aal, amr: aal === 'aal2' ? [{ method: 'totp', timestamp: now }, { method: 'password', timestamp: now - 5 }] : [{ method: 'password', timestamp: now }], session_id: sessionId, iat: now, exp: now + 3600 };
  return `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(payload))}.c3RhbmQtaW4`;
}

/**
 * @param {import('playwright').BrowserContext} ctx
 * @param {{ factor?: 'none'|'verified', aal?: 'aal1'|'aal2', ready?: boolean, role?: 'coach'|'owner'|'client', signedOut?: boolean,
 *   codesLeft?: number, codesMade?: boolean, codesSaved?: boolean, turnedOnAt?: string|null, sessionOk?: boolean, offline?: boolean }} o
 */
export async function coachWorld(ctx, o = {}) {
  const world = {
    calls: [],
    secret: M26_KEY,
    goodCode: '246810',
    ready: o.ready !== false,
    role: o.role || 'coach',
    aal: o.aal || 'aal1',
    sessionId: randomUUID(),
    factors: o.factor === 'verified' ? [{ id: '00000000-0000-4000-8000-0000000000f1', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator', created_at: '2026-12-02T10:00:00Z', updated_at: '2026-12-02T10:00:00Z' }] : [],
    codes: M26_CODES.map((c, i) => ({ code: c, used: i < 10 - (o.codesLeft ?? 10) })),
    codesMade: o.codesMade ?? true,
    codesSaved: o.codesSaved !== false,
    turnedOnAt: o.turnedOnAt === undefined ? (o.factor === 'verified' ? '2026-12-02T10:00:00Z' : null) : o.turnedOnAt,
    sessionOk: o.sessionOk !== false,
    wrongRecovery: 0,
    waitUntil: 0,
    down: Boolean(o.offline),
    enrolled: 0,
    madeSets: 0,
    resets: [],
    serverRecovered: 0,
  };
  const user = () => ({
    id: MAYA.id, aud: 'authenticated', role: 'authenticated', email: MAYA.email, email_confirmed_at: '2026-11-01T09:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { first_name: MAYA.first, terms_accepted: true },
    identities: [{ provider: 'email', identity_data: { email: MAYA.email } }], factors: world.factors, created_at: '2026-11-01T09:00:00Z',
  });
  const session = () => ({ access_token: token(user(), world.aal, world.sessionId), refresh_token: `stand-in-${world.sessionId}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user() });
  world.session = session;
  world.left = () => world.codes.filter((c) => !c.used).length;
  world.state = () => ({
    coach: true, owner: world.role === 'owner', owner_first_name: OWNER.first, turned_on_at: world.turnedOnAt,
    codes_left: world.left(), codes_total: world.codesMade ? world.codes.length : 0, codes_made_at: world.codesMade ? '2026-12-02T10:05:00Z' : null,
    codes_saved: world.codesSaved, wait_seconds: Math.max(0, Math.ceil((world.waitUntil - Date.now()) / 1000)), recovered_at: null, last_reset_at: null, session_ok: world.sessionOk,
  });

  // The session on the device, as Supabase keeps it (none when `signedOut`: the page signs in itself).
  if (!o.signedOut) await ctx.addInitScript((s) => {
    try {
      if (!localStorage.getItem('clarity-portal-auth')) localStorage.setItem('clarity-portal-auth', JSON.stringify(s));
      localStorage.setItem('clarity-colour-mode', localStorage.getItem('clarity-colour-mode') || 'device');
    } catch { /* blocked */ }
  }, session());

  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const notThere = (route) => json(route, { code: 'PGRST202', details: null, hint: null, message: 'Could not find the function in the schema cache' }, 404);

  await ctx.route('**/*', async (route) => {
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
    const seen = `${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}`;
    world.calls.push(seen);

    // ---- the server's reset (never the live site here: nothing changes).
    if (app && path === '/api/coach-auth-reset') {
      if (body?.kind === 'recovered') { world.serverRecovered += 1; return json(route, { ok: true, ran: false, message: 'Removing the lost authenticator only works on the live site, so nothing has changed here.' }); }
      world.resets.push(body?.coachId || null);
      return json(route, { ok: true, ran: false, message: 'Resetting an authenticator only works on the live site, so nothing has changed here.' });
    }
    if (app) return json(route, { ok: true, sent: false });
    if (url.hostname !== `${TEST_REF}.supabase.co`) { world.calls.push(`blocked ${url.hostname}`); return route.abort(); }

    // ---- Supabase's own sign-in and MFA.
    if (path.endsWith('/auth/v1/user') && method === 'GET') return json(route, user());
    if (path.endsWith('/auth/v1/token') && method === 'POST') return json(route, session());
    if (path.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
    if (path.endsWith('/auth/v1/factors') && method === 'POST') {
      if (world.factors.some((f) => f.status === 'verified') && world.aal !== 'aal2') return json(route, { code: 'insufficient_aal', msg: 'AAL2 required to enroll a new factor' }, 403);
      const id = randomUUID();
      world.enrolled += 1;
      world.factors = [...world.factors, { id, factor_type: 'totp', status: 'unverified', friendly_name: body?.friendly_name || 'Authenticator', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
      const uri = `otpauth://totp/The%20Clarity%20Portal:${encodeURIComponent(MAYA.email)}?secret=${world.secret}&issuer=The%20Clarity%20Portal`;
      // Supabase's own picture has a white box; the page must never use it.
      return json(route, { id, type: 'totp', friendly_name: body?.friendly_name, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#fff"/></svg>', secret: world.secret, uri } });
    }
    const f = /\/auth\/v1\/factors\/([^/]+)(\/(challenge|verify))?$/.exec(path);
    if (f) {
      const factor = world.factors.find((x) => x.id === f[1]);
      if (!f[2] && method === 'DELETE') {
        if (factor?.status === 'verified' && world.aal !== 'aal2') return json(route, { code: 'insufficient_aal', msg: 'AAL2 required to unenroll a verified factor' }, 403);
        world.factors = world.factors.filter((x) => x.id !== f[1]);
        return json(route, { id: f[1] });
      }
      if (!factor) return json(route, { code: 'mfa_factor_not_found', msg: 'Factor not found' }, 404);
      if (f[3] === 'challenge') return json(route, { id: randomUUID(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
      if (f[3] === 'verify') {
        if (body?.code !== world.goodCode) return json(route, { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422);
        factor.status = 'verified';
        world.aal = 'aal2';
        return json(route, session());
      }
    }

    // ---- 053's functions (or "not there yet").
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path)?.[1];
    if (rpc && rpc.startsWith('coach_') && ['coach_auth_state', 'coach_authenticator_on', 'coach_recovery_codes_make', 'coach_recovery_codes_saved', 'coach_recovery_code_use', 'coach_authenticator_reset'].includes(rpc)) {
      if (!world.ready) return notThere(route);
      if (rpc === 'coach_auth_state') return json(route, world.role === 'client' ? { coach: false } : world.state());
      if (rpc === 'coach_authenticator_on') {
        if (world.aal !== 'aal2') return json(route, { status: 'needs_code' });
        world.turnedOnAt = new Date().toISOString();
        return json(route, { status: 'on', turned_on_at: world.turnedOnAt });
      }
      if (rpc === 'coach_recovery_codes_make') {
        if (world.aal !== 'aal2') return json(route, { status: 'needs_code' });
        world.madeSets += 1;
        world.codes = M26_CODES.map((c) => ({ code: c, used: false }));
        world.codesMade = true;
        world.codesSaved = false;
        return json(route, { status: 'made', codes: M26_CODES.map((c) => `${c.slice(0, 4)}-${c.slice(4)}`), made_at: new Date().toISOString() });
      }
      if (rpc === 'coach_recovery_codes_saved') { if (!world.codesMade) return json(route, { status: 'none' }); world.codesSaved = true; return json(route, { status: 'saved' }); }
      if (rpc === 'coach_recovery_code_use') {
        if (world.waitUntil > Date.now()) return json(route, { status: 'wait', wait_seconds: Math.ceil((world.waitUntil - Date.now()) / 1000) });
        const hit = world.codes.find((c) => !c.used && c.code === body?.p_code);
        if (!hit) {
          world.wrongRecovery += 1;
          if (world.wrongRecovery >= 5) { world.wrongRecovery = 0; world.waitUntil = Date.now() + 30000; return json(route, { status: 'wait', wait_seconds: 30 }); }
          return json(route, { status: 'no_match', tries_left: 5 - world.wrongRecovery });
        }
        hit.used = true;
        world.wrongRecovery = 0;
        // The lost phone's factor comes off (053, where the database can).
        world.factors = world.factors.filter((x) => x.status !== 'verified');
        world.turnedOnAt = null;
        return json(route, { status: 'used', codes_left: world.left(), factors_removed: 1 });
      }
      return json(route, { status: 'reset' });
    }
    if (path.includes('/rest/v1/coaches') && world.role === 'client') return json(route, []);
    if (path.includes('/rest/v1/coaches')) return json(route, [{ id: '00000000-0000-4000-8000-0000000c0ac1', user_id: MAYA.id, role: world.role, active: true, display_first_name: MAYA.first }]);
    if (path.includes('/rest/v1/')) {
      if (method === 'GET' || method === 'HEAD') return json(route, []);
      if (rpc) return json(route, null);
      return json(route, [], 201);
    }
    return json(route, {});
  });
  return world;
}
