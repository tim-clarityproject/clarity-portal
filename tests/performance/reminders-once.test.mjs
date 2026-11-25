// The two reminder addresses that 058's scheduler asks every 15 minutes
// (tidy follow-up 3, Tim's answer to run 6's 17): two runs that overlap send
// each reminder once at most, because each is claimed in the database before
// anyone is emailed; and a preview asks nothing and sends nothing. Every
// call goes to a stand-in here (globalThis.fetch), never to a database or an
// email provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import reminders from '../../api/_routes/coach-reminders.js';
import workshopEmails, { isScheduler } from '../../api/_routes/workshop-emails.js';

const SECRET = 'a-long-enough-secret-for-the-test';
const LIVE = {
  VERCEL_ENV: 'production', CRON_SECRET: SECRET, SUPABASE_URL: 'https://standin.example', SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service', RESEND_API_KEY: 'resend', COACH_EMAIL_FROM: 'The Clarity Portal <hello@example.com>',
};
const ITEM = '11111111-1111-4111-8111-111111111111';
const WORKSHOP = '22222222-2222-4222-8222-222222222222';

/** A stand-in for the database and the email provider: the claims are one set, as 051's and 050's unique keys are. */
function standIn({ coming = [], due = [] } = {}) {
  const claimed = new Set();
  const emails = [];
  const asked = [];
  const pause = () => new Promise((r) => { setTimeout(r, 5); });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    asked.push(url);
    if (url.startsWith('https://api.resend.com/')) { emails.push(JSON.parse(init.body)); return json({ id: 'x' }); }
    const body = init.body ? JSON.parse(init.body) : {};
    await pause(); // both runs read before either claims
    if (url.includes('/rpc/cal_reminders_coming')) return json(coming);
    if (url.includes('/rpc/workshop_emails_due')) return json(due);
    if (url.includes('/rpc/cal_reminder_claim') || url.includes('/rpc/workshop_send_claim')) {
      const key = JSON.stringify(body);
      await pause();
      if (claimed.has(key)) return json(false);
      claimed.add(key);
      return json(true);
    }
    if (url.includes('/rpc/booking_mine')) return json({ call_name: 'Intro call' });
    return json([]);
  };
  return { fetch, emails, asked };
}

const res = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, setHeader() { return this; }, json(b) { this.body = b; } });

