// The three scheduled routes refuse anyone but the scheduler plainly (Tim, 25 Nov 2026): with no CRON_SECRET header,
// a wrong one, or CRON_SECRET unset or too short on the server, the answer is 401 { error: 'not_allowed' } on every
// deployment (production, preview, development, a developer's machine), never a body with `sent` in it ({"sent":0} in a
// browser read as if the job had run). After the right secret each route behaves as before. Each is called through the
// real router (api/scheduled.js), the way vercel.json's rewrite reaches it; nothing hosted is asked anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import scheduled from '../../api/scheduled.js';

const SECRET = 'invented-cron-secret-0123456789';
const ROUTES = ['coach-reminders', 'workshop-emails', 'billing-nightly'];
const DEPLOYMENTS = ['production', 'preview', 'development', undefined];
const CLEARED = ['VERCEL', 'VERCEL_ENV', 'CRON_SECRET', 'RESEND_API_KEY', 'COACH_EMAIL_FROM', 'GUEST_EMAIL_FROM', 'ALIGNMENT_EMAIL_FROM',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'STRIPE_SECRET_KEY'];

async function call(route, { env = {}, headers = {}, method = 'GET' } = {}) {
  const saved = { ...process.env };
  for (const k of CLEARED) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, setHeader() { return this; }, json(b) { this.body = b; return this; } };
  try {
    await scheduled({ method, headers, query: { __route: route } }, res);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  return res;
}

const refused = (r, why) => {
  assert.equal(r.code, 401, why);
  assert.deepEqual(r.body, { error: 'not_allowed' }, why);
  assert.ok(!JSON.stringify(r.body).includes('sent'), `${why}: never a body with sent in it`);
};

for (const route of ROUTES) {
  test(`${route}: no header, a wrong one, or no usable CRON_SECRET is a plain 401 on every deployment`, async () => {
    for (const VERCEL_ENV of DEPLOYMENTS) {
      const where = `${route} on ${VERCEL_ENV ?? 'a developer machine'}`;
      const env = { VERCEL_ENV, CRON_SECRET: SECRET };
      refused(await call(route, { env }), `${where}, no header`);
      refused(await call(route, { env, headers: { authorization: 'Bearer wrong-secret-0123456789' } }), `${where}, a wrong secret`);
      refused(await call(route, { env, headers: { authorization: SECRET } }), `${where}, the secret without Bearer`);
      // CRON_SECRET unset on the server: nobody is the scheduler, whatever they send.
      for (const authorization of ['Bearer ', 'Bearer undefined', `Bearer ${SECRET}`]) {
        refused(await call(route, { env: { VERCEL_ENV }, headers: { authorization } }), `${where}, CRON_SECRET unset, ${JSON.stringify(authorization)}`);
      }
      // Set but too short to be a secret.
      refused(await call(route, { env: { VERCEL_ENV, CRON_SECRET: 'short' }, headers: { authorization: 'Bearer short' } }), `${where}, CRON_SECRET too short`);
      refused(await call(route, { env: { VERCEL_ENV, CRON_SECRET: '' }, headers: { authorization: 'Bearer ' } }), `${where}, CRON_SECRET empty`);
    }
  });

  test(`${route}: a wrong method is refused without sent in the body`, async () => {
    const r = await call(route, { method: 'DELETE', env: { VERCEL_ENV: 'production', CRON_SECRET: SECRET }, headers: { authorization: `Bearer ${SECRET}` } });
    assert.deepEqual([r.code, r.body], [405, { error: 'method_not_allowed' }]);
  });
}

test('after the right secret each route answers as before', async () => {
  const headers = { authorization: `Bearer ${SECRET}` };
  for (const route of ['coach-reminders', 'workshop-emails']) {
    // A preview never sends and asks nothing; the live site without its keys says so and asks nothing.
    let r = await call(route, { env: { VERCEL_ENV: 'preview', CRON_SECRET: SECRET }, headers });
    assert.deepEqual([r.code, r.body], [200, { sent: 0, reason: 'preview' }], route);
    r = await call(route, { env: { VERCEL_ENV: 'production', CRON_SECRET: `${SECRET}\n` }, headers });
    assert.deepEqual([r.code, r.body], [200, { sent: 0, reason: 'setup' }], `${route}: a secret pasted with a new line is the same secret`);
  }
  const r = await call('billing-nightly', { env: { VERCEL_ENV: 'production', CRON_SECRET: SECRET }, headers });
  assert.deepEqual([r.code, r.body], [200, { ok: false, reason: 'not_connected' }], 'billing-nightly without the server key says so');
});
