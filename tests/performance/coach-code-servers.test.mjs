// The break-it tester's checks of the server functions that act for a coach
// (Phase 6a run 6, migration 054): every one, on the live site with every
// key set, asked with no sign-in, a sign-in at aal1, a forged "aal2" token
// that Supabase never signed, and a real aal2 sign-in from before the
// owner's reset (which 054's database now refuses). None of them may reach
// Google, Zoom, Resend or the server's own key, and none may answer with
// anyone's data. Everything is a stand-in: nothing leaves this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import send from '../../api/_routes/coach-send.js';
import invite from '../../api/_routes/coach-invite.js';
import calendar from '../../api/_routes/coach-calendar.js';
import connect from '../../api/_routes/coach-calendar-connect.js';
import emailIn from '../../api/_routes/coach-email-in.js';
import reset from '../../api/_routes/coach-auth-reset.js';

const DB = 'https://db.example.invalid';
const COACH_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ENV = {
  VERCEL_ENV: 'production', SUPABASE_URL: DB, SUPABASE_ANON_KEY: 'anon-stand-in', SUPABASE_SERVICE_ROLE_KEY: 'service-stand-in',
  RESEND_API_KEY: 'resend-stand-in', COACH_EMAIL_FROM: 'coach@example.invalid',
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id', GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret-stand-in',
  ZOOM_ACCOUNT_ID: 'z-acc', ZOOM_CLIENT_ID: 'z-id', ZOOM_CLIENT_SECRET: 'z-secret',
  COACH_EMAIL_IN_SECRET: 'a-stand-in-secret-of-some-length', COACH_EMAIL_IN_DOMAIN: 'in.example.invalid',
};

// Tokens in Supabase's shape. Only a signature of "signed" is one Supabase made.
const token = (claims, sig = 'signed') => `h.${Buffer.from(JSON.stringify({ sub: USER_ID, role: 'authenticated', ...claims })).toString('base64url')}.${sig}`;
const claimsOf = (auth) => {
  const t = String(auth || '').replace(/^Bearer\s+/i, '');
  const [, payload, sig] = t.split('.');
  if (sig !== 'signed') return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
};

// The stand-in Supabase, answering as 054's database does: coach data only at
// aal2, and never for a sign-in from before a reset ("beforeReset").
function standIn() {
  const outside = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const headers = new Headers(init.headers || (typeof input === 'object' ? input.headers : undefined));
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.origin !== DB) { outside.push(`${url.host}${url.pathname}`); return json(500, {}); }
    const auth = headers.get('authorization') || '';
    if (headers.get('apikey') === ENV.SUPABASE_SERVICE_ROLE_KEY || auth.includes(ENV.SUPABASE_SERVICE_ROLE_KEY)) { outside.push(`service ${url.pathname}`); return json(500, {}); }
    const claims = claimsOf(auth);
    if (!claims) return json(401, { code: 'PGRST301', message: 'JWSError' });
    if (url.pathname === '/auth/v1/user') return json(200, { id: claims.sub, aud: 'authenticated', role: 'authenticated' });
    const codeOk = claims.aal === 'aal2' && !claims.beforeReset;
    const rpc = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.slice('/rest/v1/rpc/'.length) : null;
    if (rpc === 'my_coach_id') return json(200, codeOk ? COACH_ID : null);
    if (rpc === 'my_owner_coach_id' || rpc === 'is_owner') return json(200, rpc === 'is_owner' ? codeOk : (codeOk ? COACH_ID : null));
    if (rpc === 'coach_connections_mine') return json(200, codeOk ? [{ service: 'google_calendar', status: 'on' }] : []);
    if (rpc === 'coach_auth_state') return json(200, { coach: true });
    if (rpc) return codeOk ? json(200, null) : json(403, { code: '42501', message: 'permission denied' });
    // One's own coaches row reads at aal1 (054 keeps it for the sign-in screens); everything else is shut before the code.
    if (url.pathname === '/rest/v1/coaches') return json(200, [{ id: COACH_ID, user_id: USER_ID, active: true, role: 'owner', display_first_name: 'Tess' }]);
    return json(200, codeOk ? [] : []);
  };
  return { outside, fetchImpl };
}