async function withStandIn(stand, env, run) {
  const savedFetch = globalThis.fetch;
  const savedEnv = { ...process.env };
  for (const k of ['VERCEL_ENV', 'CRON_SECRET', 'RESEND_API_KEY', 'COACH_EMAIL_FROM', 'GUEST_EMAIL_FROM', 'ALIGNMENT_EMAIL_FROM', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) delete process.env[k];
  Object.assign(process.env, env);
  globalThis.fetch = stand.fetch;
  try { return await run(); } finally {
    globalThis.fetch = savedFetch;
    for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
}

const ask = (handler) => { const r = res(); return handler({ method: 'GET', headers: { authorization: `Bearer ${SECRET}`, host: 'portal.theclarityproject.co.uk' }, query: {} }, r).then(() => r); };

test('two call-reminder runs that overlap send each reminder once', async () => {
  const startsAt = new Date(Date.now() + 50 * 60000).toISOString(); // inside the 1-hour reminder's window
  const coming = [
    { item_id: ITEM, kind: 'hour_before', occurrence_at: startsAt, person_email: 'client@example.com', person_zone: 'Europe/London', time_zone: 'Europe/London', coach_first_name: 'Tim', place_kind: 'zoom' },
  ];
  const stand = standIn({ coming });
  const [a, b] = await withStandIn(stand, LIVE, () => Promise.all([ask(reminders), ask(reminders)]));
  assert.deepEqual([a.code, b.code], [200, 200]);
  assert.equal(a.body.sent + b.body.sent, 1, 'one run sent it, the other found it claimed');
  assert.equal(stand.emails.length, 1, 'one email in all');
  // A third run later finds it claimed and sends nothing.
  const c = await withStandIn(stand, LIVE, () => ask(reminders));
  assert.equal(c.body.sent, 0);
  assert.equal(stand.emails.length, 1);
});

test('two workshop-reminder runs that overlap send each reminder once', async () => {
  const due = [
    { workshop_id: WORKSHOP, kind: 'hour_before', title: 'Leading under pressure', starts_at: new Date(Date.now() + 60 * 60000).toISOString(), time_zone: 'Europe/London', attendee_email: 'a@example.com' },
    { workshop_id: WORKSHOP, kind: 'hour_before', title: 'Leading under pressure', starts_at: new Date(Date.now() + 60 * 60000).toISOString(), time_zone: 'Europe/London', attendee_email: 'b@example.com' },
  ];
  const stand = standIn({ due });
  const [a, b] = await withStandIn(stand, LIVE, () => Promise.all([ask(workshopEmails), ask(workshopEmails)]));
  assert.equal(a.body.sent + b.body.sent, 1, 'the workshop’s reminder went once');
  assert.equal(stand.emails.length, 2, 'one email to each of the two people, never two each');
});

test('a preview asks nothing and sends nothing, even with every key and the right secret', async () => {
  for (const handler of [reminders, workshopEmails]) {
    for (const env of [{ ...LIVE, VERCEL_ENV: 'preview' }, { ...LIVE, VERCEL_ENV: 'development' }, { ...LIVE, VERCEL_ENV: '' }]) {
      const stand = standIn({ coming: [{ item_id: ITEM }], due: [{ workshop_id: WORKSHOP }] });
      const r = await withStandIn(stand, env, () => ask(handler));
      assert.deepEqual([r.code, r.body], [200, { sent: 0, reason: 'preview' }]);
      assert.deepEqual(stand.asked, [], 'nothing asked of the database or the email provider');
    }
  }
});

test('only the scheduler\'s exact header is let in (break-it tester, tidy follow-up 3)', () => {
  const ok = `Bearer ${SECRET}`;
  assert.equal(isScheduler(ok, SECRET), true);
  assert.equal(isScheduler(ok, `${SECRET}\n`), true, 'a secret pasted into Vercel with a new line at its end is the same secret');
  assert.equal(isScheduler(ok, `  ${SECRET} `), true);
  for (const header of [undefined, null, '', 'Bearer', 'Bearer ', SECRET, `bearer ${SECRET}`, `Bearer  ${SECRET}`, `Bearer ${SECRET} `, `Bearer ${SECRET}x`,
    `Bearer ${SECRET.slice(0, -1)}`, `Basic ${SECRET}`, [ok], { toString: () => ok }, `Bearer ${SECRET.replace('a', 'á')}`, `Bearer ${'x'.repeat(5000)}`]) {
    assert.equal(isScheduler(header, SECRET), false, `refused: ${JSON.stringify(String(header)).slice(0, 40)}`);
  }
  for (const secret of [undefined, null, '', 'short', '               ', 12345678901234567890, `   short   \n`]) {
    assert.equal(isScheduler(`Bearer ${secret}`, secret), false, `no usable secret set: ${JSON.stringify(secret)}`);
    assert.equal(isScheduler('Bearer ', secret), false);
  }
});

test('a wrong or missing secret on the live site asks the database nothing and sends nothing', async () => {
  for (const handler of [reminders, workshopEmails]) {
    for (const authorization of [undefined, 'Bearer wrong', `Bearer ${SECRET}x`]) {
      const stand = standIn({ coming: [], due: [] });
      const r = await withStandIn(stand, LIVE, () => { const out = res(); return handler({ method: 'GET', headers: authorization ? { authorization } : {}, query: {} }, out).then(() => out); });
      assert.deepEqual([r.code, r.body, stand.asked.length, stand.emails.length], [401, { error: 'not_allowed' }, 0, 0]);
    }
    const stand = standIn();
    const r = await withStandIn(stand, { ...LIVE, CRON_SECRET: '' }, () => { const out = res(); return handler({ method: 'GET', headers: { authorization: 'Bearer ' }, query: {} }, out).then(() => out); });
    assert.deepEqual([r.code, stand.asked.length], [401, 0], 'no secret set on the live site: nobody is the scheduler');
  }
});

test('follow-up 5: the scheduled routes ask for CRON_SECRET before anything else, live or preview', async () => {
  const routes = { reminders: (await import('../../api/_routes/coach-reminders.js')).default, workshops: (await import('../../api/_routes/workshop-emails.js')).default };
  const keep = { ...process.env };
  const call = async (fn, headers = {}) => {
    const res = { code: 0, body: null, status(c) { this.code = c; return this; }, setHeader() { return this; }, json(b) { this.body = b; return this; } };
    await fn({ method: 'GET', headers }, res);
    return res;
  };
  try {
    for (const vercelEnv of ['production', 'preview']) {
      process.env.VERCEL_ENV = vercelEnv;
      process.env.CRON_SECRET = 'invented-cron-secret-0123456789';
      for (const [name, fn] of Object.entries(routes)) {
        const none = await call(fn);
        assert.deepEqual([none.code, none.body], [401, { error: 'not_allowed' }], `${name} on ${vercelEnv}, no secret: 401 and nothing more`);
        assert.equal((await call(fn, { authorization: 'Bearer wrong-secret-0123456789' })).code, 401, `${name} on ${vercelEnv}, wrong secret`);
      }
      delete process.env.CRON_SECRET;
      for (const fn of Object.values(routes)) assert.equal((await call(fn, { authorization: 'Bearer ' })).code, 401, 'no secret set: never let in');
    }
    // With the secret on a preview: it says so, and asks the database nothing.
    process.env.VERCEL_ENV = 'preview';
    process.env.CRON_SECRET = 'invented-cron-secret-0123456789';
    const ok = await call(routes.reminders, { authorization: 'Bearer invented-cron-secret-0123456789' });
    assert.deepEqual([ok.code, ok.body], [200, { sent: 0, reason: 'preview' }]);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});