async function ask(handler, { body, auth, method = 'POST' }) {
  const saved = { ...process.env };
  const savedFetch = globalThis.fetch;
  const { outside, fetchImpl } = standIn();
  Object.assign(process.env, ENV);
  globalThis.fetch = fetchImpl;
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, json(b) { this.body = b; }, redirect(c, u) { this.code = c; this.body = { redirect: u }; }, end() {} };
  try {
    await handler({ method, body, headers: auth ? { authorization: `Bearer ${auth}` } : {}, query: {} }, res);
  } finally {
    globalThis.fetch = savedFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  return { ...res, outside };
}

const FUNCTIONS = [
  ['coach-send (a recap)', send, { kind: 'recap', sessionId: OTHER }],
  ['coach-send (a workshop follow-up)', send, { kind: 'workshop_follow_up', workshopId: OTHER }],
  ['coach-invite', invite, { firstName: 'Mallory', email: 'mallory@example.invalid' }],
  ['coach-calendar (status)', calendar, { kind: 'status' }],
  ['coach-calendar (a Zoom meeting)', calendar, { service: 'zoom', kind: 'create', event: { topic: 'x' } }],
  ['coach-calendar (Google events)', calendar, { service: 'google_calendar', kind: 'list' }],
  ['coach-calendar-connect (start)', connect, { kind: 'start' }],
  ['coach-calendar-connect (disconnect)', connect, { kind: 'disconnect' }],
  ['coach-email-in (the owner\'s status)', emailIn, { kind: 'status' }],
  ['coach-auth-reset (reset)', reset, { kind: 'reset', coachId: OTHER }],
];
const CALLERS = [
  ['no sign-in', null],
  ['a sign-in at aal1', token({ aal: 'aal1' })],
  ['a forged aal2 (never signed)', token({ aal: 'aal2' }, 'forged')],
  ['a forged aal2 with no signature', token({ aal: 'aal2' }, '')],
  ['an aal1 sign-in claiming aal2 in its metadata', token({ aal: 'aal1', app_metadata: { aal: 'aal2' }, user_metadata: { aal: 'aal2' } })],
  ['a real aal2 sign-in from before the owner\'s reset', token({ aal: 'aal2', beforeReset: true })],
];

for (const [name, handler, body] of FUNCTIONS) {
  test(`${name}: refused without the code, and nothing reaches Google, Zoom, Resend or the server's key`, async () => {
    for (const [who, auth] of CALLERS) {
      const res = await ask(handler, { body, auth });
      const refused = res.code >= 400 || res.body?.ok === false || res.body?.sent === false;
      assert.ok(refused, `${who}: refused (got ${res.code} ${JSON.stringify(res.body)})`);
      assert.deepEqual(res.outside, [], `${who}: nothing outside the caller's own database calls`);
      assert.doesNotMatch(JSON.stringify(res.body ?? null), /google\.com|zoom\.us|https:\/\/accounts|@example|Tess|11111111/, `${who}: no one's data, link or address in the answer`);
    }
  });
}

test('a real aal2 sign-in, given after any reset, still gets its answer (the stand-in is fair)', async () => {
  const res = await ask(calendar, { body: { kind: 'status' }, auth: token({ aal: 'aal2' }) });
  assert.deepEqual([res.code, res.body?.ok, res.body?.google_calendar], [200, true, true]);
  const start = await ask(connect, { body: { kind: 'start' }, auth: token({ aal: 'aal2' }) });
  assert.equal(start.code, 200);
  assert.match(start.body?.url || '', /^https:\/\/accounts\.google\.com\//);
});
